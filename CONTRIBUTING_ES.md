# Guía de Contribución a TensorMesh 🌌

¡Te damos la bienvenida a la **Galería Pública y Laboratorio WebGPU de TensorMesh**! Estamos construyendo una biblioteca abierta y colaborativa de simulaciones 3D interactivas, modelos de aprendizaje automático, dinámicas de optimización y cursos visuales que se ejecutan directamente en tu navegador mediante **WebGPU nativo**.

Ya sea que desees crear una nueva sala de algoritmos, optimizar shaders WGSL, escribir explicaciones matemáticas interactivas o corregir errores, tus contribuciones son bienvenidas.

---

## 🧭 Índice

1. [Principios de Arquitectura](#-principios-de-arquitectura)
2. [Formas de Contribuir](#-formas-de-contribuir)
3. [Estructura del Proyecto](#-estructura-del-proyecto)
4. [Paso a Paso: Crear una Nueva Sala o Algoritmo](#-paso-a-paso-crear-una-nueva-sala-o-algoritmo)
5. [Estándar Técnico WebGPU & WGSL](#-estándar-técnico-webgpu--wgsl)
6. [Flujo de Verificación y Pruebas](#-flujo-de-verificación-y-pruebas)
7. [Cómo Enviar un Pull Request](#-cómo-enviar-un-pull-request)
8. [Atribución de Autor y Reconocimiento](#-atribución-de-autor-y-reconocimiento)

---

## ⚡ Principios de Arquitectura

- **100% Cómputo en el Cliente (Sin Servidores)**: Todo el cálculo matemático, física, tensores y renderizado corre en la GPU del visitante mediante shaders WGSL.
- **Pedagogía Visual Intuitiva**: Cada sala no es solo una demo visual, es una lección interactiva. Los usuarios deben poder inspeccionar parámetros, pausar la simulación y comprender la matemática paso a paso.
- **Ligereza y Cero Dependencias Pesadas**: Evitamos librerías externas innecesarias. Usamos APIs nativas de WebGPU, buffers binarios y componentes limpios de React.
- **Bilingüe por Diseño**: El contenido educativo está disponible en **Español (`es`)** e **Inglés (`en`)**.

---

## 💡 Formas de Contribuir

- **Crear una Nueva Sala de Algoritmo**: Visualiza modelos clave (ejemplo: *Atención 3D en Transformers*, *Modelos de Difusión*, *Autómatas Celulares Neuronales*, *Simulaciones N-Cuerpos*, *Esferas de Bloch Cuánticas*, *t-SNE / UMAP en vivo en WebGPU*).
- **Optimización de Shaders**: Mejorar el rendimiento de compute passes (memoria compartida workgroup, culling indirecto en GPU, paralelización).
- **Contenido Educativo y Guías**: Escribir explicaciones matemáticas claras y tarjetas paso a paso para la guía interactiva.
- **UI/UX y Accesibilidad**: Mejorar los controles de cámara (`6-DOF WASD/QE`), controles táctiles y visualización responsiva.

---

## 📁 Estructura del Repositorio

```text
TensorMesh/
├── pipeline/             # Pipelines de datos en Python (FastText, binarios CSR)
├── web/                  # Aplicación web en Astro + React + WebGPU
│   ├── public/           # Previews estáticos, tensores binarios, iconos
│   └── src/
│       ├── components/   # Componentes UI (Header, Footer, AuthorWidget, LandingPage)
│       ├── galaxy/       # Cámara 3D, controles, joystick y shaders de la galaxia
│       ├── i18n/         # Diccionarios de traducción bilingüe (es / en)
│       ├── pages/        # Rutas Astro (/embedding-nebula, /neural-network, /colaborar, etc.)
│       ├── rooms/        # Implementaciones individuales de cada sala
│       │   ├── descent/  # Sala 02: Descenso de Gradiente (SGD, Momentum, Adam)
│       │   ├── som/      # Sala 03: Mapas Autoorganizados (Kohonen)
│       │   ├── hnsw/     # Sala 04: Búsqueda Vectorial HNSW
│       │   ├── mcts/     # Sala 05: Árboles de Razonamiento MCTS
│       │   ├── kmeans/   # Sala 06: K-Means Clustering y Voronoi
│       │   ├── nn/       # Sala 07: Red Neuronal y Retropropagación
│       │   └── [tu-sala]/ # ¡Tu nueva contribución!
│       ├── styles/       # Estilos shell.css, estilos específicos y tema
│       └── seo.json      # Metadatos SEO y tarjetas OpenGraph
├── CONTRIBUTING.md       # Guía de contribución en inglés
├── CONTRIBUTING_ES.md    # Guía de contribución en español (este archivo)
└── README.md             # Documentación principal del proyecto
```

---

## 🛠️ Paso a Paso: Crear una Nueva Sala o Algoritmo

### 1. Clona el Repositorio

```bash
git clone https://github.com/Jhongdlp/TensorMesh.git
cd TensorMesh/web
npm install
npm run dev
```

### 2. Crea la Carpeta de tu Sala

Crea una carpeta en `web/src/rooms/<tu-algoritmo>/`:

```text
web/src/rooms/<tu-algoritmo>/
├── <Algoritmo>.tsx        # Componente React y raíl de controles en vivo
├── engine.ts              # Inicialización WebGPU, buffers y bucle de renderizado
├── compute.wgsl           # Shaders de cómputo (físicas, actualización de pesos/tensores)
├── render.wgsl            # Shaders de vértices y fragmentos (dibujo 3D)
└── math.ts                # Utilidades matemáticas
```

### 3. Plantilla de Shaders y React

#### Shader de Cómputo (`compute.wgsl`)
```wgsl
struct Params {
  learning_rate: f32,
  momentum: f32,
  step_count: u32,
  dt: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> particles: array<vec4<f32>>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx >= arrayLength(&particles)) { return; }

  var p = particles[idx];
  // Cálculos matemáticos en paralelo dentro de la GPU
  particles[idx] = p;
}
```

#### Componente React (`Algoritmo.tsx`)
```tsx
import { useEffect, useRef, useState } from "react";
import { initAlgorithmEngine } from "./engine";
import { useAtlasLang } from "../../i18n";
import "../../styles/shell.css";

export default function AlgorithmRoom() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [lang] = useAtlasLang();
  const [speed, setSpeed] = useState(1.0);

  useEffect(() => {
    if (!canvasRef.current) return;
    const cleanup = initAlgorithmEngine(canvasRef.current, { speed });
    return () => cleanup();
  }, [speed]);

  return (
    <div className="shell">
      <canvas ref={canvasRef} className="shell-canvas" />
      <aside className="rail rail-r">
        <div className="card">
          <label>Velocidad: {speed.toFixed(2)}x</label>
          <input
            type="range"
            min="0.1"
            max="3.0"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
        </div>
      </aside>
    </div>
  );
}
```

### 4. Crea la Ruta Astro

Crea `web/src/pages/<tu-algoritmo>.astro`:

```astro
---
import AlgorithmRoom from "../rooms/<tu-algoritmo>/Algorithm.tsx";
import Seo from "../components/Seo.astro";
import SeoBody from "../components/SeoBody.astro";
import "../styles/shell.css";
---

<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <Seo path="/<tu-algoritmo>" />
  </head>
  <body>
    <SeoBody path="/<tu-algoritmo>" />
    <AlgorithmRoom client:only="react" />
  </body>
</html>
```

### 5. Registra tu Sala en `seo.json` y `landing.ts`

1. Añade tu sala a `web/src/seo.json`.
2. Añade la tarjeta de la sala y descripciones bilingües en `web/src/i18n/landing.ts`.

---

## 🧪 Flujo de Verificación y Pruebas

Antes de enviar tu Pull Request, corre el comando de verificación:

```bash
cd web

# 1. Verificación de compilación y tipos
npm run build

# 2. Pruebas unitarias
node test/unit.mjs es

# 3. Pruebas de shaders WebGPU en modo headless (vía Dawn)
npm test
```

---

## 📬 Cómo Enviar un Pull Request

1. Crea una rama de trabajo:
   ```bash
   git checkout -b feature/nombre-de-tu-algoritmo
   ```
2. Haz commits con mensajes descriptivos:
   ```bash
   git commit -m "feat(room): añadir sala 3D de Transformers y Atención en WebGPU"
   ```
3. Sube tu rama a tu fork y abre un Pull Request contra la rama `main` de `Jhongdlp/TensorMesh`.
4. Incluye en la descripción:
   - Resumen del modelo matemático o algoritmo.
   - Captura de pantalla o GIF de la escena 3D.
   - Hardware en el que fue probado (GPU/Navegador/SO).

---

## 🌟 Atribución de Autor y Reconocimiento

Cada colaborador es parte fundamental de TensorMesh:
- Tu sala incluirá tu **nombre, avatar y enlaces a tus redes** a través del Widget de Autor interactivo.
- Tu trabajo aparecerá en el `README.md` principal y en las notas de versión.
- Conservas la autoría de tu código bajo la licencia abierta **MIT**.

---

<div align="center">
<sub>¿Tienes dudas o quieres proponer una idea? Abre un <a href="https://github.com/Jhongdlp/TensorMesh/issues/new">GitHub Issue</a> o contacta a <a href="https://jhongdlp.com">Jhongdlp</a>.</sub>
</div>
