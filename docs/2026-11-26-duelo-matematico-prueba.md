# Duelo Matemático: una prueba

**Fecha:** 2026-11-26 (noche) · **Estado:** prueba jugable, contra la máquina y entre dos aparatos en casa. Sin publicar.

## 1. Lo que pidió el usuario

> «Quiero que hagas un nuevo juego igual que el musical, aprovecha exactamente todo igual, pero en lugar de acertar con las teclas lo que quiero es que salgan tablas de multiplicar del 1 al 10, por ejemplo 1x6, 2x7, 8x4... y también añade sumas y restas sencillas de sólo 2 cifras. Abajo, en lugar de poner las teclas pondrás resultados posibles y los jugadores tendrán que elegir cuál es el correcto. […] la racha, los golpes, los mensajes y la mecánica del resto del juego sería igual que el duelo musical. Le vas a llamar Duelo Matemático.»

Es para jugar con su hijo de 8 años. Y, ya empezado el trabajo:

> «En el carril tendría que caer operaciones pero a un ritmo mucho más despacio, para que le dé tiempo a poder calcular el resultado. Empezaríamos despacio y se iría complicando a medida que avanza la racha.»

Y al día siguiente, visto el resumen:

> «Un asalto pon que puede durar hasta 3 minutos. Si vas en racha yo creo que sí que debería disparar y si fallas recibes disparos. Pero configura el daño para que más o menos pueda durar de 2-3 minutos... si falla mucho pues durará poco pero que cada disparo no mate de una al ejército.»

## 2. Cómo quedó

Es el duelo musical tal cual —comprar ejército, asaltos al mejor de cinco, la canción de fondo, las barras de vida, los cañonazos, ¡BIEN!/¡MUY BIEN!/GREAT!, ¡FALLO! con la pantalla en rojo, descargas ×1,5 y ×2 con rachas de 10 y 25— con dos diferencias: **lo que hay que acertar**, y que **con racha tu ejército dispara**.

- Por el carril baja **una operación**, despacio, con una barra que se va vaciando (verde, amarilla, roja).
- Abajo, donde estaban las teclas, hay **cuatro resultados**. Se elige tocándolo (móvil o ratón) o con las teclas 1, 2, 3 y 4.
- **Acierto**: la tarjeta se pone verde con la cuenta completa («7 × 8 = 56»), sube la racha y enseguida baja la siguiente.
- **Fallo** (resultado equivocado, o la operación llega abajo sin respuesta): ¡FALLO!, dispara el rival, y la tarjeta enseña en rojo **el resultado correcto**, para que se aprenda.
- **En racha, disparas tú**: desde el tercer acierto seguido, cada acierto hace disparar a tu ejército (como mucho una vez cada 8 s, lo que tarda en recargar). Sobre el carril se lee cuánto falta («Un acierto más y dispara tu ejército») y, ya en racha, si está listo o recargando.
- Cada jugador tiene **sus propias operaciones a su propio ritmo**: quien contesta rápido recibe la siguiente antes; quien necesita pensar tiene todo su tiempo. Con la misma racha, a los dos les salen las mismas.
- **Se complica con la racha** y vuelve a lo fácil tras un fallo:

| Nivel | Racha | Tiempo | Tablas | Sumas y restas |
|---|---|---|---|---|
| 1 | 0–1 | 14 s | del 1, 2, 5 y 10 | dos cifras y una, sin llevar (23 + 4, 27 − 4) |
| 2 | 2–4 | 13 s | del 2, 3, 4, 5 y 10 | dos cifras y dos, sin llevar (23 + 14, 47 − 12) |
| 3 | 5–8 | 12 s | del 2 al 6, en los dos órdenes | dos cifras y una, llevando (27 + 6, 32 − 5) |
| 4 | 9–13 | 11 s | del 3 al 9 | dos cifras y dos, llevando (27 + 45, 52 − 27) |
| 5 | 14–19 | 10 s | del 6 al 9 (las difíciles) | como el 4, con números más grandes |
| 6 | 20–27 | 8 s | como el 5 | como el 5 |
| 7 | 28 o más | 6 s | como el 5 | como el 5 |

La mitad de las operaciones son tablas; el resto, sumas y restas a partes iguales. Los resultados equivocados son los errores típicos (uno más, uno menos, diez más, la casilla de al lado de la tabla).

Un asalto dura **tres minutos** como mucho (o hasta que un ejército cae). Si nadie cae, lo gana quien conserve más ejército. La canción suele ser más corta: vuelve a empezar por debajo.

**Cuánto dura y cuánto quita** (ajustado con asaltos simulados, `node tools/duel/quiz_rounds.mjs game`, 120 por pareja, los dos con dos tanques):

| Quién contra quién | Dura (mediana) | Acaba con un ejército destruido |
|---|---|---|
| Dos niños parecidos (6–11 s por operación, 80 % de aciertos) | 2 min 34 s | 2 de cada 3 |
| Un niño así contra otro que duda más (8–14 s, 65 %) | 2 min 41 s | 2 de cada 3 |
| Dos niños que dudan | 3 min (al tiempo) | 1 de cada 3 |
| Un adulto (2–4 s, 97 %) contra un niño | 1 min 33 s | siempre |
| Dos adultos | 1 min 58 s | siempre |
| Un niño contra alguien que no contesta nada | 1 min 44 s | siempre |

Un fallo quita a un ejército en torno a un octavo si el rival tiene uno parecido, y **un tercio en el peor caso** (lanzacohetes contra tanques, que es su contrario): ninguno lo mata de una. Un disparo de racha quita algo menos que un fallo.

Se entra por **Nueva partida → 🧮 Duelo matemático (prueba)**. En la página del servidor de casa pregunta contra quién: la máquina, u otro jugador en su aparato (igual que el musical: el otro abre la dirección y pulsa «Unirse al duelo»).

## 3. Decisiones mías

| Decisión | Por qué | Si está mal |
|---|---|---|
| Cada jugador tiene sus operaciones y su ritmo, en vez de la misma operación a la vez para los dos | La dificultad va con la racha de cada uno, así que no pueden ser las mismas; y así un padre que encadena aciertos acaba con las difíciles y con menos tiempo mientras el niño sigue en su nivel: se iguala solo | Es la base de `quizKeys`/`answerKey` en `duelRhythm.js` |
| «En racha» es desde el **tercer** acierto seguido, y entonces dispara con cada acierto | El usuario dijo «si vas en racha debería disparar»; tres seguidos ya es racha para un niño y se alcanza a menudo | `QUIZ_STREAK_FROM` en `duelRhythm.js` |
| El ejército en racha dispara como mucho cada **8 s** | Sin eso un adulto, que contesta en 3 s, dispararía tres veces más que un niño y lo barrería en medio minuto; así su ventaja es no fallar, no la velocidad | `QUIZ_STREAK_RELOAD` |
| Pulsar cuando no hay operación (entre dos, o antes de la primera) no cuenta como nada | En el musical es fallo; aquí castigaría un toque de más de un niño | `answerKey`, la línea de «nothing» |
| Un fallo pega ×1,6 de un disparo del musical, y un disparo de racha ×1 | Los números que dan asaltos de 2–3 minutos en la simulación de arriba; con ×0,8 y ×0,3 nadie caía nunca, ni sin contestar | `QUIZ_VOLLEY` y `QUIZ_STREAK_VOLLEY` en `duelRhythm.js` |
| Tiempos de 14 s a 6 s y los escalones de racha de la tabla | «Mucho más despacio»; son primeros números, sin haberlo visto jugar a un niño | `TIME` y `LEVEL_AT` en `duelQuiz.js` |
| Qué entra en cada nivel (qué tablas, llevando o no) | El orden en que se suelen aprender | `TABLES`, `plus`, `minus` en `duelQuiz.js` |
| Cuatro respuestas, ordenadas de menor a mayor | Cuatro es lo habitual; ordenadas se encuentran antes | `QUIZ_LANES` y `make` en `duelQuiz.js` |
| Asalto de hasta 3 minutos | Lo pidió el usuario | `QUIZ_ROUND_TIME` en `duelQuiz.js` |
| La máquina acierta 72 de cada 100 y tarda entre el 30 % y el 70 % del tiempo | El mismo número que en el musical de la primera liga | `BOT_ACCURACY`, `ask` |
| Sin las teclas más rápidas con la racha del musical | Aquí la racha ya acorta el tiempo por niveles | — |
| Como el musical: solo la primera liga, no cuenta para el perfil | Es una prueba | — |

## 4. Comprobado y sin comprobar

Comprobado en el navegador: el menú, la compra, la operación bajando con su barra, acierto con tecla (tarjeta verde, ¡BIEN!), fallo tocando una respuesta (¡FALLO!, disparo, resultado correcto en rojo), dejar pasar una operación, nueve aciertos seguidos subiendo de nivel, fin de asalto por tiempo, y dos jugadores con el segundo a tamaño de móvil tocando la respuesta (el servidor la cuenta). Con las reglas del segundo día: reloj de 3:00, el tercer acierto seguido dispara (el rival bajó al 83 %), el cuarto no (recargando) y el rótulo lo dice.

Sin comprobar: un móvil de verdad; que la canción se oiga bien al volver a empezar; y sobre todo **si los tiempos, los niveles y el daño son los buenos para un niño de 8 años** — los «niños» de la simulación son suposiciones mías, y eso solo se ve jugando con él.
