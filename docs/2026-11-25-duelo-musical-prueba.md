# Duelo musical — Prueba de un nivel

Fecha: 2026-11-25
Estado: **prueba** pedida por el usuario para ver cómo queda antes de decidir el diseño. No es un diseño aprobado: lo que aquí se llama «decisión mía» lo he resuelto yo para poder probar, y el usuario puede cambiarlo.

## 1. Lo que pidió el usuario (2026-11-25)

Su hijo quiere una versión del duelo con música:

- Seis canciones, una por nivel: Arena, Hierro, Bronce, Plata, Oro y un nivel nuevo por encima del oro, **Platino**.
- Cada uno elige su ejército. Suena la canción y los dos juegan a la vez: van cayendo por la pantalla **flechas y números** (como las flechas y el teclado numérico de un teclado, unas a un lado y otros al otro) al ritmo de la música, y hay que teclearlas.
- El primero que se equivoca **recibe una oleada de disparos** del contrincante, según los tanques y vehículos que este haya elegido. Así hasta destruir todo el ejército rival en esa ronda. Quien pierde queda eliminado y se pasa a la siguiente ronda.
- «¿Puedes probar con un nivel y vemos cómo se hace?»

## 2. Lo que hace la prueba

En «Nueva partida» hay una entrada nueva, **🎵 Duelo musical (prueba)**: un duelo contra la máquina en la liga Arena.

- **Tienda y asaltos: los del duelo.** Se compra, se mejora y se coloca igual; gana quien gana antes 3 asaltos; el dinero entre asaltos es el mismo.
- **El combate es la canción.** Al pulsar «¡Listo!» los ejércitos se quedan quietos donde se colocaron y empieza la canción de la liga. Por un carril en el centro de la arena bajan las teclas: **← ↓ ↑ →** a la izquierda y **1 2 3** a la derecha. Se pulsan cuando llegan a la línea (flechas del teclado; números de la fila de arriba o del teclado numérico; en una pantalla táctil, tocando el carril).
- **Fallar** es dejar pasar una tecla, pulsar otra o pulsar cuando no toca. Cada fallo trae una **descarga del ejército rival**: un disparo de cada unidad que le quede, con su daño (el blindaje y las explosiones cuentan como en el duelo). Los disparos van primero a los que están delante: lo que se coloca delante protege a lo de detrás.
- El asalto acaba cuando un ejército queda destruido. Si la canción se toca dos veces y siguen los dos en pie, gana quien conserve más ejército (como un combate al que se le acaba el tiempo).
- **La máquina** acierta una parte de las teclas (72 % en la liga Arena) y compra su ejército como en el duelo.
- La prueba **no toca el perfil**: ni experiencia ni liga.

### La canción

«Arena»: 100 pulsos por minuto, 28 compases (67 s), en re con la escala «hijaz» (aire de desierto), con el ritmo «maqsum» de la darbuka. Dos compases de percusión para prepararse, el tema, una respuesta más aguda con algunas notas rápidas, el tema con adornos y dos compases de cierre.

No es un archivo de sonido: está escrita nota a nota en `game/js/duelSongs.js` y el navegador la toca con osciladores (`game/js/duelMusic.js`). Así la música y las teclas no pueden desajustarse, se pausa con el juego y no pesa nada. **Las teclas son la propia melodía**: cada nota de la melodía tiene siempre la misma flecha, y la nota que abre cada compás es un número (1, 2, 3 y vuelta a empezar). 92 teclas por pasada, casi todas a una por pulso.

## 2 bis. Lo que el usuario dijo al probarla (2026-11-25) y lo que se hizo

- **«Añade también pulsaciones largas, no solo un tecleo rápido.»** Hecho: una tecla con cola se mantiene pulsada hasta que la cola se acaba (se puede soltar hasta 0,2 s antes). Soltarla antes es un fallo, con su descarga. En la canción escrita son las notas de dos pulsos o más.
- **«La canción es mega horrible… ¿podríamos incorporar una canción real de Suno y ajustar con los bajos o el ritmo las teclas?»** Sí, y el juego ya está preparado: una liga puede tener una **canción grabada** (un mp3) con las teclas escritas para ella. Falta la canción: el usuario la genera en Suno (pidió y se le dio un prompt, con un juego de ritmo de batallas musicales como referencia de estilo) y dice dónde está el archivo.
  - `python tools/duel/chart_from_audio.py <archivo> <liga> --name "…"` escucha la grabación: encuentra el tempo, los pulsos y los compases, y pone las teclas donde suenan el bombo, el bajo y la melodía — números en los golpes graves (1 en el primer pulso del compás, 3 en el tercero, 2 entre medias), flechas en la melodía (cada nota, siempre la misma flecha) y teclas largas donde una nota se sostiene. Copia la canción a `game/assets/music/` y escribe `game/js/duelTracks.js`. Imprime cuánto se fía del pulso que ha encontrado.
  - Comprobada con canciones fabricadas de tempo conocido (`tools/duel/test_chart_from_audio.py`): acierta el tempo a la centésima y coloca las teclas a menos de 10 ms del pulso. **Con una canción de verdad aún no se ha probado**: habrá que escuchar el resultado y ajustar.
  - Con una canción grabada es el combate el que sigue a la música (avanza lo que se ha oído), cada asalto empieza más adelante en la canción, y si la canción se acaba el asalto se decide como un combate sin tiempo.
  - Mientras una liga no tenga grabación, suena la canción escrita a notas.

## 3. Decisiones mías, para poder probar

| Decisión | Por qué | Si no es lo que se quería |
|---|---|---|
| Cada fallo trae una descarga, aunque fallen los dos a la vez (entonces disparan los dos) | «El primero que se equivoca» con las mismas teclas a la vez es, sencillamente, quien se equivoca | Cambiar la regla es poco: unas líneas en `duelRhythm.js` |
| Pulsar una tecla cuando no toca también es fallo | Si no, aporrear todas las teclas ganaría | Quitarlo es una línea |
| Un ejército tarda medio segundo en recargar tras una descarga | Para que pulsar la tecla buena justo después de la mala, o aporrear, se pague una sola vez | Es un número (`VOLLEY_RELOAD`) |
| Los ejércitos no se mueven; el alcance y la velocidad no cuentan. La cadencia hace la descarga más fuerte | Lo pedido es «una oleada de disparos», no un combate | Las mejoras de alcance y velocidad no sirven aquí: habría que quitarlas de la tienda musical o darles otro efecto |
| Se conservan los asaltos del duelo (al mejor de 5) | «El que pierde es eliminado y pasas a la siguiente ronda» lo he leído como perder el asalto | Si era un torneo por eliminatorias, cambia la estructura del duelo, no la del combate |
| La canción está sintetizada, no grabada | Una prueba sin depender de servicios de fuera, y con el ritmo exacto | Se pueden encargar canciones a un generador de música o grabarlas; habría que marcarles el pulso para sacar las teclas |
| Solo contra la máquina | Es una prueba | En la red de casa habría que llevar el combate musical al servidor (`host.js`) |

## 4. Lo que falta si se sigue adelante

- Las otras cinco canciones, cada una más rápida y con más teclas (más números, notas dobles), y la sexta liga, **Platino**, con su arena (hoy hay cinco arenas hechas en Blender).
- Dos jugadores (en un mismo teclado o en la red de casa).
- Ajustar los números con gente jugando: el margen para acertar (0,18 s), cuánto acierta la máquina, la fuerza de una descarga.
- En móviles, teclas grandes para los dedos (el carril se puede tocar, pero es estrecho).
- Que cuente para el perfil y la liga, si se quiere.

## 5. Cómo está hecho

- `game/js/duelSongs.js` — las canciones y sus teclas: las grabadas (de `game/js/duelTracks.js`, que escribe la herramienta) o, si no hay, la escrita como notas (sin página ni sonido; probado).
- `game/js/duelRhythm.js` — las reglas: `createMusicalDuel`, `pressKey`, `releaseKey`, `stepMusicalDuel` sobre el estado del duelo, con una parte `musical` (sin página; probado). Lo demás del duelo sigue en `duel.js`, que ahora exporta `landHit`, `damageOn` y `settleFight`.
- `game/js/duelMusic.js` — toca la canción con Web Audio: la escrita, siguiendo el reloj del combate; la grabada, marcándoselo.
- `game/js/duelRhythmDraw.js` — el carril de teclas sobre la arena.
- `game/js/duelScreen.js` — lo engancha: `start(arena, { musical })`, `key(code)`, la música y el dibujo; `main.js` le pasa el teclado y calla la música del juego mientras dura.
