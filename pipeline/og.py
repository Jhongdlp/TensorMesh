"""Tarjetas de enlace (Open Graph / Twitter) — 1200x630, una por página.

Lo que se ve al pegar el enlace en WhatsApp, X, LinkedIn, Slack o Discord no lo
decide el CSS de la página: lo decide un PNG/JPEG estático que el rastreador
descarga sin ejecutar una línea de JavaScript. Y aquí *todas* las salas son un
canvas WebGPU hidratado en cliente, así que sin este archivo el enlace se
comparte como un rectángulo gris con una URL debajo.

La tarjeta se compone de dos capas:

  1. la captura de la sala (`web/public/previews/*.png`, 1920x1080) recortada a
     cubrir el lienzo, y
  2. el mismo mueble tipográfico de la web —Space Grotesk y Space Mono, la
     tinta `#F2EFE9` sobre `#1C1D1F`— con un velo que se abre de izquierda a
     derecha para que el texto se lea sobre cualquier captura.

El velo no es decorativo: las capturas del atlas y del descenso son casi negras
por la izquierda pero la de K-Means tiene cúmulos claros justo ahí, y un título
blanco sin velo desaparecía encima. Se calcula por columnas, no por píxel: es
un degradado, no una caja, porque un borde recto de caja se ve como un recorte
mal hecho en la miniatura pequeña.

Todo el texto sale de `web/src/seo.json`, que es también lo que lee
`src/components/Seo.astro` para escribir las etiquetas. Una copia del título
aquí y otra allí se despegan en el primer cambio de nombre, y el fallo no se ve
en la web: se ve en el móvil de quien recibe el enlace.

    python3 pipeline/og.py            # todas
    python3 pipeline/og.py /hnsw      # sólo una

Salida: `web/public/og/<slug>.jpg` (JPEG y no PNG: WhatsApp descarta la
miniatura por encima de ~600 KB, y el degradado sobre una nebulosa es justo lo
que peor comprime un PNG).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
FONTS = ROOT / "pipeline" / "fonts"
OUT = WEB / "public" / "og"

W, H = 1200, 630            # el tamaño que piden Facebook, X y LinkedIn (1.91:1)
PAD = 76                    # margen izquierdo; el texto vive dentro de TEXT_W
TEXT_W = 660
INK = (242, 239, 233)
BG = (28, 29, 31)

# Cuánto se oscurece la captura, de izquierda a derecha. El 0,90 de la
# izquierda deja pasar lo justo para que se note que hay algo debajo del
# título; el 0,30 de la derecha es lo que hace que la sala siga siendo
# reconocible en una miniatura de 200 px.
VEIL_L, VEIL_R = 0.90, 0.26


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def track(draw, xy, text, fnt, fill, sp=0.0):
    """Dibuja con tracking. Pillow no lo tiene y las líneas en mayúsculas
    pequeñas —el `kicker`, el pie— se leen apelmazadas sin él."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + sp
    return x


def wrap(draw, text, fnt, width):
    lines, cur = [], ""
    for word in text.split():
        probe = f"{cur} {word}".strip()
        if draw.textlength(probe, font=fnt) <= width or not cur:
            cur = probe
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def veil(img):
    """Velo horizontal + una viñeta suave por abajo.

    Se hace en numpy y no con `Image.blend` porque el degradado va por columna:
    multiplicar por un solo alfa apagaría también la parte derecha, que es la
    que tiene que enseñar la sala."""
    a = np.asarray(img, np.float32) / 255.0
    x = np.linspace(0, 1, W, dtype=np.float32)
    # `smoothstep` entre 0,06 y 0,68 del ancho: la caída empieza detrás del
    # texto y termina antes del borde, así el título nunca pilla la zona clara.
    t = np.clip((x - 0.06) / 0.62, 0, 1)
    t = t * t * (3 - 2 * t)
    k = (VEIL_L + (VEIL_R - VEIL_L) * t)[None, :, None]

    # El pie (dominio y sello) cae sobre la parte baja de la captura, que en
    # la nebulosa y en HNSW es justo donde hay luz. Un suelo suave lo salva sin
    # cortar la escena.
    y = np.linspace(0, 1, H, dtype=np.float32)
    floor = (0.42 * np.clip((y - 0.60) / 0.40, 0, 1) ** 2)[:, None, None]

    bg = np.array(BG, np.float32) / 255.0
    out = a * (1 - k - floor) + bg * (k + floor)
    return Image.fromarray(np.clip(out * 255, 0, 255).astype(np.uint8))


def cover(src, zoom=1.0, focus=0.5):
    """Recorta a 1200x630. Las capturas son 16:9 y la tarjeta 1.91:1, así que
    se pierden 45 px de alto: arriba y abajo de estas escenas hay fondo.

    `zoom` y `focus` existen por las salas de sujeto pequeño y centrado —MCTS
    es un árbol de treinta nodos en mitad del negro, K-Means tres cúmulos—:
    a escala 1 el sujeto cae justo debajo del titular. Ampliando un poco y
    corriendo la ventana hacia la izquierda del original, el sujeto se va a la
    mitad derecha, que es la que la tarjeta deja libre."""
    im = Image.open(src).convert("RGB")
    s = max(W / im.width, H / im.height) * zoom
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    dx = round((im.width - W) * min(max(focus, 0.0), 1.0))
    dy = (im.height - H) // 2
    return im.crop((dx, dy, dx + W, dy + H))


def ui_text(img, page, site):
    """`layout: "ui"` — la captura con la marca y el título por la derecha.

    El velo va del revés que en las demás tarjetas: en una captura de la
    aplicación el lado izquierdo es el cajón, que es lo que se ha venido a
    enseñar, así que el texto se va al otro lado y el degradado se abre de
    derecha a izquierda. Es la misma pieza que `veil`, espejada, y no una
    caja: un borde recto sobre la nebulosa se lee como un recorte."""
    a = np.asarray(img, np.float32) / 255.0
    x = np.linspace(0, 1, W, dtype=np.float32)
    t = np.clip((0.98 - x) / 0.42, 0, 1)
    t = t * t * (3 - 2 * t)
    k = (0.86 * (1 - t))[None, :, None]
    bg = np.array(BG, np.float32) / 255.0
    img = Image.fromarray(np.clip((a * (1 - k) + bg * k) * 255, 0, 255).astype(np.uint8))

    d = ImageDraw.Draw(img)
    right = W - 64

    def flush(y, text, fnt, fill, sp=0.0):
        w = sum(d.textlength(c, font=fnt) + sp for c in text)
        track(d, (right - w, y), text, fnt, fill, sp)

    flush(52, "TENSORMESH", font("SpaceGrotesk-Bold.ttf", 26), INK, 1.2)

    lines = page["ogLines"]
    f_title = font("SpaceGrotesk-Bold.ttf", 54)
    y = H - 200 - (len(lines) - 2) * 58
    for ln in lines:
        flush(y, ln, f_title, INK)
        y += 58
    flush(y + 16, page["ogStamp"], font("SpaceGrotesk-Regular.ttf", 21), (178, 175, 168))
    return img


def card(page, site, out):
    src = WEB / "public" / page["preview"]

    # `layout: "raw"` — la captura manda y no se le escribe encima.
    #
    # Es lo que quiere una foto de producto: se ve el cajón izquierdo, la tira
    # de herramientas y la atribución, o sea que **es una aplicación y se
    # toca**, que es justo lo que una composición tipográfica no dice. El
    # título no se pierde: WhatsApp, X y LinkedIn lo escriben ellos debajo de
    # la imagen, sacado de `og:title`.
    #
    # La captura ya viene con la proporción de la tarjeta desde `test/shot.mjs`
    # —se toma en una ventana de 1200x630— porque el cajón se coloca respecto a
    # la ventana: recortar un 16:9 después lo dejaría partido.
    if page.get("layout") in ("raw", "ui"):
        img = cover(src, page.get("zoom", 1.0), page.get("focus", 0.5))
        if page.get("layout") == "ui":
            img = ui_text(img, page, site)
        out.parent.mkdir(parents=True, exist_ok=True)
        img.save(out, "JPEG", quality=88, optimize=True, progressive=True)
        return out

    img = veil(cover(src, page.get("zoom", 1.0), page.get("focus", 0.5)))
    d = ImageDraw.Draw(img)

    # ── marca, arriba a la izquierda ────────────────────────────────────────
    # El cuadrado es la rejilla de la portada reducida a un solo píxel: es lo
    # único que se reconoce a 200 px de ancho, cuando el nombre ya no se lee.
    d.rectangle([PAD, 62, PAD + 15, 77], fill=INK)
    f_brand = font("SpaceGrotesk-Bold.ttf", 27)
    x = track(d, (PAD + 27, 57), "TENSOR", f_brand, INK, 1.2)
    track(d, (x, 57), "MESH", font("SpaceGrotesk-Regular.ttf", 27),
          (242, 239, 233, 255), 1.2)

    # ── kicker + titular ────────────────────────────────────────────────────
    lines = page["ogLines"]
    size = 84 if len(lines) <= 2 else 72
    f_title = font("SpaceGrotesk-Bold.ttf", size)
    lh = round(size * 1.06)

    f_kick = font("SpaceMono-Bold.ttf", 19)
    block = len(lines) * lh + 34 + 22           # titular + hueco + kicker
    note_lines = wrap(d, page["ogNote"], font("SpaceGrotesk-Regular.ttf", 25), TEXT_W)
    block += 26 + len(note_lines) * 34

    top = (H - block) // 2 + 14                 # +14: la marca pesa arriba
    track(d, (PAD, top), page["kicker"], f_kick, (170, 166, 158), 3.4)

    y = top + 46
    for ln in lines:
        d.text((PAD, y), ln, font=f_title, fill=INK)
        y += lh

    y += 20
    f_note = font("SpaceGrotesk-Regular.ttf", 25)
    for ln in note_lines:
        d.text((PAD, y), ln, font=f_note, fill=(178, 175, 168))
        y += 34

    # ── pie: dominio a la izquierda, sello técnico a la derecha ─────────────
    d.line([(PAD, H - 92), (PAD + 560, H - 92)], fill=(255, 255, 255, 40), width=1)
    f_foot = font("SpaceMono-Regular.ttf", 19)
    track(d, (PAD, H - 72), site["url"].split("//")[1], f_foot, (163, 160, 153), 1.0)

    stamp = "WEBGPU · TIEMPO REAL"
    wpx = sum(d.textlength(c, font=f_foot) + 2.6 for c in stamp)
    track(d, (W - PAD - wpx, H - 72), stamp, f_foot, (163, 160, 153), 2.6)

    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "JPEG", quality=88, optimize=True, progressive=True)
    return out


def slug(path):
    return "home" if path == "/" else path.strip("/").replace("/", "-")


def main(only=None):
    cfg = json.loads((WEB / "src" / "seo.json").read_text("utf-8"))
    site = cfg["site"]
    for page in cfg["pages"]:
        if page.get("redirectTo") or "ogLines" not in page:
            continue                            # los redirectores reusan la del destino
        if only and page["path"] != only:
            continue
        out = card(page, site, OUT / f"{slug(page['path'])}.jpg")
        print(f"{page['path']:<26} → public/og/{out.name}  "
              f"{out.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
