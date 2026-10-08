# Menú principal y guardado de partida — Diseño

Fecha: 2026-10-08
Estado: aprobado en conversación, pendiente de revisión por escrito

## 1. Contexto

Primera de cuatro partes acordadas con el usuario, en este orden:

1. **Menú principal y guardar/cargar partida** (este documento).
2. Modo atacante para un jugador, contra una defensa controlada por el ordenador.
3. Dos jugadores en el mismo PC.
4. Salas en línea con código para invitar a amigos.

Esta parte deja preparado el menú para las otras tres (aparecen como «próximamente»), pero no implementa ninguna de ellas.

## 2. Objetivo

- Un menú principal como primera pantalla del juego, desde el que se empieza, se continúa o se carga una partida.
- Guardar y cargar partidas, tanto las de un jugador (en el navegador) como la cooperativa de casa (en el PC que hace de servidor), de forma que reiniciar el servidor ya no borre la partida en curso.
- Ajustes de sonido separados para música y efectos.

## 3. Menú principal

Sustituye a la pantalla actual «Elige nivel». Fondo: un mapa del juego oscurecido. Título: **TOWER DEFENSE**.

Botones, de arriba abajo:

| Botón | Qué hace |
|---|---|
| **Continuar** | Solo aparece si hay autoguardado. Lo carga y entra en la partida. |
| **Nueva partida** | Pantalla «¿Cómo quieres jugar?»: **Defender** (el juego actual) o **Atacar** (en gris, «próximamente»). Tras Defender, la elección de nivel con las 4 tarjetas actuales. |
| **Cargar partida** | Lista del autoguardado y 3 huecos. Cada uno muestra nivel, oleada, vidas, dinero y fecha, con botón «Cargar»; los vacíos aparecen como «Vacío». |
| **Multijugador** | «En casa (red local)», «2 jugadores en este PC» (próximamente) y «En línea» (próximamente). Ver sección 6. |
| **Récords** | Abre el ranking y estadísticas 🏆 que ya existen. |
| **Ajustes** | Música sí/no y efectos sí/no (sección 7). |

Se navega con botones «Volver» en cada pantalla interna; Esc también vuelve atrás.

### 3.1 Menú de pausa (durante la partida)

Un botón **☰** en los controles de arriba (sustituye al ⟲ actual) y la tecla **Esc** abren el menú de pausa. Si al pulsar Esc hay una torre o un muro seleccionados para construir, Esc primero cancela esa selección; la siguiente pulsación abre el menú. Abrirlo pausa la partida en un jugador y cerrarlo la deja como estaba (si ya estaba en pausa con ⏸, sigue en pausa); en cooperativo no pausa a los demás (se usa el ⏸ compartido, como ahora).

Opciones:

- **Seguir** — cierra el menú.
- **Guardar partida** — elige hueco 1, 2 o 3 (sobrescribir uno ocupado pide confirmación). Solo entre oleadas; durante una oleada aparece en gris con el aviso «Podrás guardar al terminar la oleada».
- **Cargar partida** — la misma lista que en el menú principal. Pide confirmación porque se pierde lo no guardado.
- **Nueva partida** — vuelve a «¿Cómo quieres jugar?». Pide confirmación.
- **Ajustes**.
- **Salir al menú principal** — pide confirmación, recordando que lo jugado se conserva hasta la última oleada terminada (el autoguardado).

Al terminar una partida (derrota o victoria final), «Jugar de nuevo» y la tecla R llevan a «¿Cómo quieres jugar?», como hoy llevan a la elección de nivel.

## 4. Guardado

### 4.1 Cuándo

- **Autoguardado:** al terminar cada oleada (cuando el tablero queda vacío y empieza la cuenta atrás de la siguiente) y al empezar un nivel nuevo.
- **Guardado manual:** desde el menú de pausa, solo entre oleadas.

Solo entre oleadas porque en ese momento no hay enemigos ni disparos en el campo: no hace falta guardar cada unidad en movimiento ni cada proyectil, y los guardados no se rompen si se retocan las carreteras de un mapa. Si se sale a mitad de una oleada, «Continuar» retoma desde el principio de esa oleada.

Si el jugador adelanta oleadas sin parar (botón «+Oleada»), el autoguardado espera al primer momento en que el tablero quede vacío.

Tras una derrota, el autoguardado se conserva: «Continuar» permite reintentar desde la última oleada superada.

### 4.2 Qué se guarda

Se guardan las decisiones del jugador, no los valores calculados:

- Versión del formato, fecha y hora.
- Nivel, oleada (índice), oleadas superadas en total.
- Dinero y vidas.
- Cada torre: tipo, posición, niveles de cada mejora, vida, munición y tiempo de construcción pendiente.
- Cada muro: posición y vida.
- Estadísticas de la campaña (bajas por tipo, torres construidas/perdidas, dinero gastado), que alimentan la puntuación y el ranking.

No se guardan enemigos, proyectiles, explosiones ni la cola de aparición (se reconstruye a partir de la oleada).

### 4.3 Cómo se carga

1. Se crea una partida nueva del nivel guardado.
2. Se restauran dinero, vidas, oleada y estadísticas.
3. Cada torre se construye de cero con su tipo y se le **vuelven a aplicar sus mejoras** nivel a nivel; después se fijan su vida y munición (recortadas al máximo actual). Así, si en el futuro se reequilibran las mejoras, los guardados antiguos reciben los valores nuevos.
4. Se colocan los muros.
5. Los identificadores internos continúan por encima del mayor identificador cargado, para que nada nuevo choque con lo restaurado.
6. La partida queda **en pausa**, en la cuenta atrás antes de la siguiente oleada.

Un guardado con campos desconocidos se carga ignorándolos; si le faltan campos se usan los valores por defecto. Un guardado ilegible o de una versión incompatible aparece en la lista como «No se puede cargar» y no rompe el menú.

### 4.4 Dónde

- **Un jugador:** en el almacenamiento del navegador (`localStorage`), una clave por hueco (autoguardado, 1, 2 y 3), para que un hueco dañado no afecte a los demás. Si el navegador no permite guardar (modo privado, almacenamiento bloqueado), el juego funciona igual y el menú indica que no se puede guardar en este navegador.
- **Cooperativo de casa:** en el PC que ejecuta el servidor, en `game/data/saves.json` (junto a `leaderboard.json`), escrito de forma segura (archivo temporal y renombrado) para no dejarlo a medias si se corta.

## 5. Cooperativo de casa

- El servidor autoguarda igual que el juego en solitario (sección 4.1).
- **Al arrancar el servidor**, si hay autoguardado, la partida se reanuda desde él (en pausa). Reiniciar el servidor para actualizar el juego deja de borrar la partida.
- Cualquier jugador puede **guardar** en un hueco del servidor desde su dispositivo.
- **Cargar** y **Nueva partida** afectan a todos los conectados, así que piden confirmación («Esto cambiará la partida para todos»).
- Nuevas acciones del servidor: guardar en un hueco, cargar un hueco y consultar la lista de guardados (nivel, oleada, vidas, dinero, fecha) para mostrarla en el menú.
- Al abrir el juego desde el servidor de casa se entra directamente en la partida en curso, como ahora. En el menú principal, «Continuar» pasa a llamarse **«Volver a la partida»**.

## 6. Pantalla Multijugador

- **En casa (red local):**
  - Si el juego se ha abierto desde el servidor de casa, muestra la dirección que deben abrir los demás dispositivos (la misma desde la que se está jugando) y un botón «Volver a la partida».
  - Si no (por ejemplo, desde la web pública), explica en una frase que el modo en casa necesita el ordenador que hace de servidor.
- **2 jugadores en este PC:** próximamente (parte 3).
- **En línea:** próximamente (parte 4).

## 7. Ajustes

- **Música** sí/no y **Efectos** sí/no, por separado.
- Se recuerdan en el navegador (cada dispositivo los suyos).
- El botón 🔊 de arriba sigue silenciando todo de golpe.

## 8. Estructura del código

- `js/simulate.js`: funciones puras para crear un guardado a partir del estado y para restaurarlo (aquí, porque el contador de identificadores vive en este módulo). Las usan tanto el navegador como el servidor.
- `js/saves.js` (nuevo): lectura y escritura de huecos en el navegador, a prueba de almacenamiento no disponible o datos dañados.
- `js/menu.js` (nuevo): las pantallas del menú principal y del menú de pausa (mostrar, navegar, confirmar). `main.js` solo le pasa las acciones (nueva partida, cargar, guardar...), para no seguir agrandando `main.js`.
- `js/audio.js`: música y efectos activables por separado.
- `server.js`: nuevas acciones de guardar, cargar y listar; autoguardado; reanudación al arrancar. La lectura y escritura de `saves.json` va en funciones separadas que se puedan probar.
- `index.html` / `style.css`: el menú principal y el de pausa, con el mismo estilo que los paneles actuales (fondo oscuro, borde cian, títulos amarillos).

## 9. Pruebas

- Guardar y cargar devuelve las mismas torres (tipo, posición, mejoras, vida, munición), muros, dinero, vidas, oleada y estadísticas.
- Tras cargar, la siguiente oleada aparece con normalidad y los objetos nuevos no repiten identificador.
- Al cargar, las torres se reconstruyen reaplicando sus mejoras (sus valores coinciden con los de una torre mejorada igual en una partida nueva).
- Guardados con campos de más o de menos se cargan; uno dañado se rechaza sin romper nada.
- El autoguardado se produce al terminar una oleada y al empezar un nivel, y no durante una oleada.
- Servidor: guardar, listar y cargar huecos; `saves.json` sobrevive a un reinicio y el servidor reanuda la partida al arrancar (probado en el puerto de pruebas 8431, nunca en el 8420 de la familia).
- Navegador: recorrido completo del menú (nueva partida, continuar, guardar, cargar, ajustes, salir), y que los ajustes se recuerden al recargar.

## 10. Fuera de alcance

- Modo atacante, dos jugadores en el mismo PC y salas en línea (partes 2 a 4): solo aparecen en el menú como «próximamente».
- Guardar a mitad de una oleada.
- Guardados en la nube o compartidos entre dispositivos (cada navegador guarda los suyos; el cooperativo, en el PC servidor).
