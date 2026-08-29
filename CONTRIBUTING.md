# Contributing to TensorMesh 🌌

Welcome to the **TensorMesh Public Gallery & WebGPU Laboratory**! We are building an open, community-driven library of interactive 3D simulations, machine learning models, optimization dynamics, and visual courses running entirely in your browser using **native WebGPU**.

Whether you want to create a new algorithm room, optimize WGSL shaders, write pedagogical interactive guides, or fix bugs, your contributions are warmly welcomed.

---

## 🧭 Table of Contents

1. [Our Ethos & Architecture Principles](#-our-ethos--architecture-principles)
2. [Ways to Contribute](#-ways-to-contribute)
3. [Repository Structure](#-repository-structure)
4. [Step-by-Step: Creating a New Room / Algorithm](#-step-by-step-creating-a-new-room--algorithm)
5. [WebGPU & WGSL Technical Standard](#-webgpu--wgsl-technical-standard)
6. [Educational Walkthroughs (i18n)](#-educational-walkthroughs-i18n)
7. [Development & Verification Workflow](#-development--verification-workflow)
8. [Submitting a Pull Request](#-submitting-a-pull-request)
9. [Author Attribution & Recognition](#-author-attribution--recognition)

---

## ⚡ Our Ethos & Architecture Principles

- **100% Client-Side & Zero-Server Compute**: We do not rely on expensive backends. All math, tensor operations, physics, and rasterization run on the user's GPU.
- **Pedagogical Clarity**: Every room is not just a demo, but a visual lesson. Users should be able to inspect parameters, understand the math step-by-step, and build deep intuition.
- **Lightweight & Dependency-Free**: Avoid heavy multi-megabyte npm dependencies. We favor pure WebGPU APIs, native typed arrays, lightweight React hooks, and minimal bundles.
- **Bilingual by Design**: Educational content is accessible in both **Spanish (`es`)** and **English (`en`)**.

---

## 💡 Ways to Contribute

- **Propose & Build a New Algorithm Room**: Bring concepts to life (e.g., *Transformer 3D Attention*, *Diffusion Denoising*, *Neural Cellular Automata*, *Barnes-Hut N-Body*, *Quantum Bloch Spheres*, *t-SNE / UMAP live in WebGPU*).
- **Shader Performance Optimization**: Profile and optimize existing compute passes (shared memory workgroups, indirect culling, subgroup operations).
- **Course & Guide Content**: Write intuitive, accurate mathematical explanations for the step-by-step interactive guides.
- **UI/UX & Accessibility**: Enhance control ergonomics, keyboard navigation (`6-DOF WASD/QE`), and touch controls.

---

## 📁 Repository Structure

```text
TensorMesh/
├── pipeline/             # Python offline data pipelines (FastText embeddings, CSR binaries)
├── web/                  # Astro + React + WebGPU web application
│   ├── public/           # Static previews, binary tensors, icons
│   └── src/
│       ├── components/   # Shared UI components (Header, Footer, AuthorWidget, LandingPage)
│       ├── galaxy/       # Nebula 3D camera, controls, joystick & shaders
│       ├── i18n/         # Bilingual translation dictionaries (index, landing, collaborate, rooms)
│       ├── pages/        # Astro page routes (/embedding-nebula, /neural-network, /colaborar, etc.)
│       ├── rooms/        # Individual algorithm room implementations
│       │   ├── descent/  # Room 02: Gradient Descent (SGD, Momentum, Adam)
│       │   ├── som/      # Room 03: Self-Organizing Maps (Kohonen)
│       │   ├── hnsw/     # Room 04: HNSW Vector Search
│       │   ├── mcts/     # Room 05: Monte Carlo Tree Search
│       │   ├── kmeans/   # Room 06: K-Means Clustering & Voronoi
│       │   ├── nn/       # Room 07: Neural Network & Backprop
│       │   └── [your-room]/ # Your new contribution!
│       ├── styles/       # Shell CSS, room-specific styles, theme variables
│       └── seo.json      # Single source of truth for SEO metadata & OpenGraph cards
├── CONTRIBUTING.md       # Contribution guide (this file)
└── README.md             # Project documentation
```

---

## 🛠️ Step-by-Step: Creating a New Room / Algorithm

### 1. Fork & Clone the Repository

```bash
git clone https://github.com/Jhongdlp/TensorMesh.git
cd TensorMesh/web
npm install
npm run dev
```

### 2. Create your Room Folder

Create a new directory under `web/src/rooms/<your-algorithm>/`:

```text
web/src/rooms/<your-algorithm>/
├── <Algorithm>.tsx        # React harness & live control rail
├── engine.ts              # WebGPU device setup, buffers & frame render loop
├── compute.wgsl           # Compute shaders (physics, tensor math, updates)
├── render.wgsl            # Vertex & Fragment shaders (3D drawing)
└── math.ts                # Pure math utilities & CPU fallbacks (if applicable)
```

### 3. Implement the WebGPU Pipeline Template

#### A. Compute Shader (`compute.wgsl`)
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
  // Calculate math / force / gradient on GPU
  particles[idx] = p;
}
```

#### B. React Harness Component (`Algorithm.tsx`)
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
          <label>Speed: {speed.toFixed(2)}x</label>
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

### 4. Create the Astro Page Route

Create `web/src/pages/<your-algorithm>.astro`:

```astro
---
import AlgorithmRoom from "../rooms/<your-algorithm>/Algorithm.tsx";
import Seo from "../components/Seo.astro";
import SeoBody from "../components/SeoBody.astro";
import "../styles/shell.css";
---

<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <Seo path="/<your-algorithm>" />
  </head>
  <body>
    <SeoBody path="/<your-algorithm>" />
    <AlgorithmRoom client:only="react" />
  </body>
</html>
```

### 5. Register in Metadata (`web/src/seo.json` & `web/src/i18n/landing.ts`)

1. Add your room entry to `web/src/seo.json` with title, description, and keywords.
2. Add room card metadata, preview image, and bilingual description in `web/src/i18n/landing.ts`.

---

## 🧪 Development & Verification Workflow

Before submitting your pull request, run the automated test suite:

```bash
cd web

# 1. Type & Build Check
npm run build

# 2. Headless Unit & Math Verification
node test/unit.mjs es

# 3. WebGPU Headless Shader Tests (via Dawn)
npm test
```

---

## 📬 Submitting a Pull Request

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-algorithm-name
   ```
2. Commit with descriptive semantic messages:
   ```bash
   git commit -m "feat(room): add 3D Transformer Self-Attention WebGPU room"
   ```
3. Push to your fork and open a Pull Request against the `main` branch of `Jhongdlp/TensorMesh`.
4. Fill out the PR description template with:
   - Summary of the mathematical model / algorithm.
   - Screenshot / video preview of the 3D scene.
   - Hardware tested (e.g., Chrome/Linux/NVIDIA, macOS/Metal/M2, Windows/DirectX12).

---

## 🌟 Author Attribution & Recognition

Every community contributor is a core part of TensorMesh:
- Your room will feature your **name, avatar, and social links** via the interactive Author Widget.
- Your contribution will be listed in the main `README.md` and repository release notes.
- You retain ownership of your code under the permissive **MIT License**.

---

<div align="center">
<sub>Have questions or want to discuss an algorithm idea? Open a <a href="https://github.com/Jhongdlp/TensorMesh/issues/new">GitHub Issue</a> or reach out to <a href="https://jhongdlp.com">Jhongdlp</a>.</sub>
</div>
