"""Preview offline del layout, sin navegador.

Acumula las aristas de forma aditiva en un buffer float y hace tone mapping,
que es exactamente lo que hará el blending aditivo de WebGL. Sirve para juzgar
el aspecto (¿filamentos o pelota?) sin montar el frontend.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

# Falso color astronómico: Hα / OIII / SII, rotando por comunidad.
PALETTE = np.array([
    [1.00, 0.32, 0.58], [0.30, 0.82, 0.78], [1.00, 0.70, 0.32],
    [0.55, 0.55, 1.00], [0.45, 0.95, 0.55], [0.95, 0.45, 0.95],
    [0.40, 0.70, 1.00], [1.00, 0.55, 0.40],
], np.float32)


def rot(yaw, pitch):
    cy, sy, cp, sp = np.cos(yaw), np.sin(yaw), np.cos(pitch), np.sin(pitch)
    return (np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], np.float32)
            @ np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]], np.float32))


def render(lang="es", W=1500, H=820, yaw=0.6, pitch=0.35, zoom=1.0,
           samples=14, exposure=1.0, out=None):
    d = ROOT / "data" / lang
    pos = np.load(d / "_pos.npy").astype(np.float32)
    es, ed = np.load(d / "_edges.npy")
    comm = np.load(d / "_comm.npy")

    P = pos @ rot(yaw, pitch).T
    radius = float(np.percentile(np.linalg.norm(P, axis=1), 98))
    cam = radius * 2.2
    z = np.maximum(P[:, 2] + cam, 1e-3)
    ok = (P[:, 2] + cam) > radius * 0.12

    # auto-encuadre: el percentil 97 del radio proyectado ocupa el 42% del lado
    ux, uy = P[:, 0] / z, P[:, 1] / z
    cx, cy = np.median(ux[ok]), np.median(uy[ok])
    rp = np.percentile(np.hypot(ux[ok] - cx, uy[ok] - cy), 97)
    f = min(W, H) * 0.42 * zoom / max(rp, 1e-6)

    sx = (ux - cx) * f + W / 2
    sy = -(uy - cy) * f + H / 2

    buf = np.zeros((H * W, 3), np.float32)
    col = PALETTE[comm % len(PALETTE)]

    # --- aristas, acumuladas aditivamente ---
    live = ok[es] & ok[ed]
    a, b = es[live], ed[live]
    t = np.linspace(0.0, 1.0, samples, dtype=np.float32)[None, :]
    px = sx[a][:, None] * (1 - t) + sx[b][:, None] * t
    py = sy[a][:, None] * (1 - t) + sy[b][:, None] * t
    ec = (col[a] + col[b]) * 0.5
    depth = np.clip(1.4 - (z[a] + z[b]) * 0.5 / (cam * 1.1), 0.12, 1.0)
    ew = (depth * 0.42 / samples)[:, None] * np.ones_like(t)

    xi, yi = np.round(px).astype(np.int32), np.round(py).astype(np.int32)
    inside = (xi >= 0) & (xi < W) & (yi >= 0) & (yi < H)
    flat = (yi * W + xi)[inside]
    wts = ew[inside]
    cc = np.repeat(ec, samples, axis=0).reshape(len(a), samples, 3)[inside]
    for ch in range(3):
        buf[:, ch] += np.bincount(flat, weights=wts * cc[:, ch], minlength=H * W)

    # --- nodos ---
    nx, ny = np.round(sx[ok]).astype(np.int32), np.round(sy[ok]).astype(np.int32)
    ins = (nx >= 0) & (nx < W) & (ny >= 0) & (ny < H)
    nflat = (ny * W + nx)[ins]
    nb = np.clip(1.5 - z[ok][ins] / (cam * 1.1), 0.15, 1.0) * 0.35
    for ch in range(3):
        buf[:, ch] += np.bincount(nflat, weights=nb * (0.55 + 0.45 * col[ok][ins][:, ch]),
                                  minlength=H * W)

    img = buf.reshape(H, W, 3)
    img = 1.0 - np.exp(-img * exposure * 5.0)          # tone map
    img = np.power(np.clip(img, 0, 1), 1 / 1.9)        # gamma
    img = (img * 255).astype(np.uint8)

    out = out or (ROOT / "data" / f"preview_{lang}.png")
    Image.fromarray(img).save(out)
    lit = (buf.sum(1) > 0.004).mean()
    print(f"preview → {out}  ({lit*100:.1f}% de píxeles con señal)")
    return out


if __name__ == "__main__":
    kw = dict(a.split("=") for a in sys.argv[2:] if "=" in a)
    render(sys.argv[1] if len(sys.argv) > 1 else "es",
           **{k: (float(v) if "." in v or k in ("yaw", "pitch", "zoom", "exposure")
                  else int(v)) for k, v in kw.items()})
