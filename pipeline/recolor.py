"""Recalcula solo las comunidades (etapa 05) y reempaqueta, sin rehacer el layout."""
import sys
from pathlib import Path
import numpy as np
import build as B

ROOT = Path(__file__).resolve().parent.parent

def run(lang):
    d = ROOT / "data" / lang
    g = np.load(d / "_graph.npz", allow_pickle=True)
    es, ed, ew = g["es"], g["ed"], g["ew"]
    words = [str(w) for w in g["words"]]
    pos = np.load(d / "_pos.npy")
    comm, n_comm = B.communities(es, ed, ew, len(words))
    np.save(d / "_comm.npy", comm)
    B.pack(lang, words, pos, es, ed, ew, comm, n_comm, g["flags"], g["ranks"])

if __name__ == "__main__":
    for l in sys.argv[1:]:
        print(f"═══ {l} ═══"); run(l)
