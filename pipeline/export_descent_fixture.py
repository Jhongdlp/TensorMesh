"""Referencia numpy de la sala del descenso, para `web/test/descent.mjs`.

Existe por lo mismo que `export_fixture.py`: el shader necesita algo contra lo
que contrastarse que **no sea otra copia de sí mismo**. Un reimplementado en JS
dentro del propio test comparte con el shader los mismos malentendidos; numpy es
una implementación independiente y en otro lenguaje.

Lo que este fixture protege, en concreto:

  * el **orden** de recorte e integración — recortar después de multiplicar por
    `lr` no es lo mismo que recortar antes, y las dos versiones convergen, sólo
    que a sitios distintos;
  * que el recorte sea de la **norma** y no por componente;
  * los signos de los cinco gradientes, que tienen términos cruzados y se
    escriben mal con facilidad;
  * la **corrección de sesgo de Adam**, que es lo que todo el mundo se deja y
    que a un paso casi no se nota — a cuatrocientos, sí.

Todo va en float32 a propósito: la GPU no tiene float64, y una referencia en
doble precisión haría fallar el test por un motivo que no es un error.

    python3 pipeline/export_descent_fixture.py
"""
import json
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "fixture" / "descent"

N = 2048
STEPS_SHORT = 400
STEPS_LONG = 3000
SEED = 20260821

MU = np.float32(0.9)
B1 = np.float32(0.9)
B2 = np.float32(0.999)
EPS = np.float32(1e-8)
BIG = np.float32(1e9)

TAU = np.float32(2.0 * np.pi)


def f_rosenbrock(p):
    a = np.float32(1.0) - p[:, 0]
    b = p[:, 1] - p[:, 0] * p[:, 0]
    return a * a + np.float32(100.0) * b * b


def g_rosenbrock(p):
    b = p[:, 1] - p[:, 0] * p[:, 0]
    return np.stack([-np.float32(2.0) * (np.float32(1.0) - p[:, 0])
                     - np.float32(400.0) * p[:, 0] * b,
                     np.float32(200.0) * b], 1)


def f_himmelblau(p):
    a = p[:, 0] * p[:, 0] + p[:, 1] - np.float32(11.0)
    b = p[:, 0] + p[:, 1] * p[:, 1] - np.float32(7.0)
    return a * a + b * b


def g_himmelblau(p):
    a = p[:, 0] * p[:, 0] + p[:, 1] - np.float32(11.0)
    b = p[:, 0] + p[:, 1] * p[:, 1] - np.float32(7.0)
    return np.stack([np.float32(4.0) * p[:, 0] * a + np.float32(2.0) * b,
                     np.float32(2.0) * a + np.float32(4.0) * p[:, 1] * b], 1)


def _beale_terms(p):
    x, y = p[:, 0], p[:, 1]
    return (np.float32(1.5) - x + x * y,
            np.float32(2.25) - x + x * y * y,
            np.float32(2.625) - x + x * y * y * y)


def f_beale(p):
    a, b, c = _beale_terms(p)
    return a * a + b * b + c * c


def g_beale(p):
    x, y = p[:, 0], p[:, 1]
    a, b, c = _beale_terms(p)
    y2 = y * y
    y3 = y2 * y
    return np.stack([
        np.float32(2.0) * a * (y - np.float32(1.0))
        + np.float32(2.0) * b * (y2 - np.float32(1.0))
        + np.float32(2.0) * c * (y3 - np.float32(1.0)),
        np.float32(2.0) * a * x + np.float32(4.0) * b * x * y
        + np.float32(6.0) * c * x * y2], 1)


def f_saddle(p):
    return p[:, 0] * p[:, 0] - p[:, 1] * p[:, 1]


def g_saddle(p):
    return np.stack([np.float32(2.0) * p[:, 0], -np.float32(2.0) * p[:, 1]], 1)


def f_rastrigin(p):
    return (np.float32(20.0)
            + p[:, 0] * p[:, 0] - np.float32(10.0) * np.cos(TAU * p[:, 0])
            + p[:, 1] * p[:, 1] - np.float32(10.0) * np.cos(TAU * p[:, 1]))


def g_rastrigin(p):
    k = np.float32(10.0) * TAU
    return np.stack([np.float32(2.0) * p[:, 0] + k * np.sin(TAU * p[:, 0]),
                     np.float32(2.0) * p[:, 1] + k * np.sin(TAU * p[:, 1])], 1)


# Tienen que coincidir con `web/src/rooms/descent/field.mjs`.
SURFACES = [
    ("rosenbrock", (-2.0, 2.0, -1.0, 3.0), f_rosenbrock, g_rosenbrock,
     {"sgd": (0.002, 20.0), "momentum": (0.002, 20.0), "adam": (0.05, 1e9)}),
    ("himmelblau", (-5.0, 5.0, -5.0, 5.0), f_himmelblau, g_himmelblau,
     {"sgd": (0.01, 20.0), "momentum": (0.002, 20.0), "adam": (0.05, 1e9)}),
    ("beale", (-4.5, 4.5, -4.5, 4.5), f_beale, g_beale,
     {"sgd": (0.005, 20.0), "momentum": (0.002, 20.0), "adam": (0.05, 1e9)}),
    ("saddle", (-2.0, 2.0, -2.0, 2.0), f_saddle, g_saddle,
     {"sgd": (0.02, 20.0), "momentum": (0.002, 20.0), "adam": (0.05, 1e9)}),
    ("rastrigin", (-5.12, 5.12, -5.12, 5.12), f_rastrigin, g_rastrigin,
     {"sgd": (0.005, 20.0), "momentum": (0.002, 20.0), "adam": (0.02, 1e9)}),
]
OPTS = ["sgd", "momentum", "adam"]


def confine(p, dom):
    """Jaula ancha, vez y media el dominio. Sólo muerde en la silla, que no
    tiene mínimo; sin ella el estado desborda a `inf`."""
    cx = np.float32((dom[0] + dom[1]) / 2)
    cy = np.float32((dom[2] + dom[3]) / 2)
    hx = np.float32((dom[1] - dom[0]) * 0.75)
    hy = np.float32((dom[3] - dom[2]) * 0.75)
    out = p.copy()
    out[:, 0] = np.clip(out[:, 0], cx - hx, cx + hx)
    out[:, 1] = np.clip(out[:, 1], cy - hy, cy + hy)
    return out.astype(np.float32)


def run(p0, grad, dom, opt, lr, clip, steps):
    lr = np.float32(lr)
    clip = np.float32(clip)
    p = p0.copy()
    m = np.zeros_like(p)
    v = np.zeros_like(p)
    for t in range(1, steps + 1):
        g = grad(p).astype(np.float32)
        gl = np.sqrt(g[:, 0] * g[:, 0] + g[:, 1] * g[:, 1]).astype(np.float32)
        # `np.where` y no una máscara in-place: así el camino de los que no se
        # recortan es literalmente el mismo que en el shader.
        s = np.where(gl > clip, clip / np.maximum(gl, np.float32(1e-20)),
                     np.float32(1.0)).astype(np.float32)
        g = (g * s[:, None]).astype(np.float32)
        if opt == "sgd":
            p = p - g * lr
        elif opt == "momentum":
            m = (m * MU - g * lr).astype(np.float32)
            p = p + m
        else:
            m = (m * B1 + g * (np.float32(1.0) - B1)).astype(np.float32)
            v = (v * B2 + g * g * (np.float32(1.0) - B2)).astype(np.float32)
            mh = m / (np.float32(1.0) - B1 ** np.float32(t))
            vh = v / (np.float32(1.0) - B2 ** np.float32(t))
            p = p - lr * mh / (np.sqrt(vh) + EPS)
        p = confine(p.astype(np.float32), dom)
    return p


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {"n": N, "stepsShort": STEPS_SHORT, "stepsLong": STEPS_LONG,
            "seed": SEED, "surfaces": [], "hyper": {
                "mu": float(MU), "b1": float(B1), "b2": float(B2), "eps": float(EPS)}}

    for key, dom, fn, gn, opts in SURFACES:
        rng = np.random.default_rng(SEED)
        p0 = np.empty((N, 2), np.float32)
        p0[:, 0] = rng.uniform(dom[0], dom[1], N)
        p0[:, 1] = rng.uniform(dom[2], dom[3], N)
        (OUT / f"seed_{key}.bin").write_bytes(p0.tobytes())

        # Un paso de SGD con lr=1 y sin recorte deja `p − g(p)` en la salida, de
        # modo que el test recupera el gradiente **exacto** del shader restando.
        # Es la red que vigila la copia de `f`/`g` que vive en `field.mjs`: sin
        # esto, las dos definiciones se desincronizan en silencio.
        (OUT / f"grad_{key}.bin").write_bytes(gn(p0).astype(np.float32).tobytes())
        # Y `f` en los mismos puntos, para la otra copia: la de `field.mjs`,
        # que decide la escala vertical del relieve. Sin esto, «la duplicación
        # está vigilada» sería una intención y no un hecho.
        (OUT / f"fval_{key}.bin").write_bytes(fn(p0).astype(np.float32).tobytes())

        entry = {"key": key, "dom": list(dom), "opt": {}}
        for opt in OPTS:
            lr, clip = opts[opt]
            short = run(p0, gn, dom, opt, lr, clip, STEPS_SHORT)
            (OUT / f"ref_{key}_{opt}.bin").write_bytes(short.tobytes())
            long_p = run(p0, gn, dom, opt, lr, clip, STEPS_LONG)
            fl = fn(long_p).astype(np.float64)
            entry["opt"][opt] = {
                "lr": float(lr), "clip": float(clip),
                "medianLoss": float(np.median(fl)),
                "meanAbs": float(np.abs(long_p).mean()),
            }
        meta["surfaces"].append(entry)

        line = "  ".join(
            f"{o}={entry['opt'][o]['medianLoss']:.4g}" for o in OPTS)
        print(f"  {key:11s} mediana de f tras {STEPS_LONG}: {line}")

    meta["generated"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    (OUT / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"fixture descenso → {OUT}  ({len(SURFACES)}×{len(OPTS)} combinaciones)")


if __name__ == "__main__":
    main()
