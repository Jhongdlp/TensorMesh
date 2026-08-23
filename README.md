<div align="center">

<img src="web/public/icons/orca-logo.png" alt="TensorMesh Orca Logo" width="130" height="130" style="border-radius: 24px; box-shadow: 0 8px 32px rgba(0, 200, 255, 0.25);" />

# TensorMesh
### *The Shape of Artificial Mind*

**A High-Performance WebGPU Laboratory for 3D AI Geometry, Optimization Dynamics & High-Dimensional Vector Spaces**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![WebGPU](https://img.shields.io/badge/WebGPU-Compute%20%26%20Render-6366f1?style=flat-square&logo=webgpu&logoColor=white)](https://www.w3.org/TR/webgpu/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Astro](https://img.shields.io/badge/Astro-4.0+-ff5d01?style=flat-square&logo=astro&logoColor=white)](https://astro.build/)
[![Python](https://img.shields.io/badge/Pipeline-Python%203.14%20|%20NumPy-3776ab?style=flat-square&logo=python&logoColor=white)](https://numpy.org/)
[![Status](https://img.shields.io/badge/Status-Production%20Ready-10b981?style=flat-square)](#)

[**Live Demo**](https://embend.netlify.app) • [**Interactive Rooms**](#-interactive-3d-galleries) • [**WebGPU Engine**](#-webgpu-engine--gpu-architecture) • [**Data Pipeline**](#-data-pipeline--binary-formats) • [**UI/UX Design**](#-uiux-design--perceptual-color-science)

---

</div>

<br/>

## 🌌 Overview

**TensorMesh** is an open-source, zero-backend, client-side interactive laboratory designed to explore high-dimensional artificial intelligence models, non-convex optimization surfaces, neural topologies, and vector retrieval algorithms in real-time 3D.

Unlike traditional AI visualization tools that rely on pre-rendered videos or static dimensionality reduction (such as t-SNE or UMAP), **TensorMesh runs pure physics simulations, tensor transformations, and ray-picking directly on your GPU** using custom WGSL compute shaders.

### ⚡ Key Architectural Pillars
- **Zero Server & Zero API Costs**: Pure static site deployment. 50,000 nodes and 147,000 edges load from a compressed **1.4 MB Brotli** binary payload.
- **On-Demand 300D Semantic Truth**: Graph layout is calculated via N-body spring simulation in 3D, but every distance, analogy, and comparison is evaluated against true 300D FastText vectors via **HTTP byte-range requests (300 bytes/word)**.
- **Dual-Engine Architecture**: Automatic hardware capability detection boots the custom **WebGPU WGSL engine** or smoothly falls back to a **WebGL / Three.js** static viewer.
- **Perceptually Calibrated Color Science**: Continuous cluster coloring in **Oklch** polar space, ensuring equal perceived luminance and blending continuous semantic boundaries.

---

## 🏛️ Interactive 3D Galleries

| Room | Algorithm / Architecture | Visual Preview | Live Capabilities |
| :--- | :--- | :---: | :--- |
| **01. Embedding Nebula**<br/>`(/embedding-nebula)` | **50,000-Word FastText N-Body Graph**<br/>• LinLog energy model<br/>• Tile-based negative sampling<br/>• GPU indirect draw culling | <img src="web/public/previews/nebula-en.png" width="280" alt="Embedding Nebula" /> | • Full 3D camera flight & orbit<br/>• Multi-word semantic comparison<br/>• Classical 2D MDS group constellation<br/>• Shortest semantic path navigation |
| **02. Gradient Descent**<br/>`(/gradient-descent)` | **Non-Convex Optimization Surfaces**<br/>• 40,000 autonomous GPU walkers<br/>• Rosenbrock, Beale, Rastrigin<br/>• SGD vs. Momentum vs. Adam | <img src="web/public/previews/descent.png" width="280" alt="Gradient Descent" /> | • Real-time vector field streamlines<br/>• Dynamic learning rate & momentum<br/>• Ravine crawling visualization<br/>• Optimizer race mode |
| **03. Self-Organizing Maps**<br/>`(/self-organizing-maps)` | **3D Kohonen Neural Lattice**<br/>• Dynamic topological sheet fitting<br/>• Gaussian neighborhood kernel<br/>• Lorenz attractor & Torus targets | <img src="web/public/previews/som.png" width="280" alt="Self-Organizing Maps" /> | • Real-time mesh folding & stretching<br/>• Live training epochs on GPU<br/>• 6 target geometric topologies<br/>• Interactive elasticity controls |
| **04. HNSW Vector Search**<br/>`(/hnsw)` | **Hierarchical Navigable Small World**<br/>• Multi-layer skip-graph traversal<br/>• Logarithmic neighbor retrieval<br/>• Modern Vector DB foundation | <img src="web/public/previews/hnsw.png" width="280" alt="HNSW Search" /> | • Layer-by-layer greedy exploration<br/>• Entry-point jump visualization<br/>• Beam search candidate set tuning<br/>• Distance metric diagnostics |
| **05. MCTS Reasoning Trees**<br/>`(/mcts)` | **Tree-of-Thoughts & Reasoning Search**<br/>• Monte Carlo Tree Search in 3D<br/>• UCB1 exploration-exploitation<br/>• Inference-time compute (o1/R1) | <img src="web/public/previews/mcts.png" width="280" alt="MCTS Reasoning Trees" /> | • Real-time hypothesis expansion<br/>• Reward backpropagation pulse<br/>• Subtree pruning & proof verification<br/>• Interactive branching factor control |
| **06. K-Means Clustering**<br/>`(/kmeans)` | **Expectation-Maximization & Voronoi**<br/>• 3D Voronoi partition bounds<br/>• Centroid inertia minimization<br/>• Lloyd's algorithm convergence | <img src="web/public/previews/kmeans.png" width="280" alt="K-Means Clustering" /> | • Step-by-step EM iteration<br/>• Centroid convergence tracking<br/>• Dynamic $K$ cluster adjustment<br/>• Multi-modal point cloud presets |

---

## 🚀 WebGPU Engine & GPU Architecture

The core simulation executes in a single compute pass where vertex positions **never leave VRAM**. The identical GPU storage buffer mutated by the LinLog physics shader is bound directly into vertex draw calls, eliminating frame-by-frame CPU-GPU synchronization bottlenecks.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             GPU PIPELINE (VRAM)                             │
│                                                                             │
│  ┌───────────────────────┐             ┌─────────────────────────────────┐  │
│  │   Physics Compute     │ ──Write──>  │ Positions Buffer (Int16 / F32)  │  │
│  │ (LinLog + Tile Neg)   │             └─────────────────────────────────┘  │
│  └───────────────────────┘                              │                   │
│             ▲                                        Read as SSBO           │
│             │                                           │                   │
│  ┌───────────────────────┐                              ▼                   │
│  │  Frustum & Screen-Len │ ──Write──>  ┌─────────────────────────────────┐  │
│  │  Indirect Culling     │             │ Indirect Draw Arguments Buffer  │  │
│  └───────────────────────┘             └─────────────────────────────────┘  │
│                                                         │                   │
│                                                         ▼                   │
│                                        ┌─────────────────────────────────┐  │
│                                        │ Render Pipeline (Rasterization) │  │
│                                        │ • Anti-aliased disc nodes       │  │
│                                        │ • Additive mesh thin lines      │  │
│                                        │ • Oklch continuous hue blending │  │
│                                        └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 📊 Benchmark Measurements (AMD Vega 6 Integrated GPU @ 1280×720, 50,000 nodes)

All metrics recorded using **GPU hardware timestamps** (median over 64 continuous frames):

| Rendering Pass | Execution Time (ms) | Speedup / Impact |
| :--- | :---: | :--- |
| **GPU Frustum & Length Culling** (2 compute dispatches) | `0.26 ms` | Compacts visible geometry into indirect buffers |
| **Geometry Draw (Naive, unculled)** | `13.30 ms` | Standard full-mesh rasterization |
| **Geometry Draw (With GPU indirect culling)** | `10.49 ms` | **+21.1% faster** (drops 44% edges full-view, 68% zoomed) |
| **Geometry Draw (Culling + 40% adaptive mesh thinning)** | **`5.05 ms`** | **+62.0% faster** (retains full nebular luminosity) |
| **Physics Simulation (Global sampling)** | `2.29 ms` | K random incoherent texture fetches per node |
| **Physics Simulation (Shared-Memory Tile Sampling)** | **`1.05 ms`** | **Flat execution time from K=8 to K=32** |
| **Total Full-View Frame Time** | **`6.36 ms`** | **Solid 60 FPS on low-power integrated graphics** |

---

## 🛠️ High-Performance Optimizations

### 1. Indirect GPU Culling (`cull.wgsl`)
Two compact compute passes evaluate node frustum visibility and edge projected pixel length. Short sub-pixel edges inside dense cores are pruned without CPU intervention, writing draw arguments directly into an indirect buffer.

### 2. Additive Mesh Thinning with Luminosity Compensation
Rasterization cost is proportional to **total rendered pixel length**, not raw edge count. We decimate the background edge mesh using a stable hash per edge while boosting remaining line brightness by `1 / keep_ratio`. The visual nebular volume preserves 100% of its perceived luminous energy.

### 3. Shared-Memory Tile Negative Repulsion
Reading $K$ random node coordinates per thread incurs massive cache thrashing on unified memory architectures. Each 64-thread workgroup cooperatively loads 64 positions into WGSL `var<workgroup>` shared memory once. Threads sample from local memory, transforming an $O(K)$ latency curve into a flat **1.05 ms** step.

### 4. TCP AIMD Framerate Budget Controller
Under vsync locks (60 Hz), render clocks oscillate wildly between 16.7 ms and 33.3 ms. An Additive Increase / Multiplicative Decrease (AIMD) feedback loop establishes an empirical headroom ceiling, completely eliminating frame hunting and stutter.

### 5. Instant Ray-Picking via `atomicMin` (`pick.wgsl`)
Word selection queries pack mouse ray distance and node index into a single `u32`. A single dispatch executes in $O(N)$ without needing KD-tree rebuilds as particles move during live physics.

---

## 📦 Data Pipeline & Binary Formats

The preprocessing pipeline converts raw vectors (`.vec`) into custom contiguous binary Compressed Sparse Row (CSR) structs designed for instantaneous memory mapping with zero runtime JSON parsing.

<div align="center">
<img src="web/public/pipeline-architecture.png" alt="Data Pipeline Architecture" width="800" style="border-radius: 12px; margin: 16px 0;" />
</div>

### Binary Footprint (50,000 Words)

| Binary File | Data Layout | Size (Disk) | Network (Brotli) |
| :--- | :--- | :---: | :---: |
| `positions.bin` | `Int16 × 3` packed fixed-point coordinates + scale | `293 KB` | ~190 KB |
| `edges.bin` | CSR Layout (`offsets: Uint32`, `targets: Uint16`, `weights: Uint8`) | `1,058 KB` | ~710 KB |
| `labels.bin` | String byte offsets (`Uint32`) + UTF-8 byte stream | `591 KB` | ~380 KB |
| `attrs.bin` | `community: Uint8`, `rank: Uint16`, `flags: Uint8` | `195 KB` | ~146 KB |
| **Total Base Atlas** | **Complete navigable 3D galaxy** | **`2,138 KB`** | **`1,426 KB`** |
| `vecs.bin` | $300 \times \text{int8}$ quantized vector per word (On-demand) | `14.6 MB` | **`300 B / query`** |

> [!TIP]
> **Zero-Download Vector Architecture (`vecs.bin`)**: The 15 MB vector file is **never downloaded in full**. When the user opens the Semantic Comparator, the browser sends an HTTP Range header (`Range: bytes=i*300-(i*300+299)`) to fetch only 300 bytes for that specific word.

---

## 🎨 UI/UX Design & Perceptual Color Science

```
                          Oklch Perceptual Nebula Ramp
  Cyan ───► Electric Blue ───► Violet ───► Magenta ───► Rose ───► Amber ───► Yellow ───► Emerald
 (0.15 C)       (0.19 C)       (0.24 C)    (0.31 C)    (0.26 C)   (0.20 C)   (0.18 C)    (0.17 C)
```

- **Perceptual Oklch Color Uniformity**: Color represents cluster neighborhood rather than arbitrary discrete tags. Cluster centroids are ordered along the cloud's principal 2D plane. Adjacent communities transition seamlessly without brightness dips.
- **Maximized Gamut Boundary**: Chroma is fitted to the exact sRGB gamut hull via bisection search, allowing vivid neons without hue clipping.
- **Anti-Aliased Disc Geometry**: Nodes are rendered as flat discs with `fwidth()` shader smoothing, depth testing, and alpha blending, preventing points from washing out into opaque white noise.
- **Kinetic Flight Navigation**: Hybrid input architecture (`galaxy/keys.ts`) provides damped momentum physics for both mouse orbiting and `WASD` / `QE` 6-DOF camera flight.

---

## 🚀 Quickstart & Development

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **Python**: 3.10+ (Python 3.14 compatible, requires only `numpy`, `scipy`, and `pillow`)

### 1. Web Application

```bash
# Clone the repository
git clone https://github.com/Jhongdlp/embed.git
cd embed/web

# Install dependencies
npm install

# Launch development server
npm run dev

# Run full test suite (Types, Pure Logic, GPU Physics & WebGPU Shaders via Dawn)
npm test
```

### 2. Python Pipeline (Optional / Headless Generation)

```bash
# Generate both Spanish & English datasets from scratch
./pipeline/all.sh es en

# Or run individual modular stages:
python3 pipeline/fetch.py es 100000       # Stage 00: Fetch FastText embeddings
python3 pipeline/build.py es 50000 1200   # Stages 01-07: kNN, MST backbone, LinLog layout
python3 pipeline/vectors.py es            # Stage 08: Quantize 300D vectors to int8
python3 pipeline/validate.py es           # Validate semantic analogies & clustering
```

---

## 🧪 Verification & Test Suite

The project includes an end-to-end automated test matrix validating WGSL compute shader math against NumPy reference fixtures without needing a browser:

```bash
cd web

# 1. Pure Unit Tests (< 1 second, no GPU needed)
node test/unit.mjs es

# 2. WebGPU Compute Shader Physics (Dawn headless runtime vs. NumPy)
npm run test:physics

# 3. WebGPU Offscreen Texture Render & Selection Verification
npm run test:render
```

---

## 📐 Mathematical Foundations

1. **LinLog Energy Model**:
   $$E = \sum_{(u,v) \in E} w_{uv} \|p_u - p_v\| - \sum_{u,v \in V} \text{deg}(u)\text{deg}(v) \ln \|p_u - p_v\|$$
2. **Classical Multidimensional Scaling (MDS)** on Normalised Vectors:
   $$d_{ij}^2 = \|u_i - u_j\|^2 = 2 - 2 \cos(\theta_{ij})$$
3. **Stress Metric**:
   $$\sigma = \frac{\sum_{i < j} (d_{ij} - \hat{d}_{ij})^2}{\sum_{i < j} d_{ij}^2}$$

---

## 👤 Author & Credits

Designed and engineered with care by **Jhonatan (Jhongdlp)**:

- 🌐 **Website**: [jhongdlp.com](https://jhongdlp.com)
- 🐙 **GitHub**: [@Jhongdlp](https://github.com/Jhongdlp)
- 🐦 **X (Twitter)**: [@jhongdlp](https://x.com/jhongdlp)
- 📸 **Instagram**: [@jhongdlp.dev](https://instagram.com/jhongdlp.dev)

### Citations & Attribution
- Word vector embeddings sourced from [Facebook Research fastText](https://fasttext.cc/docs/en/crawl-vectors.html) (Licensed under **CC BY-SA 3.0**).
- Graph layout references and inspirative baseline: `anvaka/pm`.

---

<div align="center">

⭐ **If you find this project exciting, consider starring the repository!** ⭐

</div>
