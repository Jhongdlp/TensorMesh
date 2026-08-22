/** Codificador PNG mínimo, compartido por los tests que escriben imágenes.
 *
 *  Vive aquí y no dentro de `render.mjs` porque la sala del descenso escribe su
 *  propio PNG por el mismo motivo que la galaxia: en esta máquina Chrome cae al
 *  respaldo WebGL y headless apenas corre un puñado de frames, así que la única
 *  forma de *ver* lo que hace un shader de WebGPU es renderizarlo con Dawn a una
 *  textura y volcarla. Dos copias del codificador serían dos copias que
 *  divergen; ésta es la única.
 *
 *  RGBA de 8 bits, sin filtros por fila (todos tipo 0) y un solo IDAT. Es lo
 *  justo para escribir una captura: no pretende comprimir bien, pretende no
 *  tener dependencias.
 */
import { deflateSync } from "node:zlib";

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const crc32 = (b) => {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

/**
 * @param {number} w
 * @param {number} h
 * @param {Buffer} rgba  w*h*4 bytes, sin relleno por fila
 * @returns {Buffer}
 */
export function png(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
