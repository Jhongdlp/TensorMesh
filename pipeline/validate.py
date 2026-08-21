"""Validación del pipeline: ¿los binarios siguen siendo fieles al .vec original?

Tres comprobaciones del plan. Si estas pasan, cualquier fallo posterior está en
el render, no en los datos.
"""
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent

NEIGHBOURS = {
    "es": {"rey": {"reina", "monarca", "príncipe", "trono", "reino"},
           "gato": {"perro", "gatos", "felino", "conejo", "ratón"},
           "lunes": {"martes", "miércoles", "jueves", "viernes", "domingo"},
           "madrid": {"barcelona", "sevilla", "valencia", "españa", "zaragoza"}},
    "en": {"king": {"queen", "prince", "monarch", "throne", "kingdom"},
           "cat": {"dog", "cats", "kitten", "feline", "pet"},
           "monday": {"tuesday", "wednesday", "thursday", "friday", "sunday"}},
}

ANALOGIES = {
    "es": [("rey", "hombre", "mujer", "reina"),
           ("madrid", "españa", "francia", "parís"),
           ("bueno", "mejor", "peor", "malo")],
    "en": [("king", "man", "woman", "queen"),
           ("paris", "france", "italy", "rome"),
           ("good", "better", "worse", "bad")],
}


def main(lang="es"):
    g = np.load(ROOT / "data" / lang / "_graph.npz", allow_pickle=True)
    X = g["X"]                                   # ya normalizado L2
    words = [str(w) for w in g["words"]]
    idx = {w: i for i, w in enumerate(words)}
    comm = np.load(ROOT / "data" / lang / "_comm.npy")
    fails = 0

    print(f"\n— vecinos conocidos ({lang}) " + "—" * 40)
    for w, expect in NEIGHBOURS[lang].items():
        if w not in idx:
            print(f"  {w:10} AUSENTE del vocabulario"); continue
        sim = X @ X[idx[w]]
        sim[idx[w]] = -2
        top = [words[i] for i in np.argsort(-sim)[:6]]
        hit = len(expect & set(top))
        ok = hit >= 1
        fails += not ok
        print(f"  {'OK ' if ok else '!! '}{w:10} → {', '.join(top)}")

    print(f"\n— analogías " + "—" * 47)
    for a, b, c, want in ANALOGIES[lang]:
        if not all(t in idx for t in (a, b, c)):
            print(f"  {a}-{b}+{c}: término ausente"); continue
        v = X[idx[a]] - X[idx[b]] + X[idx[c]]
        v /= np.linalg.norm(v)
        sim = X @ v
        for t in (a, b, c):
            sim[idx[t]] = -2
        top = [words[i] for i in np.argsort(-sim)[:5]]
        ok = want in top[:3]
        fails += not ok
        print(f"  {'OK ' if ok else '!! '}{a} − {b} + {c} → {', '.join(top)}"
              f"   (esperado: {want})")

    print(f"\n— coherencia de regiones " + "—" * 34)
    for c in range(min(5, comm.max() + 1)):
        members = [words[i] for i in np.where(comm == c)[0][:10]]
        print(f"  región {c:2d} ({(comm == c).sum():4d}): {', '.join(members)}")

    print(f"\n{'TODO OK' if fails == 0 else f'{fails} COMPROBACIONES FALLIDAS'}\n")
    return fails


if __name__ == "__main__":
    sys.exit(1 if main(sys.argv[1] if len(sys.argv) > 1 else "es") else 0)
