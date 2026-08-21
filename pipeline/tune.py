"""Bucle de iteración rápida sobre la etapa 06.

Reutiliza el grafo cacheado (_graph.npz) para no recalcular kNN, poda ni
comunidades en cada prueba. Uso:  python3 pipeline/tune.py es kr=0.006 epochs=1200
"""
import sys
from pathlib import Path

import numpy as np

import build as B
import preview as V

ROOT = Path(__file__).resolve().parent.parent


def run(lang="es", epochs=900, spread=0.9, render=True, **kw):
    g = np.load(ROOT / "data" / lang / "_graph.npz", allow_pickle=True)
    X, es, ed, ew = g["X"], g["es"], g["ed"], g["ew"]
    comm, flags, ranks = g["comm"], g["flags"], g["ranks"]
    words = [str(w) for w in g["words"]]
    n = len(words)

    seed = B.pca_seed(X, spread=n ** (1 / 3) * spread)
    B.log("06", f"n={n} aristas={len(es)} · " +
          " ".join(f"{k}={v}" for k, v in sorted(kw.items())) +
          f" epochs={epochs} spread={spread}")
    pos, hist = B.force_layout(seed, es, ed, ew, n, epochs, **kw)
    B.pack(lang, words, pos, es, ed, ew, comm, int(g["n_comm"]), flags, ranks)

    np.save(ROOT / "data" / lang / "_pos.npy", pos)
    np.save(ROOT / "data" / lang / "_edges.npy", np.stack([es, ed]))
    np.save(ROOT / "data" / lang / "_comm.npy", comm)

    ke0, ke1 = hist[0][1], hist[-1][1]
    B.log("--", f"energía {ke0:.4f} → {ke1:.4f} "
                f"({'ASENTADO' if ke1 < ke0 * 0.15 else 'AÚN EN MOVIMIENTO'})")
    if render:
        V.render(lang)
    return pos


if __name__ == "__main__":
    args = sys.argv[1:]
    lang = args[0] if args and "=" not in args[0] else "es"
    kw = {}
    for a in args:
        if "=" not in a:
            continue
        k, v = a.split("=")
        kw[k] = int(v) if k in ("epochs", "K") else float(v)
    run(lang, **kw)
