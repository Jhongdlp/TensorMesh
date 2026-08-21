"""Etapa 00 — Adquisición.

Los .vec de fastText vienen ordenados por frecuencia, así que cortamos el
stream tras las primeras N líneas en vez de bajar 1,3 GB por idioma.
"""
import gzip
import sys
import urllib.request
from pathlib import Path

BASE = "https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.{lang}.300.vec.gz"
RAW = Path(__file__).resolve().parent.parent / "data" / "raw"


def fetch(lang: str, n_lines: int) -> Path:
    out = RAW / f"{lang}.vec"
    if out.exists():
        print(f"[00] {out.name} ya existe, se reutiliza")
        return out

    RAW.mkdir(parents=True, exist_ok=True)
    url = BASE.format(lang=lang)
    print(f"[00] descargando {n_lines} líneas de {url}")

    req = urllib.request.Request(url, headers={"User-Agent": "atlas-vectorial/0.1"})
    tmp = out.with_suffix(".part")
    written = 0
    with urllib.request.urlopen(req) as resp, gzip.GzipFile(fileobj=resp) as gz:
        with open(tmp, "wb") as fh:
            gz.readline()  # cabecera "2000000 300"
            for line in gz:
                fh.write(line)
                written += 1
                if written >= n_lines:
                    break
                if written % 20000 == 0:
                    print(f"[00]   {written} líneas...")
    tmp.rename(out)
    print(f"[00] listo: {written} líneas en {out}")
    return out


if __name__ == "__main__":
    lang = sys.argv[1] if len(sys.argv) > 1 else "es"
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 30000
    fetch(lang, n)
