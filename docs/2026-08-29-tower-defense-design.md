# Tower Defense militar — Diseño

Fecha: 2026-08-29
Origen: `Imágenes/Instrucciones Juego.docx` + `tanques.jpg`, `mapa.jpg`, `explosiones.jpg` (mockup HUD), `ENEMIGOS CENITAL.jpg`

## 1. Resumen

Tower Defense de navegador (HTML5 Canvas + JavaScript puro, sin frameworks ni build step). Se juega abriendo `index.html` vía un servidor local. El objetivo es un prototipo completo y jugable, con arte extraído de las imágenes reales del proyecto (nada generado de cero), pensado para que un niño pueda leer el código y entender/modificar cada sistema.

Referencia de todas las reglas de juego: la sección "Lógica del Juego" del Word, más los valores visibles en el mockup de HUD (`explosiones.jpg`).

## 2. Pipeline de arte (una sola vez, con Python/PIL)

Script `tools/extract_assets.py` que genera `game/assets/*.png` a partir de las imágenes fuente:

| Sprite | Fuente | Procesado |
|---|---|---|
| `tower_basic.png` (Vanquisher) | `tanques.jpg`, torreta superior | Recorte + fondo transparente (color-key sobre el gris oscuro de fondo) |
| `tower_double.png` (Cyclone) | `tanques.jpg`, torreta central | Igual |
| `tower_laser.png` (Tempest) | `tanques.jpg`, torreta inferior | Igual |
| `enemy_soldier.png` | `ENEMIGOS CENITAL.jpg`, un soldado cenital del grid inferior derecho | Recorte + fondo transparente |
| `enemy_buggy.png` | `ENEMIGOS CENITAL.jpg`, chasis cenital superior derecho | Recorte + fondo transparente |
| `enemy_tank.png` | `ENEMIGOS CENITAL.jpg`, torreta cenital superior izquierda | Recorte + **tinte rojizo/óxido** (para diferenciarlo visualmente de las torres del jugador, que usan la misma familia de arte) |
| `explosion.png` | `explosiones.jpg` (mockup), estallido de fuego/humo esquina inferior izquierda | Recorte |
| `map_bg.png` | `mapa.jpg` | Recorte del terreno; se tapa el rótulo "ENEMY PATH" y el minimapa de esquina clonando textura de hierba cercana |

Los waypoints del camino (para el pathfinding) **no** se extraen de la imagen automáticamente: se marcan a mano como lista de coordenadas `[x,y]` mirando `map_bg.png`, seleccionando puntos que sigan la curva en S visible en el mapa.

Coste: 0 créditos — todo el procesado es local con PIL, sin llamadas a IA.

## 3. Estructura de archivos

```
Projects/JUEGO CAÑONES/
├── docs/2026-08-29-tower-defense-design.md   (este documento)
├── tools/extract_assets.py                    (script de recorte, se ejecuta una vez)
└── game/
    ├── index.html
    ├── style.css
    ├── assets/            (PNGs generados por el pipeline de arte)
    └── js/
        ├── main.js         (bucle de juego, requestAnimationFrame)
        ├── map.js           (Sistema A: waypoints, dibujado del fondo)
        ├── waves.js         (Sistema A: spawner y definición de oleadas)
        ├── enemy.js         (Sistema B: vida, movimiento, disparo, muerte)
        ├── tower.js         (Sistema C: apuntado, disparo, recarga, colocación)
        ├── projectile.js    (balas/láseres en vuelo + colisión)
        ├── economy.js       (Sistema D: dinero, vidas, mejoras)
        ├── upgrades.js      (árbol de mejoras: 3 skills x 5 niveles)
        └── ui.js            (HUD, panel de mejoras, menú de construcción)
```

## 4. Sistema A — Camino y oleadas

- El camino es un array de waypoints `{x, y}` trazado sobre `map_bg.png`. Los enemigos se mueven en línea recta entre waypoints consecutivos a su `speed`.
- `Spawner`: en cada oleada, una lista de `{tipo, cantidad, intervalo}` define qué se crea y cuándo (ej. ola 1 = 5 soldados espaciados 1s; ola 2 = 3 buggies + 2 tanques).
- La oleada actual empieza sola tras un breve delay cuando la anterior termina, o al pulsar el botón de "play" del HUD (icono ▶ del mockup) para adelantarla.
- Definición de oleadas: array de datos en `waves.js`, fácil de ampliar (empezamos con ~10 oleadas crecientes en dificultad).

## 5. Sistema B — Enemigos

3 tipos, con estos roles (mapeados a "normales, pesados y rápidos" del Word):

| Tipo | Rol | HP | Velocidad | Daño a base | Dispara |
|---|---|---|---|---|---|
| Soldado | normal | medio | media | 1 vida | Sí, corto alcance, daño bajo |
| Buggy | rápido | bajo | alta | 1 vida | Sí, alcance medio, daño bajo |
| Tanque | pesado | alto | baja | 2 vidas | Sí, alcance medio, daño medio |

- Cada enemigo tiene barra de vida visible sobre su sprite que baja con cada impacto recibido.
- Al llegar a la meta: resta vidas al jugador y se destruye.
- Al morir (HP ≤ 0): suelta dinero (variable por tipo) y se reproduce `explosion.png` con una pequeña animación (escala + fade, con código, ya que solo tenemos un frame estático).
- Los enemigos disparan a la torre más cercana en su rango (mismo patrón de apuntado que las torres, ver Sistema C).

## 6. Sistema C — Torres

3 tipos (Vanquisher/básica, Cyclone/doble, Tempest/láser), con límite simultáneo en el campo según el Word:

| Tipo | Máx. en juego | Daño | Alcance | Cadencia | Disparos antes de recargar | Recarga |
|---|---|---|---|---|---|---|
| Básica | 6 | medio | medio | media | 20 | 2s |
| Doble | 4 | medio-bajo x2 proyectiles | medio | alta | 20 | 3s |
| Láser | 2 | alto | alto | baja | 20 | 5s |

- **Colocación**: clic en icono del menú inferior → aparece una torre fantasma semitransparente que sigue el cursor → clic en zona de hierba válida (no sobre el camino) y con dinero suficiente → se construye y se descuenta el coste. Si se supera el máximo de ese tipo, el icono se deshabilita.
- **Apuntado**: cada frame, buscar el enemigo más cercano dentro de `range`; si lo hay, rotar el sprite de la torreta hacia él (interpolado, no instantáneo, para que se vea natural).
- **Disparo**: temporizador según `fire_rate`; al cumplirse y con objetivo válido y munición > 0, crear un `Projectile` dirigido al enemigo, restar una unidad de energía/munición, mostrar fogonazo. Al llegar a 0 munición, entra en recarga (barra de energía se rellena con el tiempo de `reload`).
- **Vida de la torre**: baja con los disparos de los enemigos; visualmente se le añaden marcas de daño (overlay semitransparente oscuro que aumenta con el daño). Si llega a 0, la torre queda destruida (se puede reconstruir pagando de nuevo, o restaurar vida con puntos como indica el Word).
- **Selección**: clic sobre una torre construida la selecciona y muestra su panel de mejoras individual (igual que el mockup).

## 7. Sistema D — Economía y mejoras

- Estado global (`economy.js`): `dinero`, `vidas`, `olaActual`.
- Mejoras por torre (no globales): cada torre construida tiene su propio nivel 0-5 en `daño`, `alcance`, `velocidad_disparo`.
- Fórmulas (ejemplo, ajustable): cada nivel multiplica el stat base:
  - Daño: `× 1.35` por nivel (5 niveles → hasta ×~4.4 acumulado, o se puede aplicar linealmente; se ajustará jugando)
  - Alcance: `× 1.20` por nivel
  - Velocidad de disparo: `× 0.85` al tiempo de recarga entre disparos por nivel (más rápido)
  - Coste de cada mejora sube con el nivel (ej. `coste_base × (nivel_actual + 1)`)
- Además del árbol de mejoras, un botón "reparar" gasta dinero para restaurar la vida de la torre seleccionada a máximo (como pide el Word: "canjear... en restaurar su vida").
- **Feedback visual de mejora**: cada torre dibuja pequeños indicadores (ej. franjas o un halo de color que se intensifica) según la suma de niveles, para que se note a simple vista que está mejorada.

## 8. HUD / UI (siguiendo el mockup de `explosiones.jpg`)

- Barra superior: número de oleada + botón ▶ para adelantar, corazones + vidas restantes, dinero `$`.
- Menú inferior: iconos de las 3 torres para construir (con coste y contador de "quedan N/6" etc.).
- Al seleccionar una torre: panel con 3 columnas (Daño / Alcance / Velocidad de disparo) mostrando nivel actual y coste de la siguiente mejora, más un icono de papelera para vender/desmantelar la torre.
- Barras de vida (rojo) y energía/munición (azul o amarillo) flotando sobre cada torre y enemigo.

## 9. Sonido (fase final, opcional si el tiempo aprieta)

- Disparo cañón básico, ráfaga para la doble, sonido de carga de energía para el láser.
- Explosión al morir un enemigo.
- Música militar de fondo en bucle, con botón de mute.
- Fuentes: efectos de librerías de sonido libres (a buscar), no se generan con IA salvo que se pida explícitamente.

## 10. Fuera de alcance (v1)

- Multijugador, guardado de partida, niveles/mapas adicionales, ranking online.
- Física de proyectiles con gravedad/parábola — los proyectiles van en línea recta al objetivo (suficiente para el estilo top-down).

## 11. Verificación

Cada fase se prueba en el navegador real (servidor local + Browser pane) antes de darse por cerrada: capturas de pantalla, colocación de torres, disparo, oleada completa, mejora aplicada visualmente, y comprobación de que no hay errores en consola.
