# Propuesta 01: Árboles de Razonamiento (MCTS & Tree-of-Thoughts)

## 1. Concepto y Fundamento
Los modelos modernos de razonamiento (como DeepSeek R1, OpenAI o1/o3, AlphaZero) no generan respuestas en un flujo lineal, sino que exploran espacios de pensamiento mediante árboles de búsqueda y evaluación de hipótesis.

Esta sala visualiza cómo un agente o LLM ramifica sus opciones, evalúa conjeturas con un crítico (Value Function / Verifier), retrocede ante callejones sin salida (*backtracking*) y converge en la solución óptima.

---

## 2. Las 4 Fases Visualizadas en Tiempo Real
1. **Selección (Selection):** Un haz de luz recorre el árbol desde la raíz seleccionando ramas mediante el criterio UCT ($UCT = Q + c \sqrt{\frac{\ln N}{n}}$).
2. **Expansión (Expansion):** En la hoja seleccionada brotan nuevos nodos hijos (acciones, pasos de código o deducciones).
3. **Rollout / Evaluación (Simulation / Heuristic):** Rayos rápidos proyectan futuros posibles para estimar la probabilidad de éxito.
4. **Retropropagación (Backpropagation):** Una onda de energía asciende por las ramas actualizando el contador de visitas ($N$) y el valor medio ($Q$).

---

## 3. Integración en el Armazón Visual
- **El Cajón (Izquierda):** Selector de problema (Ajedrez, Acertijo Matemático GSM8K, Agente de Código), factor de exploración $C$, profundidad máxima y botón de ejecución paso a paso / continuo.
- **Lienzo Central (WebGPU):** Árbol 3D dinámico. El grosor y brillo de las aristas reflejan $N$ y $Q$. Las ramas muertas se desvanecen en `--void`. El camino ganador brilla en ámbar/oro.
- **El Raíl (Derecha):** Inspector semántico: texto del pensamiento actual, probabilidad del token, estado de las variables y log de decisión del crítico.
