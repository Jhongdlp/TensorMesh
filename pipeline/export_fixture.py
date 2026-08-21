"""Fixture para validar el compute shader contra la implementación numpy.

Dos referencias:
  ref_k0    → 1 paso con K=0. Sin repulsión no hay azar, así que WGSL y numpy
              deben coincidir bit a bit (salvo error de coma flotante). Aísla el
              recorrido del CSR, la atracción y la integración.
  ref_full  → N pasos con K=24. El muestreo aleatorio difiere entre las dos
              implementaciones, así que aquí sólo se comparan métricas agregadas.
"""
import json
import sys
from pathlib import Path

import numpy as np

import build as B

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "fixture"

STEPS = 400
K = 24
PARAMS = dict(ks=1.0, kr=0.15, drag=0.90, dt=0.55, fmax=8.0, anneal=0.0)


def csr(es, ed, ew, n):
    fs = np.concatenate([es, ed])
    fd = np.concatenate([ed, es])
    fw = np.concatenate([ew, ew])
    o = np.argsort(fs, kind="stable")
    fs, fd, fw = fs[o], fd[o], fw[o]
    off = np.concatenate([[0], np.cumsum(np.bincount(fs, minlength=n))])
    return off.astype("<u4"), fd.astype("<u4"), fw.astype("<f4")


def vec4(p):
    out = np.zeros((len(p), 4), np.float32)
    out[:, :3] = p
    return out


def main(lang="es"):
    OUT.mkdir(parents=True, exist_ok=True)
    g = np.load(ROOT / "data" / lang / "_graph.npz", allow_pickle=True)
    X, es, ed, ew = g["X"], g["es"], g["ed"], g["ew"]
    n = X.shape[0]

    seed = B.pca_seed(X, spread=n ** (1 / 3) * 0.9)
    off, tgt, wt = csr(es, ed, ew, n)
    deg = np.bincount(np.concatenate([es, ed]), minlength=n).astype(np.float32) + 1.0
    mass = (deg / deg.mean()).astype("<f4")

    print(f"[fx] n={n} aristas={len(es)} csr={len(tgt)}")

    ref0, _ = B.force_layout(seed, es, ed, ew, n, 1, K=0, **PARAMS)
    print(f"[fx] ref_k0    listo · desplazamiento medio "
          f"{np.linalg.norm(ref0 - (seed - seed.mean(0)), axis=1).mean():.5f}")

    ref1, _ = B.force_layout(seed, es, ed, ew, n, STEPS, K=K,
                             **PARAMS, log_every=10 ** 9)
    el = np.sqrt(((ref1[ed] - ref1[es]) ** 2).sum(1)).mean()
    rad = np.percentile(np.linalg.norm(ref1, axis=1), 90)
    print(f"[fx] ref_full  listo · arista {el:.3f} · radio p90 {rad:.2f}")

    (OUT / "seed.bin").write_bytes(vec4(seed).tobytes())
    (OUT / "offsets.bin").write_bytes(off.tobytes())
    (OUT / "targets.bin").write_bytes(tgt.tobytes())
    (OUT / "weights.bin").write_bytes(wt.tobytes())
    (OUT / "mass.bin").write_bytes(mass.tobytes())
    (OUT / "ref_k0.bin").write_bytes(vec4(ref0).tobytes())
    (OUT / "ref_full.bin").write_bytes(vec4(ref1).tobytes())
    (OUT / "edges.bin").write_bytes(
        np.stack([es, ed]).astype("<u4").T.tobytes())

    (OUT / "meta.json").write_text(json.dumps({
        "lang": lang, "n": int(n), "edges": int(len(es)), "csr": int(len(tgt)),
        "steps": STEPS, "K": K, "scale": n / K,
        **PARAMS, "gravity": 0.0,
        "ref_full": {"edgeLen": float(el), "radiusP90": float(rad)},
    }, indent=2))
    print(f"[fx] escrito en {OUT}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "es")
