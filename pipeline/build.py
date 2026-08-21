"""Etapas 01-07 — de vectores fastText a binarios listos para la GPU.

Vertical slice: sin UMAP ni numba. La semilla del layout es PCA (numpy puro),
lo que además nos deja validar el algoritmo de fuerzas por muestreo negativo
antes de portarlo a WGSL.
"""
import json
import re
import sys
import time
from pathlib import Path

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import minimum_spanning_tree

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data"

# Palabras vacías: NO se eliminan, se marcan. El usuario las apaga en vivo.
STOP = {
    "es": """de la que el en y a los se del las un por con no una su para es al lo como mas pero
        sus le ya o este si porque esta entre cuando muy sin sobre tambien me hasta hay donde quien
        desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mi antes
        algunos que unos yo otro otras otra el tanto esa estos mucho quienes nada muchos cual poco
        ella estar estas algunas algo nosotros mis tu te ti tus ellas os mio mia son fue ser han
        habia era mas asi cada tras solo aun bien puede debe hacer tiene sido segun dos tres""",
    "en": """the of and to a in is it you that he was for on are with as his they be at one have
        this from or had by not but what some we can out other were all there when up use your how
        said an each she which do their time will way about many then them would like so these her
        has him two more could been now than who its into only over such most our any may who""",
}

WORD_RE = {
    "es": re.compile(r"^[a-záéíóúüñ]+$"),
    "en": re.compile(r"^[a-z]+$"),
}


def log(stage, msg):
    print(f"[{stage}] {msg}", flush=True)


# ---------------------------------------------------------------- 01 limpieza
def load_and_clean(lang, target_n):
    src = RAW / f"{lang}.vec"
    pattern = WORD_RE[lang]
    stop = set(STOP[lang].split())

    words, vecs, flags, ranks = [], [], [], []
    seen = set()
    with open(src, encoding="utf-8") as fh:
        for rank, line in enumerate(fh):
            head, _, rest = line.partition(" ")
            w = head.lower()
            if w in seen or not pattern.match(w) or len(w) < 2:
                continue
            seen.add(w)
            words.append(w)
            vecs.append(np.array(rest.split(), dtype=np.float32))
            flags.append(1 if w in stop else 0)
            ranks.append(min(rank, 65535))
            if len(words) >= target_n:
                break

    X = np.vstack(vecs)
    log("01", f"{len(words)} palabras limpias · {sum(flags)} marcadas como vacías")
    log("01", f"     primeras: {', '.join(words[:12])}")
    return words, X, np.array(flags, np.uint8), np.array(ranks, np.uint16)


# ------------------------------------------------------------ 02 normalización
def l2_normalize(X):
    n = np.linalg.norm(X, axis=1, keepdims=True)
    n[n == 0] = 1.0
    log("02", "normalizado L2 — la similitud coseno es ahora el producto escalar")
    return X / n


# ---------------------------------------------------------------- 03 grafo kNN
def knn(X, k, block=1024):
    n = X.shape[0]
    idx = np.empty((n, k), np.int32)
    sim = np.empty((n, k), np.float32)
    for s in range(0, n, block):
        e = min(s + block, n)
        S = X[s:e] @ X.T
        np.fill_diagonal(S[:, s:e], -2.0)  # nadie es su propio vecino
        part = np.argpartition(-S, k, axis=1)[:, :k]
        rows = np.arange(e - s)[:, None]
        vals = S[rows, part]
        order = np.argsort(-vals, axis=1)
        idx[s:e] = part[rows, order]
        sim[s:e] = vals[rows, order]
    log("03", f"kNN exacto k={k} sobre {n} palabras")
    return idx, sim


# --------------------------------------------------------------- 04 poda
def prune(idx, sim, n):
    k = idx.shape[1]
    src = np.repeat(np.arange(n, dtype=np.int32), k)
    dst = idx.ravel()
    w = sim.ravel()

    # k-NN mutuo: la arista vive solo si cada uno está en el top-k del otro.
    S, D = src.tolist(), dst.tolist()
    member = set(zip(S, D))
    keep = np.fromiter(((d, s) in member for s, d in zip(S, D)), bool, len(S))
    a, b = np.minimum(src, dst), np.maximum(src, dst)
    key = a.astype(np.int64) * n + b
    uniq, first = np.unique(key[keep], return_index=True)
    ms, md = a[keep][first], b[keep][first]
    mw = w[keep][first]
    log("04", f"k-NN mutuo: {len(ms)} aristas (de {len(src)} dirigidas)")

    # El k-NN mutuo fragmenta el grafo. El MST sobre el kNN completo garantiza
    # conectividad sin densificar: son las islas flotantes de la referencia.
    dist = np.clip(1.0 - w, 1e-4, None)
    g = coo_matrix((dist, (src, dst)), shape=(n, n))
    g = g.maximum(g.T)  # simetriza conservando la distancia
    mst = minimum_spanning_tree(g).tocoo()
    ts, td = np.minimum(mst.row, mst.col), np.maximum(mst.row, mst.col)
    tw = 1.0 - mst.data

    # unión, sin duplicar
    all_s = np.concatenate([ms, ts]).astype(np.int64)
    all_d = np.concatenate([md, td]).astype(np.int64)
    all_w = np.concatenate([mw, tw]).astype(np.float32)
    ukey, ufirst = np.unique(all_s * n + all_d, return_index=True)
    es, ed, ew = all_s[ufirst].astype(np.int32), all_d[ufirst].astype(np.int32), all_w[ufirst]

    deg = np.bincount(np.concatenate([es, ed]), minlength=n)
    log("04", f"+ MST ({mst.nnz} aristas) → {len(es)} únicas · grado medio {2*len(es)/n:.2f} "
              f"· mediana {int(np.median(deg))} · máx {deg.max()} · aislados {(deg==0).sum()}")
    return es, ed, ew


# ------------------------------------------------------- 05 comunidades (color)
def merge_small(lab, es, ed, ew, target):
    """La propagación de etiquetas sobre un grafo disperso fragmenta en cientos
    de grupos diminutos, y repartir ocho colores entre ellos promedia a gris.
    Fusionamos el más pequeño con su vecino mejor conectado hasta llegar a
    `target` regiones, que es lo que da bloques de color legibles."""
    from collections import defaultdict
    adj = defaultdict(lambda: defaultdict(float))
    sizes = defaultdict(int)
    for c in lab:
        sizes[int(c)] += 1
    for a, b, w in zip(lab[es], lab[ed], ew):
        a, b = int(a), int(b)
        if a != b:
            adj[a][b] += float(w)
            adj[b][a] += float(w)

    import heapq
    parent = {}
    alive = set(sizes)
    heap = [(sz, c) for c, sz in sizes.items()]
    heapq.heapify(heap)
    while len(alive) > target and heap:
        sz, c = heapq.heappop(heap)
        if c not in alive or sizes[c] != sz:
            continue                      # entrada obsoleta por una fusión previa
        cand = [(w, k) for k, w in adj[c].items() if k in alive]
        if not cand:
            continue                      # isla sin vecinos: se queda como está
        tgt = max(cand)[1]
        sizes[tgt] += sizes[c]
        for k, w in adj[c].items():
            if k == tgt or k not in alive:
                continue
            adj[tgt][k] += w
            adj[k][tgt] += w
            adj[k].pop(c, None)
        adj[tgt].pop(c, None)
        adj.pop(c, None)
        alive.discard(c)
        parent[c] = tgt
        heapq.heappush(heap, (sizes[tgt], tgt))

    def root(x):
        while x in parent:
            x = parent[x]
        return x
    return np.array([root(int(c)) for c in lab], np.int32)



def communities(es, ed, ew, n, iters=14, seed=0):
    order = np.argsort(np.concatenate([es, ed]), kind="stable")
    flat_s = np.concatenate([es, ed])[order]
    flat_d = np.concatenate([ed, es])[order]
    flat_w = np.concatenate([ew, ew])[order]
    off = np.concatenate([[0], np.cumsum(np.bincount(flat_s, minlength=n))]).astype(np.int64)

    # A escala de 50k, un np.bincount por nodo asignaría un array del tamaño del
    # vocabulario 700.000 veces. Con grado medio ~7 sale mucho más barato un dict
    # sobre listas nativas: indexar numpy elemento a elemento domina el tiempo.
    D, W, O = flat_d.tolist(), flat_w.tolist(), off.tolist()
    lab = list(range(n))
    csize = [1] * n
    rng = np.random.default_rng(seed)
    for it in range(iters):
        changed = 0
        for i in rng.permutation(n).tolist():
            a, b = O[i], O[i + 1]
            if a == b:
                continue
            acc = {}
            for j in range(a, b):
                l = lab[D[j]]
                acc[l] = acc.get(l, 0.0) + W[j]
            # Penalización por tamaño. Sin ella la propagación colapsa: en inglés
            # una comunidad se comió 20.807 de 50.000 nodos. Dividir por la raíz
            # del tamaño frena a las que ya son grandes sin impedir que crezcan.
            best = max(acc.items(), key=lambda kv: kv[1] / (csize[kv[0]] ** 0.5))[0]
            if best != lab[i]:
                csize[lab[i]] -= 1
                csize[best] += 1
                lab[i] = best
                changed += 1
        if changed == 0:
            break
    log("05", f"  propagación estabilizada en {it + 1} iteraciones")

    lab = np.array(lab, np.int32)
    _, lab = np.unique(lab, return_inverse=True)
    lab = merge_small(lab, es, ed, ew, target=28)
    _, lab = np.unique(lab, return_inverse=True)
    sizes = np.bincount(lab)
    big = np.argsort(-sizes)
    remap = np.empty(len(sizes), np.int32)
    remap[big] = np.arange(len(sizes))
    lab = remap[lab]
    log("05", f"{len(sizes)} comunidades · mayores: {sorted(sizes)[-6:][::-1]}")
    return np.minimum(lab, 254).astype(np.uint8), len(sizes)


# ------------------------------------------------------------- 06 layout
def pca_seed(X, spread):
    Xc = X - X.mean(0)
    _, vecs = np.linalg.eigh(Xc.T @ Xc)
    P = Xc @ vecs[:, -3:]
    return (P / P.std(0) * spread).astype(np.float32)


def force_layout(pos, es, ed, ew, n, epochs, K=24, ks=1.0, kr=0.15,
                 drag=0.90, dt=0.55, fmax=8.0, anneal=0.45, seed=0, log_every=150):
    """LinLog (Noack) con repulsión por muestreo negativo.

    Energía de Noack: E = Σ_aristas w·d − Σ_pares ln(d). De ahí sale atracción de
    magnitud constante (w) y repulsión de magnitud 1/d — es esa combinación, y no
    la de muelles clásicos, la que separa los clusters en vez de aplastarlos. La repulsión honesta es O(n²) — anvaka la
    resolvió con Barnes-Hut; aquí cada nodo se compara con K nodos al azar y se
    escala por n/K, dando un estimador insesgado en O(n). Este es el algoritmo
    que irá tal cual al compute shader.
    """
    pos = pos.copy()
    vel = np.zeros_like(pos)
    rng = np.random.default_rng(seed)

    deg = np.bincount(np.concatenate([es, ed]), minlength=n).astype(np.float32) + 1.0
    mass = deg / deg.mean()
    scale = n / K if K else 0.0   # K=0 desactiva la repulsión (test determinista)
    hist = []

    for ep in range(epochs):
        # recocido: la simulación viva no se enfría, pero el estado precalculado sí
        a = 1.0 if ep < epochs * (1 - anneal) else \
            max(0.0, (epochs - ep) / (epochs * anneal))
        force = np.zeros_like(pos)

        # atracción LinLog a lo largo de las aristas
        d = pos[ed] - pos[es]
        dist = np.sqrt((d * d).sum(1)) + 1e-6
        f = d * (ks * ew / dist)[:, None]   # LinLog: magnitud constante = w
        for ax in range(3):
            force[:, ax] += np.bincount(es, weights=f[:, ax], minlength=n)
            force[:, ax] -= np.bincount(ed, weights=f[:, ax], minlength=n)

        # repulsión: K muestras negativas por nodo, ponderada por masa
        samp = rng.integers(0, n, size=(n, K))
        dv = pos[:, None, :] - pos[samp]
        d2 = (dv * dv).sum(2) + 0.05
        coef = kr * scale * mass[:, None] * mass[samp] / d2
        force += (dv * coef[:, :, None]).sum(1)

        fn = np.linalg.norm(force, axis=1, keepdims=True)
        force *= np.minimum(1.0, fmax / (fn + 1e-9))

        vel = (vel + force * dt * a) * drag
        pos += vel * dt

        if ep % log_every == 0 or ep == epochs - 1:
            ke = float(np.linalg.norm(vel, axis=1).mean())
            el = float(np.sqrt(((pos[ed] - pos[es]) ** 2).sum(1)).mean())
            rad = float(np.percentile(np.linalg.norm(pos - pos.mean(0), axis=1), 95))
            hist.append((ep, ke, el))
            log("06", f"  época {ep:4d} · energía {ke:7.4f} · arista {el:6.3f} · radio {rad:7.2f}")

    pos -= pos.mean(0)
    return pos, hist


# ------------------------------------------------------------- 07 empaquetado
def pack(lang, words, pos, es, ed, ew, comm, n_comm, flags, ranks):
    d = OUT / lang
    d.mkdir(parents=True, exist_ok=True)
    n, m = len(words), len(es)

    peak = float(np.abs(pos).max())
    scale = 32000.0 / peak
    (d / "positions.bin").write_bytes(
        np.round(pos * scale).astype("<i2").tobytes())

    # CSR simétrico: offsets Uint32(n+1) | destinos Uint16(2m) | pesos Uint8(2m)
    fs = np.concatenate([es, ed])
    fd = np.concatenate([ed, es])
    fw = np.concatenate([ew, ew])
    order = np.argsort(fs, kind="stable")
    fs, fd, fw = fs[order], fd[order], fw[order]
    off = np.concatenate([[0], np.cumsum(np.bincount(fs, minlength=n))]).astype("<u4")
    assert n < 65536, "los destinos ya no caben en Uint16"
    (d / "edges.bin").write_bytes(
        off.tobytes()
        + fd.astype("<u2").tobytes()
        + np.clip(fw * 255, 0, 255).astype(np.uint8).tobytes())

    blob = "".join(words).encode("utf-8")
    lens = np.array([len(w.encode("utf-8")) for w in words], np.uint32)
    (d / "labels.bin").write_bytes(
        np.concatenate([[0], np.cumsum(lens)]).astype("<u4").tobytes() + blob)

    (d / "attrs.bin").write_bytes(
        comm.tobytes() + ranks.astype("<u2").tobytes() + flags.tobytes())

    meta = {
        "lang": lang, "nodes": n, "edges": m, "csr": 2 * m,
        "posScale": peak / 32000.0, "communities": n_comm,
        "stopwords": int(flags.sum()), "generated": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    (d / "meta.json").write_text(json.dumps(meta, indent=2))

    ship = sorted(f for f in d.iterdir() if not f.name.startswith("_"))
    total = sum(f.stat().st_size for f in ship)
    log("07", " · ".join(f"{f.name} {f.stat().st_size/1024:.1f} KB" for f in ship))
    log("07", f"total {total/1024:.0f} KB para {n} nodos "
              f"→ {total/n:.1f} bytes/nodo (referencia anvaka: 53)")
    return meta


# ----------------------------------------------------------------------- main
def main(lang="es", target=5000, k=10, epochs=1200):
    t0 = time.time()
    words, X, flags, ranks = load_and_clean(lang, target)
    X = l2_normalize(X)
    idx, sim = knn(X, k)
    es, ed, ew = prune(idx, sim, len(words))
    comm, n_comm = communities(es, ed, ew, len(words))
    (OUT / lang).mkdir(parents=True, exist_ok=True)
    np.savez(OUT / lang / "_graph.npz", X=X, es=es, ed=ed, ew=ew, comm=comm,
             flags=flags, ranks=ranks, words=np.array(words), n_comm=n_comm)
    seed = pca_seed(X, spread=len(words) ** (1 / 3) * 0.9)
    log("06", f"semilla PCA · dispersión {seed.std(0).round(2)}")
    pos, hist = force_layout(seed, es, ed, ew, len(words), epochs)
    meta = pack(lang, words, pos, es, ed, ew, comm, n_comm, flags, ranks)

    ke0, ke1 = hist[0][1], hist[-1][1]
    log("--", f"energía {ke0:.4f} → {ke1:.4f} "
              f"({'CONVERGE' if ke1 < ke0 * 0.5 else 'NO CONVERGE — revisar'})")
    log("--", f"terminado en {time.time()-t0:.1f}s")
    np.save(OUT / lang / "_pos.npy", pos)
    np.save(OUT / lang / "_edges.npy", np.stack([es, ed]))
    np.save(OUT / lang / "_comm.npy", comm)
    return meta


if __name__ == "__main__":
    args = sys.argv[1:]
    main(args[0] if args else "es",
         int(args[1]) if len(args) > 1 else 5000,
         10,
         int(args[2]) if len(args) > 2 else 600)
