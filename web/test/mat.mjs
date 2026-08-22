/** Las tres matrices que necesitan los tests, en un solo sitio.
 *
 *  Son un reimplementado de `src/galaxy/gpu/camera.ts` y eso sigue siendo una
 *  duplicación real —la que CLAUDE.md ya señala en el cuadro de layouts—, pero
 *  al menos es **una** y no una por test. Si se tocan las matrices de
 *  `camera.ts`, hay que tocar éstas o los PNG dejan de representar la web.
 *
 *  Ojo con la convención de NDC: WebGPU usa z en [0,1] (estilo D3D) y no en
 *  [-1,1]. Esta `perspective` **no** es la de WebGL/Three.js.
 */

export const perspective = (fov, aspect, near, far) => {
  const f = 1 / Math.tan(fov / 2), m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f; m[10] = far / (near - far); m[11] = -1;
  m[14] = (far * near) / (near - far);
  return m;
};

export function lookAt(e, a, up) {
  let zx = e[0] - a[0], zy = e[1] - a[1], zz = e[2] - a[2];
  let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  const m = new Float32Array(16);
  m[0] = xx; m[1] = yx; m[2] = zx; m[4] = xy; m[5] = yy; m[6] = zy;
  m[8] = xz; m[9] = yz; m[10] = zz;
  m[12] = -(xx * e[0] + xy * e[1] + xz * e[2]);
  m[13] = -(yx * e[0] + yy * e[1] + yz * e[2]);
  m[14] = -(zx * e[0] + zy * e[1] + zz * e[2]);
  m[15] = 1;
  return m;
}

export const mul = (a, b) => {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] +
                   a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
};
