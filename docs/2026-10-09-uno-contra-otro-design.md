# Uno contra otro en la red de casa — Diseño

Fecha: 2026-10-09
Estado: hecho (2026-10-09). Probado con dos pestañas contra un servidor de prueba: crear, unirse, preparar, ronda, pausa, recarga a mitad de ronda, desconexión, final y revancha.

## 1. Contexto

Tercera de las cuatro partes acordadas:

1. Menú principal y guardar/cargar partida (hecha).
2. Modo atacante para un jugador, contra una defensa controlada por el ordenador (hecha).
3. **Uno contra otro en la red de casa** (este documento).
4. Salas en línea con código para invitar a amigos.

La parte 3 se llamaba «dos jugadores en el mismo PC». El usuario la ha cambiado (2026-10-09): «un jugador defiende y otro ataca dentro de la misma wifi pero en diferentes ordenadores. En un solo ordenador no es cómo jugar con 2 jugadores».

El modo atacante (parte 2) ya se hizo pensando en esto: la defensa del ordenador solo usa las acciones que tiene un jugador defensor (colocar torre, mejorar, reparar, muro). Aquí esas acciones las hace una persona.

## 2. Objetivo

Un jugador defiende y otro ataca, cada uno desde su ordenador (o su móvil o tableta), conectados a la misma wifi. Se juega con las reglas del modo atacante, con una persona en el lugar de la defensa del ordenador.

## 3. Cómo se conectan

- **Un ordenador de casa hace de servidor**, como hoy para jugar en red: arranca `node server.js`, que escribe en pantalla la dirección para los demás aparatos de la wifi (por ejemplo `http://192.168.1.20:8420`).
- **Los dos jugadores abren esa dirección** en su navegador. Uno de ellos puede jugar en el mismo ordenador que hace de servidor (con `http://localhost:8420`).
- **El servidor lleva la partida:** la simulación corre en él; cada navegador manda las acciones de su bando y dibuja lo que le llega, como en el modo cooperativo de hoy.
- **Cada pestaña del navegador se identifica** con un código que inventa al abrirse y guarda mientras siga abierta (no hace falta nombre ni contraseña). Si se recarga la página, el servidor la reconoce y la devuelve a su bando.

## 4. El menú en la red de casa

**Nueva partida → «¿Cómo queréis jugar?»**, con dos opciones:

- **Defender juntos:** el modo cooperativo de hoy. Todos los aparatos defienden el mismo mapa → elegir nivel.
- **Uno contra otro:** elegir mapa → elegir **tu bando** (Defender o Atacar) → elegir el **dinero de la defensa** → pantalla de espera: «Esperando al otro jugador… Que abra **http://192.168.1.20:8420** en su ordenador».

El dinero de la defensa sirve para dar ventaja a uno de los dos. Usa las cantidades de las dificultades de la defensa del ordenador:

| Dinero de la defensa | Al empezar | Por ronda |
|---|---|---|
| Poco | $250 | $60 |
| Normal (elegido por defecto) | $350 | $90 |
| Mucho | $450 | $120 |

**El otro jugador** abre la dirección. Si hay una partida uno contra otro esperando jugador, ve directamente la pantalla **«Unirse a la partida»**: «Mapa 2 · Te toca atacar · Dinero de la defensa: Normal», con los botones **Unirse** y **Volver**.

Lo que ve al abrir la dirección:

| En el servidor hay… | Lo que ve |
|---|---|
| Una partida «Defender juntos» | La partida, como hoy |
| Una partida uno contra otro en la que ya juega con esta pestaña | Su partida, en su bando |
| Una partida uno contra otro con un bando libre | «Unirse a la partida» (si los dos bandos están libres, puede elegir cuál) |
| Una partida uno contra otro con los dos jugadores conectados | «Hay una partida uno contra otro en marcha», con Ajustes y nada más |

«Atacar» contra la defensa del ordenador sigue siendo solo para la partida individual (abriendo el juego sin el servidor de casa).

## 5. Preparación y rondas

Igual que en el modo atacante (diseño del modo atacante, §3.2–3.3):

- **Preparación sin reloj.** El defensor recibe su dinero inicial y construye. El atacante recibe el dinero de la ronda 1 y compra unidades.
- **«¡Listo!»:** cada jugador tiene el suyo, en el sitio del botón «¡Al ataque!». La ronda 1 empieza cuando los dos lo han pulsado. Cada uno ve si el otro está listo («El atacante está listo»).
- **15 rondas de 60 segundos,** sin pausas entre rondas.
- **Al empezar cada ronda:** el atacante cobra lo de su ronda y el defensor su dinero por ronda (tabla de §4).
- **Recompensa del defensor:** por cada unidad que destruye, la cuarta parte de la recompensa del modo defensa, como la defensa del ordenador.
- **Dinero del atacante, unidades, mejoras, tope de 60 y vidas de la base:** exactamente los del modo atacante.

## 6. El defensor

- **Controles del modo defensa:** construir torres en los sitios de siempre, mejorarlas, repararlas, venderlas y poner muros. Con el ratón, el teclado o el dedo, como hoy.
- **Muros siempre permitidos** (la defensa del ordenador solo los pone en Difícil).
- **Las reglas que se añadieron a la defensa del ordenador para que fuera justa valen también para él:**
  - No puede construir una torre que alcance el **tramo seguro de cada entrada**: los primeros 320 px de carretera, donde aparecen y esperan las unidades compradas. Ese tramo termina siempre al menos 400 px antes de la base.
  - No puede mejorar el alcance de una torre si con él llegaría a ese tramo.
  - Mientras elige dónde construir, el tramo seguro se ve en su mapa como carretera rayada en rojo. Los sitios donde ese tipo de torre lo alcanzaría salen en rojo, con el aviso «Alcanzaría la entrada del ejército».
  - La otra regla de la defensa del ordenador (no empezar una torre al alcance de una unidad) no se aplica a él: decide él si se arriesga.
- **Ve todo el mapa,** también las unidades del atacante, igual que la defensa del ordenador. No tiene niebla.
- **Marcador:** ronda (*n*/15), tiempo que queda de la ronda, su dinero, vidas de la base y unidades del atacante en el mapa (*n*/60).

## 7. El atacante

Todo como en el modo atacante: tienda, banderas de entrada, controles al estilo Command & Conquer, mejoras por tipo de unidad, niebla de guerra y minimapa. Solo él ve la niebla.

En un móvil o tableta juega con el **ejército automático** (diseño del modo atacante, §4.5). Como la partida corre en el servidor, el ejército automático de ese jugador también corre allí.

## 8. Pausa y desconexiones

- **Pausar:** el botón ⏸, la tecla de pausa o abrir el menú. La partida se para para los dos, y el otro ve «Pausa: el defensor ha parado la partida».
- **Seguir:** solo quien la paró (⏸ otra vez o «Seguir» en el menú). Así a nadie le reanudan la partida mientras no está. Si quien la paró se ha desconectado, puede seguir el otro.
- **Desconexión:** si un jugador deja de dar señales durante 5 segundos, la partida se pausa sola («El atacante se ha desconectado. Esperando a que vuelva…») y su bando queda libre.
  - Si recarga la página, vuelve a su bando.
  - Si la cierra, al abrir otra vez la dirección (en ese aparato o en otro) ve «Unirse a la partida» con su bando libre.
  - La partida sigue pausada hasta que el que vuelve pulsa «Seguir».

## 9. Fin de la partida

- Gana el atacante si deja la base a 0 vidas antes de que termine la ronda 15. Gana el defensor si termina la ronda 15 con vidas.
- Cada uno ve **«¡Has ganado!»** o **«Has perdido»** y el resumen de la partida: ronda alcanzada, vidas quitadas, torres destruidas, unidades perdidas y dinero gastado por cada bando.
- **«Revancha»:** empieza otra partida en el mismo mapa y con el mismo dinero de la defensa, **cambiando los bandos**. Cualquiera de los dos puede pulsarla; el otro pasa a la nueva partida en su nuevo bando. Empieza en la preparación, así que no pierde nada aunque aún estuviera mirando el resumen.
- **«Menú principal».**
- Las partidas uno contra otro no entran en el ranking de puntuaciones.

## 10. Guardado

- **Autoguardado** al empezar la preparación y cada ronda, en el archivo del servidor (`data/saves.json`), como el cooperativo.
- **Guardado manual** en los 3 huecos desde el menú de pausa, por cualquiera de los dos. Durante una ronda queda pedido y se hace al empezar la siguiente, como en el modo atacante.
- **Qué guarda:** lo mismo que una partida de ataque, más que es uno contra otro y el dinero de la defensa elegido. La lista la muestra como «Uno contra otro · Nivel 2 · Ronda 5 · ❤ 12 · …».
- **Cargar:** la partida vuelve al principio de esa ronda, en pausa.
  - Quien ya estaba jugando uno contra otro conserva su bando.
  - Los bandos sin jugador quedan libres, y cada uno se une al suyo con «Unirse a la partida».
- **Reiniciar el servidor** recupera el último autoguardado, como hoy. Los dos bandos quedan libres hasta que los jugadores vuelven a unirse.

## 11. Quién puede cambiar la partida

- Mientras los dos jugadores de una partida uno contra otro están conectados, **solo ellos** pueden empezar una partida nueva o cargar otra, con la pregunta «Esto terminará la partida para los dos. ¿Seguir?». Los demás aparatos de casa no pueden cambiarla.
- En «Defender juntos», o si no hay nadie conectado, cualquiera puede, como hoy.

## 12. Estructura del código

- `js/versus.js` (nuevo, lógica pura y sin red, para poder probarla): la partida uno contra otro alrededor del estado del modo atacante. Bandos y quién los ocupa, unirse, reconocer al que vuelve, desconexión, «¡Listo!» de los dos, de quién es la pausa, revancha cambiando de bando.
- `js/attack.js`: el estado de ataque dice quién defiende (el ordenador o una persona). Con una persona no actúa la defensa del ordenador, y el dinero por ronda sale de la tabla de §4.
- **El tramo seguro de las entradas** pasa de las elecciones de `defenseAI.js` a las propias acciones de colocar torre y mejorar alcance cuando la partida es de ataque. Así obliga igual a los dos defensores.
- `server.js`: corre cualquier tipo de partida (`modes.js`). Sabe qué pestaña ocupa cada bando, por el código que manda cada una al pedir el estado. Rechaza las acciones del bando contrario. Corre el ejército automático del atacante que juega en el móvil.
- **Envío del estado:** la niebla viaja en forma compacta, porque las tablas de bytes no se pueden mandar tal cual.
- `js/main.js`: la interfaz depende del **bando** de quien juega, no solo del modo de la partida. El defensor de una partida de ataque usa la interfaz de la defensa. Añade las pantallas de espera y de unirse, el botón «¡Listo!», el aviso de pausa y desconexión, y el final de partida de cada bando con la revancha.
- `js/menu.js` e `index.html`: las pantallas de §4. En «Multijugador», la opción «2 jugadores en este PC (próximamente)» se quita; la explicación de la red de casa habla de los dos modos.
- `js/menu.js` (`describeSave`) y el guardado: el tipo «Uno contra otro» en la lista de partidas.

## 13. Pruebas

- **Tests automáticos:**
  - Bandos: crear con un bando y dinero; unirse al libre; no unirse a uno ocupado; recargar devuelve al mismo bando; desconexión a los 5 s pausa y libera el bando.
  - «¡Listo!»: la ronda 1 empieza solo con los dos listos.
  - Pausa: la para cualquiera; la sigue solo quien la paró, o el otro si este se ha ido.
  - Acciones: las del defensor desde la pestaña del atacante se rechazan, y al revés.
  - Defensor humano: la defensa del ordenador no actúa; el dinero inicial y por ronda según Poco/Normal/Mucho; recompensa de una cuarta parte.
  - Tramo seguro: colocar una torre o mejorar un alcance que llegaría a él se rechaza, en las partidas de ataque contra el ordenador y uno contra otro. La defensa del ordenador sigue jugando igual (las partidas del bot dan los mismos resultados).
  - Revancha: mismo mapa y dinero, bandos cambiados, en preparación.
  - Guardado: ida y vuelta de una partida uno contra otro; al cargar, el que estaba jugando conserva su bando.
  - Servidor: arrancado en un puerto de prueba, dos «pestañas» se unen, se ponen listas, juegan unas acciones y guardan y cargan.
- **Navegador:** dos pestañas contra el mismo servidor de prueba (cada pestaña es un jugador): crear, unirse, preparar, rondas, pausa, una recarga a mitad de ronda, fin de partida y revancha. Con capturas de las dos pantallas.

## 14. Fuera de alcance

- Salas en línea con código (parte 4).
- Más de dos jugadores en una partida uno contra otro (por ejemplo, dos contra dos) y espectadores.
- Chat entre jugadores.
- Habilidades de apoyo del atacante (entrega posterior).
- Ajustar el equilibrio para dos personas: se juega con el equilibrio del modo atacante, y la ventaja se da con el dinero de la defensa.
- Ranking de puntuaciones de estas partidas.
