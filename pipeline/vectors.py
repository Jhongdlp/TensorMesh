"""Etapa 08 — publica los vectores 300D para que el navegador pueda comparar
dos palabras cualesquiera.

Existe por una razón concreta: `edges.bin` sólo guarda el coseno de las aristas
del kNN podado, así que la similitud entre *cualquier* par —«camello» contra
«inglaterra», que no son vecinos de nadie en común— no está en ningún sitio. Y
la regla del proyecto es que toda afirmación se calcula en 300D, no en la
galaxia. Sin este archivo, el comparador tendría que mentir.

Tres decisiones que hacen que 15 MB no cuesten 15 MB:

1. **int8, no float32.** Cuantización con escala **por vector** (`max|x|/127`).
   Medido sobre `data/es`, 200.000 pares al azar: error del coseno 0,00050 de
   media, 0,0017 en el percentil 99 y 0,0033 el peor. La ficha muestra dos
   decimales, así que el error queda por debajo de lo que se ve. Con una escala
   *global* el error sube ~5x (la mediana de `max|x|` es 0,19 pero el máximo es
   0,54: un puñado de vectores atípicos se llevaría todo el rango).

2. **La escala no se publica.** El coseno es invariante a escala y el cliente
   renormaliza al leer, así que el factor por vector sólo le hace falta al
   emisor. Eso deja el registro en 300 bytes exactos y sin cabecera: la palabra
   `i` empieza en `i * 300`. Un `Float32` de escala por fila habría metido un
   desalineado de 4 bytes en cada registro sin comprar nada.

3. **Registro contiguo.** Es lo que permite pedir una sola palabra con una
   petición `Range: bytes=i*300-(i*300+299)`: 300 bytes en vez de 15 MB. El
   archivo es grande en el servidor y diminuto en el cable.

Se ejecuta sobre `_graph.npz`, así que no recalcula ni kNN ni layout:

    python3 pipeline/vectors.py es en
"""
import json
import sys
import time
from pathlib import Path

import numpy as np

from build import VEC_DIMS as DIMS

ROOT = Path(__file__).resolve().parent.parent


def quantize(X):
    """int8 con escala por vector. Devuelve sólo los códigos: ver (2) arriba."""
    s = np.abs(X).max(1, keepdims=True) / 127.0
    s[s == 0] = 1.0
    return np.clip(np.rint(X / s), -127, 127).astype(np.int8)


def error(X, Q, pairs=200_000, seed=0):
    """Cuánto se desvía el coseno del cuantizado respecto al de float32.

    Se mide aquí y no en un cuaderno aparte porque es el número que autoriza a
    publicar el archivo: si un cambio de formato lo empeora, el pipeline lo dice
    en la misma corrida que lo produce."""
    D = Q.astype(np.float32)
    D /= np.linalg.norm(D, axis=1, keepdims=True)
    rng = np.random.default_rng(seed)
    a = rng.integers(0, len(X), pairs)
    b = rng.integers(0, len(X), pairs)
    e = np.abs(np.einsum("ij,ij->i", X[a], X[b]) - np.einsum("ij,ij->i", D[a], D[b]))
    return e.mean(), np.percentile(e, 99), e.max()


def run(lang):
    d = ROOT / "data" / lang
    g = np.load(d / "_graph.npz", allow_pickle=True)
    X = g["X"]
    n, dims = X.shape
    assert dims == DIMS, f"{dims} dimensiones: el lector del navegador espera {DIMS}"

    Q = quantize(X)
    (d / "vecs.bin").write_bytes(Q.tobytes())

    # `dims` viaja en meta.json porque el navegador necesita el tamaño del
    # registro antes de pedir su primer rango. Se parchea aquí además de
    # escribirse en `build.pack` para no obligar a rehacer el layout entero
    # cuando sólo se republican los vectores.
    mp = d / "meta.json"
    meta = json.loads(mp.read_text())
    if meta.get("dims") != DIMS:
        meta["dims"] = DIMS
        mp.write_text(json.dumps(meta, indent=2))

    med, p99, peor = error(X, Q)
    size = (d / "vecs.bin").stat().st_size
    print(f"[08] vecs.bin {size / 1e6:.1f} MB · {n} x {dims} int8 "
          f"· {DIMS} bytes por palabra en el cable")
    print(f"[08] error del coseno: medio {med:.5f} · p99 {p99:.5f} · máx {peor:.5f}")
    if peor > 0.005:
        print("[08] !! el peor error asoma en el segundo decimal — revisar la cuantización")
    return size


if __name__ == "__main__":
    t0 = time.time()
    for lang in sys.argv[1:] or ["es"]:
        print(f"═══ {lang} ═══")
        run(lang)
    print(f"[--] terminado en {time.time() - t0:.1f}s")
