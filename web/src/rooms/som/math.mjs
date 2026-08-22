/** Sala 03 — Mapas Autoorganizados (SOM).
 *
 *  Cálculos de formas de datos objetivos y parámetros del algoritmo.
 */

/**
 * @typedef {object} Shape
 * @property {string} key
 * @property {string} name
 * @property {string} formula
 * @property {string} note
 * @property {(count: number) => Float32Array} generate
 */

/** @type {Shape[]} */
export const SHAPES = [
  {
    key: "sphere",
    name: "Esfera de Puntos",
    formula: "x² + y² + z² = R²",
    note: "Una distribución uniforme sobre la superficie de una esfera. La red SOM empezará como un plano liso y tendrá que estirarse para envolver la esfera por completo.",
    generate: (count) => {
      const data = new Float32Array(count * 4);
      const r = 1.1;
      for (let i = 0; i < count; i++) {
        const u = Math.random();
        const v = Math.random();
        const theta = u * 2.0 * Math.PI;
        const phi = Math.acos(2.0 * v - 1.0);
        const idx = i * 4;
        data[idx] = r * Math.sin(phi) * Math.cos(theta);     // x
        data[idx + 1] = r * Math.sin(phi) * Math.sin(theta); // y
        data[idx + 2] = r * Math.cos(phi);                   // z
        data[idx + 3] = 1.0;                                 // w (padding)
      }
      return data;
    }
  },
  {
    key: "torus",
    name: "Toroide (Dona)",
    formula: "(R - √(x² + y²))² + z² = r²",
    note: "Un donut tridimensional. Si la red tiene topología plana, formará un cilindro hueco y se morderá la cola. Si la red es toroidal, se adaptará como una piel perfecta.",
    generate: (count) => {
      const data = new Float32Array(count * 4);
      const R = 0.9; // Radio mayor
      const r = 0.35; // Radio menor
      for (let i = 0; i < count; i++) {
        const theta = Math.random() * 2.0 * Math.PI;
        const phi = Math.random() * 2.0 * Math.PI;
        const idx = i * 4;
        data[idx] = (R + r * Math.cos(phi)) * Math.cos(theta);
        data[idx + 1] = (R + r * Math.cos(phi)) * Math.sin(theta);
        data[idx + 2] = r * Math.sin(phi);
        data[idx + 3] = 1.0;
      }
      return data;
    }
  },
  {
    key: "helix",
    name: "Doble Hélice",
    formula: "x = R cos(t), y = R sin(t), z = p t",
    note: "Dos espirales entrelazadas. La malla SOM debe estirarse y dividirse conceptualmente en dos filamentos, o enroscarse a lo largo del canal que las une.",
    generate: (count) => {
      const data = new Float32Array(count * 4);
      const R = 0.8;
      for (let i = 0; i < count; i++) {
        // Alternar entre las dos hélices
        const isSecond = Math.random() > 0.5;
        const t = Math.random() * 4.0 * Math.PI; // Dos vueltas completas
        const z = (t / (4.0 * Math.PI)) * 2.2 - 1.1; // z va de -1.1 a 1.1
        const angle = t + (isSecond ? Math.PI : 0);
        
        const idx = i * 4;
        data[idx] = R * Math.cos(angle);
        data[idx + 1] = R * Math.sin(angle);
        data[idx + 2] = z;
        data[idx + 3] = isSecond ? 1.0 : 0.0; // Usamos w para clasificar el filamento
      }
      return data;
    }
  },
  {
    key: "cube",
    name: "Cubo Macizo",
    formula: "x, y, z ∈ [-L, L]",
    note: "Una nube de puntos uniforme dentro de un volumen cúbico. Observa cómo la red se pliega sobre sí misma mediante un patrón espacial Peano para llenar el espacio 3D.",
    generate: (count) => {
      const data = new Float32Array(count * 4);
      const L = 0.9;
      for (let i = 0; i < count; i++) {
        const idx = i * 4;
        data[idx] = (Math.random() - 0.5) * 2.0 * L;
        data[idx + 1] = (Math.random() - 0.5) * 2.0 * L;
        data[idx + 2] = (Math.random() - 0.5) * 2.0 * L;
        data[idx + 3] = 1.0;
      }
      return data;
    }
  },
  {
    key: "lorenz",
    name: "Atractor de Lorenz",
    formula: "dx/dt = σ(y - x), dy/dt = x(ρ - z) - y",
    note: "La clásica mariposa de la teoría del caos. La red SOM intentará aproximarse a la variedad fractal no lineal, adaptándose a las dos 'alas' del atractor.",
    generate: (count) => {
      const data = new Float32Array(count * 4);
      
      // Parámetros de Lorenz
      const sigma = 10.0;
      const rho = 28.0;
      const beta = 8.0 / 3.0;
      
      // Integrar EDO en CPU para poblar el buffer
      let x = 0.1;
      let y = 0.0;
      let z = 0.0;
      const dt = 0.01;
      
      // Calentamiento del atractor
      for (let j = 0; j < 500; j++) {
        const dx = sigma * (y - x) * dt;
        const dy = (x * (rho - z) - y) * dt;
        const dz = (x * y - beta * z) * dt;
        x += dx;
        y += dy;
        z += dz;
      }
      
      // Generar muestras guardando estados
      for (let i = 0; i < count; i++) {
        // Damos varios pasos de integración por punto para desagrupar
        for (let step = 0; step < 5; step++) {
          const dx = sigma * (y - x) * dt;
          const dy = (x * (rho - z) - y) * dt;
          const dz = (x * y - beta * z) * dt;
          x += dx;
          y += dy;
          z += dz;
        }
        
        const idx = i * 4;
        // Escalar y centrar el atractor de Lorenz para encajar en [-1.2, 1.2]
        data[idx] = x * 0.07;
        data[idx + 1] = y * 0.07;
        data[idx + 2] = (z - 25.0) * 0.07; // z está centrado alrededor de 25
        data[idx + 3] = 1.0;
      }
      return data;
    }
  }
];

export const GRID_RES = 64; // 64 x 64 neuronas = 4096 neuronas
export const SAMPLE_COUNT = 8192; // 8192 puntos objetivo
