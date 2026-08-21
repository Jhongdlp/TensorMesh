#!/usr/bin/env bash
# Fase 2 completa: ambas galaxias a 50k, validadas y publicadas en web/public.
set -euo pipefail
cd "$(dirname "$0")/.."

WORDS=${WORDS:-50000}
EPOCHS=${EPOCHS:-1200}
RAW=${RAW:-100000}

for lang in "$@"; do
  echo "═══ $lang ═══"
  python3 pipeline/fetch.py    "$lang" "$RAW"
  python3 pipeline/build.py    "$lang" "$WORDS" "$EPOCHS"
  python3 pipeline/validate.py "$lang"
  python3 pipeline/preview.py  "$lang"

  mkdir -p "web/public/data/$lang"
  cp "data/$lang"/{positions.bin,edges.bin,labels.bin,attrs.bin,meta.json} \
     "web/public/data/$lang/"
done

echo "═══ publicado ═══"
du -ch web/public/data/*/* | tail -n 1
