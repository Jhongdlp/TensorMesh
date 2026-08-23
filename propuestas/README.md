# Propuestas de Salas y Galerías Interactivas

Este directorio contiene las especificaciones conceptuales, visuales y técnicas de las diferentes salas y galerías para expandir el proyecto **Atlas Vectorial** con los algoritmos más representativos de Inteligencia Artificial, Deep Learning y Agentes Autónomos.

---

## Índice de Propuestas

| # | Propuesta | Área | Descripción Clave | Estado |
|---|---|---|---|---|
| **01** | [Árboles de Razonamiento (MCTS & Tree-of-Thoughts)](./01_arboles_razonamiento_mcts_tot.md) | Agentes / Reasoning | Visualización viva de las 4 fases de MCTS / ToT (Selección, Expansión, Rollout, Retropropagación) aplicadas a razonamiento de LLMs y agentes. | En catálogo |
| **02** | [Transformers, Atención & Difusión](./02_transformers_atencion_moe_difusion.md) | Deep Learning / Generación | Mecanismos de Self-Attention 3D, enrutamiento dinámico en Mixture of Experts (MoE) y reducción de ruido en Modelos de Difusión. | En catálogo |
| **03** | [HNSW: Búsqueda Vectorial Multicapa](./03_hnsw_busqueda_vectorial.md) | Indexación / Bases Vectoriales | Estructura jerárquica en capas 3D (Skip-list en grafos k-NN) con simulación de navegación y consultas de vecinos más cercanos a velocidad de rayo. | **En desarrollo activo** |
| **04** | [Optimizadores & Paisajes de Pérdida](./04_optimizadores_loss_landscapes.md) | Optimización / Matemáticas | Carrera de optimizadores (SGD, Momentum, Adam, Lion) sobre terrenos no convexos 3D con saddle points y valles estrechos. | En catálogo |

---

## Filosofía de Diseño Compartida

Todas las propuestas respetan el **armazón acromático** y la arquitectura de alto rendimiento del Atlas:
- **Izquierda (El Cajón):** Selección de datasets, parámetros hiperespaciales y controles de reproducción.
- **Centro (Lienzo WebGPU):** Simulación viva en GPU con buffers compartidos, renderizado instanciado y cero copias innecesarias.
- **Derecha (El Raíl):** Inspector en tiempo real, métricas matemáticas y explicación paso a paso.
- **HUD Acromático:** Fondos en `--void: #1C1D1F`, paneles en `--panel: rgba(28, 29, 31, 0.94)`, bordes `--rule` y texto `--ink`.
