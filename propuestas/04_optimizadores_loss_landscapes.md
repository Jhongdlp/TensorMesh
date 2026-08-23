# Propuesta 04: Optimizadores & Paisajes de Pérdida (Loss Landscapes)

## 1. Concepto y Fundamento
Cómo aprenden las redes neuronales a través de la minimización de superficies de error no convexas en dimensiones complejas.

---

## 2. Dinámica Interactiva
- Múltiples optimizadores (SGD clásico, SGD + Momentum, RMSprop, Adam, Lion) compiten en simultáneo sobre la misma superficie topográfica.
- Superficies clásicas seleccionables: Rastrigin, Rosenbrock ("Banana"), Beale, Saddle Point (punto de silla) y paisaje irregular de una red real.
- Visualización de trampas típicas: oscilación en barrancos estrechos, escape de puntos de silla y estancamiento en mesetas planas.

---

## 3. Integración en el Armazón Visual
- **El Cajón (Izquierda):** Selección de función de pérdida, control de learning rate ($\alpha$), momentum ($\beta_1, \beta_2$), y botón de lanzamiento de partículas.
- **Lienzo Central (WebGPU):** Malla 3D de terreno de pérdida deformable con iluminación de isolíneas y estelas de cada optimizador en colores contrastantes.
- **El Raíl (Derecha):** Gráfico de convergencia (Loss vs Iteración), norma del gradiente $\|\nabla L\|$ y posición actual de cada algoritmo.
