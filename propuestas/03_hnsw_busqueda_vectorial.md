# Propuesta 03: HNSW (Hierarchical Navigable Small World)

## 1. Concepto y Fundamento
HNSW es el algoritmo estándar de la industria para indexación y búsqueda de vecinos más cercanos (ANN - Approximate Nearest Neighbors) en bases de datos vectoriales (Qdrant, Milvus, Pinecone, pgvector).

Funciona como una versión probabilística multicapa de una *Skip List* aplicada a grafos geométricos:
- Las capas superiores tienen pocos nodos y aristas de largo alcance (búsqueda supersónica rápida).
- Las capas inferiores son densas con enlaces locales de alta precisión.

---

## 2. Dinámica Interactiva de la Sala
1. **Visualización de Capas en 3D:** El usuario ve $L_0, L_1, L_2, \dots, L_k$ apiladas verticalmente en el espacio 3D, conectadas por líneas tenues.
2. **Lanzamiento de Query:** El usuario introduce una palabra, selecciona un punto del espacio o hace click en un vector.
3. **Simulación de la Búsqueda (Beam Search / Greedy):**
   - La búsqueda entra por el nodo de entrada (*Entry Point*) en la capa superior ($L_{max}$).
   - Salta de forma voraz (*greedy*) a los vecinos más cercanos a la query.
   - Cuando no encuentra un vecino mejor en esa capa, **desciende** verticalmente a la capa inferior.
   - En la capa base ($L_0$), ejecuta una búsqueda local refinada para devolver los $k$ vecinos exactos.
4. **Métricas en Vivo:** Número de comparaciones de distancia calculadas vs búsqueda por fuerza bruta ($O(\log N)$ vs $O(N)$), recall alcanzado y tiempo de GPU.

---

## 3. Integración en el Armazón Visual
- **El Cajón (Izquierda):**
  - Parámetros del índice HNSW: $M$ (máximo de conexiones por nodo), $efSearch$ (tamaño de la lista dinámica de exploración).
  - Selector de dataset (palabras en español/inglés, vectores sintéticos en clusters, embeddings temáticos).
  - Velocidad de reproducción (Paso a paso, cámara lenta, tiempo real).
- **Lienzo Central (WebGPU):**
  - Múltiples planos flotantes translúcidos con nodos y aristas k-NN.
  - La query viaja como una esfera luminosa pulsante dejando una estela lumínica en su trayectoria de saltos.
  - Aristas evaluadas se iluminan momentáneamente (rojo si se descartan, verde si acercan a la query).
- **El Raíl (Derecha):**
  - Traza de la búsqueda: Distancia euclidiana / coseno en cada salto.
  - Capa actual ($L_k \to L_0$).
  - Nodos en la cola de prioridad (*Candidates Queue*).
  - Vecinos más cercanos encontrados ($Top\text{-}k$).
