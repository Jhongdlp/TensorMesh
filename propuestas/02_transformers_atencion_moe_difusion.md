# Propuesta 02: Transformers, Atención & Modelos de Difusión

## 1. Concepto y Fundamento
Explora las dos arquitecturas generativas dominantes:
- **Transformers (Self-Attention & MoE):** Cómo los tokens intercambian información contextual mediante matrices $Q, K, V$ y cómo se enrutan a expertos especializados.
- **Modelos de Difusión (Denoising Score Matching):** Cómo una distribución caótica de ruido Gaussiano colapsa en patrones visuales nítidos guiada por un campo vectorial.

---

## 2. Modos de Visualización
- **Modo Atención:** Rayos volumétricos 3D entre tokens que se intensifican según la matriz de atención Softmax($QK^T / \sqrt{d_k}$). Al hacer click en un token, se aísla su cono de atención.
- **Modo MoE (Mixture of Experts):** Un router central dispara tokens hacia clústeres especializados (código, lógica, narrativa) con visualización de carga por experto.
- **Modo Difusión:** 50.000 partículas en WebGPU que parten de ruido tridimensional y evolucionan paso a paso ($t \to 0$) siguiendo las trayectorias de Flow Matching / DDPM.

---

## 3. Integración en el Armazón Visual
- **El Cajón (Izquierda):** Selector de arquitectura, selector de capas y cabezas de atención ($H_0 \dots H_n$), o pasos temporales de difusión ($t$).
- **Lienzo Central (WebGPU):** Nube volumétrica de partículas o matriz espacial de cuerdas de atención interactivas.
- **El Raíl (Derecha):** Proyección dimensional, matriz de pesos y probabilidades de predicción del siguiente token / mapa de varianza.
