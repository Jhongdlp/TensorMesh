"""Sala 08 — el corpus. Qué artículos entran y por qué esos.

La sala enseña **búsqueda híbrida**, y un corpus mal elegido la deja sin nada
que enseñar: si cada tema usa su propio vocabulario y ninguno se pisa con otro,
BM25 y el buscador denso devuelven siempre lo mismo y la fusión no cambia nada.
Así que el corpus está montado a propósito con tres trampas dentro:

1. **Palabras que significan cosas distintas en dos temas.** «memoria», «red»,
   «modelo», «campo», «peso». BM25 no las distingue —le da igual el sentido— y
   el denso sí. Es el caso en el que gana el denso.

2. **Nombres propios y siglas raras.** «Okapi BM25», «Kolmogórov», «Schrödinger».
   Casi no aparecen en el vocabulario de fastText, así que el denso no los ve;
   BM25 los clava porque son términos de idf altísimo. Es el caso en el que gana
   el disperso, y el que justifica que la sala tenga las dos mitades.

3. **Paráfrasis sin solape léxico.** Preguntar «¿cómo aprende una máquina de sus
   errores?» no comparte ni una palabra con «retropropagación», que es la
   respuesta. Ahí el disperso devuelve cero y el denso acierta.

Los temas se solapan a propósito (redes neuronales artificiales contra neuronas
de verdad, memoria de un ordenador contra memoria de un cerebro): sin solape la
fusión sería decorativa.
"""

#: Temas. El índice es el que colorea la nube: el color dice de qué documento
#: viene el chunk, que es lo único que el dibujo puede decir sin etiquetas.
THEMES = {
    "es": [
        "Aprendizaje automático",
        "Recuperación de información",
        "Lengua y significado",
        "Cerebro y memoria",
        "Física",
    ],
    "en": [
        "Machine learning",
        "Information retrieval",
        "Language and meaning",
        "Brain and memory",
        "Physics",
    ],
}

#: (título en Wikipedia, tema). El título es el de la página; `redirects=1` en la
#: API resuelve las variantes, pero si una no existe el pipeline lo dice en vez
#: de publicar un corpus con agujeros.
DOCS = {
    "es": [
        ("Aprendizaje automático", 0),
        ("Aprendizaje profundo", 0),
        ("Red neuronal artificial", 0),
        ("Propagación hacia atrás", 0),
        ("Transformador (modelo de aprendizaje automático)", 0),
        ("Modelo extenso de lenguaje", 0),
        ("Sobreajuste", 0),

        ("Recuperación de información", 1),
        ("Motor de búsqueda", 1),
        ("Tf-idf", 1),
        ("Okapi BM25", 1),
        ("Índice invertido", 1),
        ("Word embedding", 1),
        ("Similitud coseno", 1),

        ("Lingüística", 2),
        ("Semántica", 2),
        ("Procesamiento de lenguajes naturales", 2),
        ("Sintaxis", 2),
        ("Polisemia", 2),

        ("Neurona", 3),
        ("Cerebro humano", 3),
        ("Sinapsis", 3),
        ("Memoria (proceso)", 3),
        ("Plasticidad neuronal", 3),

        ("Mecánica cuántica", 4),
        ("Entrelazamiento cuántico", 4),
        ("Agujero negro", 4),
        ("Entropía", 4),
        ("Teoría de la relatividad", 4),
    ],
    "en": [
        ("Machine learning", 0),
        ("Deep learning", 0),
        ("Artificial neural network", 0),
        ("Backpropagation", 0),
        ("Transformer (deep learning architecture)", 0),
        ("Large language model", 0),
        ("Overfitting", 0),

        ("Information retrieval", 1),
        ("Search engine", 1),
        ("Tf–idf", 1),
        ("Okapi BM25", 1),
        ("Inverted index", 1),
        ("Word embedding", 1),
        ("Cosine similarity", 1),

        ("Linguistics", 2),
        ("Semantics", 2),
        ("Natural language processing", 2),
        ("Syntax", 2),
        ("Polysemy", 2),

        ("Neuron", 3),
        ("Human brain", 3),
        ("Synapse", 3),
        ("Memory", 3),
        ("Neuroplasticity", 3),

        ("Quantum mechanics", 4),
        ("Quantum entanglement", 4),
        ("Black hole", 4),
        ("Entropy", 4),
        ("Theory of relativity", 4),
    ],
}
