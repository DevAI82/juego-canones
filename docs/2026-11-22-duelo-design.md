# Duelo: minijuego de uno contra uno — Diseño

Fecha: 2026-11-22
Estado: aprobado por el usuario (2026-11-22). Hecho: el núcleo (plan A), la pantalla con la primera arena (plan B) y el equilibrio (plan C). Pendiente: las otras cuatro arenas (plan C) y la red de casa (plan D).

## 1. Contexto

El usuario ha pedido (2026-11-22) un minijuego nuevo dentro de Tower Defense: «un duelo de uno contra uno», contra la máquina o contra otro jugador, en el que cada uno empieza con 100 $, elige un vehículo o un ejército, gana dinero al dañar y destruir al rival, lo gasta en más unidades o en habilidades, sube de nivel al derrotar unidades y recorre cinco niveles: Arena, Hierro, Bronce, Plata y Oro.

Lo que el usuario ha decidido al preguntárselo:

| Pregunta | Decisión |
|---|---|
| Cómo se manejan los vehículos | **Combate automático**: el jugador compra, mejora y coloca; las unidades luchan solas |
| Qué son los cinco niveles | **Ligas del jugador, cada una con su arena** |
| Cómo se desarrolla un duelo | **Por asaltos**: compra y combate; gana quien gana antes 3 asaltos |
| Contra quién, en la primera versión | **La máquina y otro jugador en la red de casa**; en línea, en una segunda fase |
| Cómo cuentan las ventajas del nivel | **En el perfil; entre jugadores se juega en igualdad** |
| Colocación antes del asalto | **La hace el jugador** en su mitad de la arena |
| Vista | **Como Defender y Atacar**: modelos 3D y arenas de Blender con la cámara inclinada fija |

No forma parte de las cuatro partes del plan acordado en octubre. La parte 4 (salas en línea) sigue pendiente y este minijuego la deja más fácil: ver §13.

## 2. Objetivo

Un duelo corto (unos cinco minutos) entre dos ejércitos pequeños en una arena que cabe en la pantalla. El juego de cada uno es decidir qué comprar, qué mejorar y dónde colocar; el combate se mira. Fuera del duelo, cada jugador tiene un perfil con su nivel y su liga.

## 3. La arena

- **Tamaño:** 1200 × 750, como los niveles 1 y 2: se ve entera, sin mover la cámara. Se dibuja con el doble de detalle, como esos niveles.
- **Bandos:** izquierda (azul) y derecha (rojo). Contra la máquina el jugador es siempre el de la izquierda. En la red de casa, quien crea el duelo es el de la izquierda.
- **Zona de despliegue:** cada bando coloca en su franja, de 440 de ancho (izquierda: x de 40 a 480; derecha: de 720 a 1160; y de 60 a 690). El centro queda libre.
- **Obstáculos:** entre 3 y 7 por arena, redondos, colocados en espejo respecto al centro para que ningún bando tenga ventaja. Cortan el paso y los disparos: sirven de cobertura.
- **Cinco arenas**, una por liga, con los mismos números de juego y distinto dibujo y obstáculos:

| Liga | Arena |
|---|---|
| 1. Arena | Foso de arena con empalizadas y sacos terreros |
| 2. Hierro | Chatarrería: contenedores, vigas y vehículos oxidados |
| 3. Bronce | Patio de una fundición, con crisoles y adoquines |
| 4. Plata | Explanada nevada de una base de montaña |
| 5. Oro | Patio de un palacio, con columnas y estatuas |

Se construyen con los guiones de Blender de los mapas (`paintkit.py`, `scenekit.py`, `build_map.py`): fondo y primer plano, de modo que las unidades pasan por detrás de lo que sobresale.

## 4. Un duelo

Un duelo son asaltos. Cada asalto tiene dos fases.

**Compra**

- El jugador compra vehículos, mejora habilidades, vende y arrastra cada vehículo a su sitio dentro de su zona. Un vehículo recién comprado aparece en el primer hueco libre.
- Lo que hace el rival en esta fase no se ve: su ejército aparece al empezar el combate.
- Termina cuando los dos pulsan «¡Listo!». Entre dos jugadores hay además un límite: 45 s el primer asalto y 30 s los siguientes. Contra la máquina no hay límite.

**Combate**

- Automático. Cada unidad va a por el enemigo más cercano, se detiene a su alcance y dispara; rodea los obstáculos y a sus compañeras.
- Dura como máximo 60 s. Gana el asalto quien destruye todo el ejército rival. Si se acaba el tiempo, gana quien conserve más ejército (la vida que le queda a cada unidad, contada según su precio); si empatan, quien más daño haya hecho en el asalto.
- Al acabar se reparte el dinero del asalto (§6) y empieza el siguiente.

**Final:** gana el duelo quien gana antes 3 asaltos (como mucho hay 5).

## 5. El ejército

- **Las cinco unidades** que ya existen, con su aspecto y sus precios del modo Atacar: soldado 10 $, moto 15 $, buggy 20 $, tanque 50 $, lanzacohetes 70 $.
- **Números propios.** La vida, el daño, el alcance, la cadencia y la velocidad de cada unidad en el duelo son distintos de los de Defender y Atacar: aquellos están pensados contra torres y, unidad contra unidad, diez soldados arrollan a dos tanques. Cada unidad tiene un papel:

| Unidad | Papel en el duelo |
|---|---|
| Soldado | Barato y numeroso; cae rápido ante el daño en área |
| Moto | Muy rápida: llega pronto a la retaguardia rival; poca vida |
| Buggy | Equilibrado: buena cadencia y velocidad |
| Tanque | Blindado: las armas ligeras (soldado, moto, buggy) le hacen menos daño |
| Lanzacohetes | Largo alcance, daño en área y más daño a los blindados; lento, y no puede disparar a lo que tiene encima |

Ninguna unidad gana a todas las demás (ajustado con combates simulados, 2026-11-24): el tanque arrolla a las ligeras, el lanzacohetes rompe a los tanques, y motos y buggies se meten bajo los cañones del lanzacohetes. Diez soldados son el mejor ejército del primer asalto contra todo menos tanques.

- **El ejército dura todo el duelo.** En cada asalto vuelve entero y reparado al sitio donde el jugador lo dejó, y se va ampliando. Quien pierde un asalto no pierde sus unidades.
- **Máximo 12 vehículos** por bando.
- **Vender:** un vehículo comprado en esta misma fase devuelve todo su precio; uno de asaltos anteriores, la mitad.
- **Colores:** cada bando lleva su color (azul el de la izquierda, rojo el de la derecha) y un aro del mismo color en el suelo. El color se pone al dibujar: sustituye al de la pintura del vehículo y conserva las luces y sombras del modelo. (Cambiado al construirlo, 2026-11-24: las piezas de bando de los modelos son demasiado pequeñas para verse a este tamaño, y así no hacen falta dibujos nuevos ni más descarga.)

## 6. El dinero

- **Al empezar:** 100 $ cada uno (más la ventaja del perfil contra la máquina, §8).
- **Durante el combate:** se cobra por el daño hecho, en proporción. Destruir del todo una unidad da la mitad de su precio.
- **Al acabar cada asalto:** 50 $ a cada uno y 25 $ más al ganador.
- **Habilidades:** cinco por tipo de vehículo, con cinco niveles cada una, las mismas del modo Atacar y con el mismo efecto por nivel: daño (×1,25), alcance (×1,15), blindaje (vida ×1,18), cadencia (×0,85 entre disparos) y velocidad (×1,06). Una mejora vale para todos los vehículos de ese tipo, también los que se compren después. El nivel k cuesta su precio base × k: daño, blindaje y cadencia 20 $; alcance y velocidad 15 $.

Todos los números de §5 y §6 son de partida. Se ajustan con duelos simulados (§12) y los valores ajustados llevarán un comentario que lo diga, como en el modo Atacar.

## 7. La máquina

- Juega con las mismas acciones que una persona: comprar, mejorar, vender, colocar y «¡Listo!». No ve la compra ni la colocación del jugador en el asalto en curso; sí el ejército que el jugador tenía en el anterior.
- Tiene cinco grados, uno por liga. Al subir de liga empieza con más dinero y más niveles de habilidad gratis, compra respondiendo mejor a lo que lleva el jugador y coloca mejor (blindados delante, lanzacohetes detrás y a cubierto).
- Sus ventajas por liga se ajustan con duelos simulados para que un jugador con el nivel propio de esa liga gane más o menos la mitad de las veces.

## 8. El perfil: nivel y liga

Se guarda en cada aparato (en el navegador, como los ajustes). No hay cuentas ni nombres.

**Nivel**

- Cada unidad enemiga destruida da experiencia igual a su precio, multiplicada por la liga de la arena (×1 en Arena, ×1,25 en Hierro, hasta ×2 en Oro).
- Para pasar del nivel n al n + 1 hacen falta 300 × n de experiencia. El nivel máximo es 15. (Eran 100 × n: en carreras simuladas se llegaba al nivel máximo en unos 17 duelos, antes de la última liga. Con 300 se es campeón hacia el nivel 11, tras unos 25–35 duelos.)
- Cada nivel ganado da **un punto de habilidad** y **10 $ más de dinero inicial**.
- Un punto de habilidad se asigna a una habilidad de un tipo de vehículo: en los duelos contra la máquina, ese tipo empieza con un nivel gratis de esa habilidad (varios puntos en la misma suman niveles, hasta el máximo de cinco; los niveles gratis cuentan dentro de ese máximo). Los puntos se pueden recolocar entre duelos sin coste.

**Liga**

- Todos empiezan en la liga Arena. Se asciende al ganar 3 duelos contra la máquina en la liga más alta que se tiene; no hace falta que sean seguidos y no se desciende.
- Al ganar 3 duelos en Oro el perfil queda como «Campeón».
- Se puede jugar en cualquier liga ya alcanzada; solo los duelos en la más alta cuentan para ascender.

**Entre dos jugadores:** los dos empiezan con 100 $ y sin puntos de habilidad. Estos duelos dan experiencia a cada uno en su aparato, pero no cuentan para la liga.

## 9. El menú

- **Jugando solo** (también en la web publicada): «Nueva partida» añade una cuarta opción, **Duelo**, junto a Defender, Atacar y RTS. Lleva a la pantalla del perfil: nivel, experiencia, liga, puntos de habilidad por asignar y las cinco arenas, con las no alcanzadas cerradas. Elegir una arena empieza un duelo contra la máquina.
- **En la red de casa:** «Nueva partida» añade **Duelo** junto a «Defender juntos» y «Uno contra otro». Quien lo crea elige la arena (las cinco están abiertas) y ve la pantalla de espera con la dirección que debe abrir el otro, como en «Uno contra otro».
- «Cargar partida» no cambia: un duelo no se guarda a medias (§14).

## 10. La pantalla del duelo

- **Arriba:** el marcador de asaltos de cada bando, el dinero, el tiempo que queda y los botones de siempre (pantalla completa, sonido, pausa, menú).
- **Compra:** una barra con las cinco unidades y su precio; tocar una la compra. Tocar un vehículo ya colocado abre el panel de su tipo: las cinco habilidades con su nivel y su precio, y «Vender». Se arrastra con el ratón o con el dedo; la zona propia se ve marcada. «¡Listo!» está en la propia tienda, lo primero, para que tenga buen tamaño también en el móvil.
- **Combate:** se mira. Cada unidad lleva su barra de vida; el dinero sube al hacer daño. Al acabar, un cartel dice quién gana el asalto y cuánto cobra cada uno.
- **Final del duelo:** resultado, experiencia ganada, nivel nuevo si lo hay (con el punto de habilidad para asignar), progreso hacia la liga siguiente, y «Revancha» o «Salir».
- Funciona igual en el ordenador y en el móvil.

## 11. En la red de casa

- El servidor de casa (`node server.js`) lleva el duelo, como lleva hoy «Defender juntos» y «Uno contra otro»: la simulación corre en él y cada navegador manda las acciones de su bando.
- A cada navegador le llega, durante la compra, solo su propio ejército; el del rival viaja al empezar el combate.
- Pausa, desconexión y vuelta de quien recarga la página funcionan como en «Uno contra otro».
- Al terminar, cada navegador suma a su perfil la experiencia de las unidades que destruyó su bando.

## 12. Estructura del código y pruebas

Un módulo nuevo e independiente. No toca la simulación de Defender, Atacar ni el RTS.

- `js/duel.js` (nuevo, lógica pura): el estado del duelo, las acciones (comprar, vender, mover, mejorar, «¡Listo!») y el paso de la simulación con sus fases. Es determinista: paso fijo de tiempo y números al azar a partir de una semilla, de modo que las mismas compras dan siempre el mismo combate.
- `js/duelArenas.js` (nuevo): los datos de las cinco arenas (imágenes, obstáculos, zonas).
- `js/duelAI.js` (nuevo): la máquina, con sus cinco grados.
- `js/duelProfile.js` (nuevo): experiencia, nivel, puntos de habilidad, liga; leer y guardar en el navegador.
- `js/duelDraw.js` y `js/duelUI.js` (nuevos): el dibujo en el lienzo, con los dibujos de `unitSprites.js`, y las pantallas de §9 y §10.
- `js/modes.js`, `js/main.js`, `js/menu.js`, `index.html`: lo justo para que exista el modo «duelo» y sus entradas de menú.
- `js/host.js` y `js/versus.js`: el tipo de partida «duelo» en el servidor de casa, con sus dos bandos y lo que ve cada uno.
- `tools/blender/`: las cinco arenas (`maps/duel<N>_layout.py`) y las hojas de dibujos rojas de las cinco unidades.

**Pruebas** (con `node --test`, escribiendo antes la prueba que falla):

- `duel.js`: dinero inicial; comprar, vender y sus límites (dinero, 12 vehículos, zona propia, obstáculos); mejoras; reparto por daño y por asalto; fin del asalto por aniquilación, por tiempo y por desempate; fin del duelo a 3 asaltos; el ejército vuelve entero; la misma semilla y las mismas acciones dan el mismo resultado.
- `duelProfile.js`: experiencia, subidas de nivel, tope de nivel, asignar y recolocar puntos, ascenso de liga, perfil guardado estropeado o ausente.
- `duelAI.js`: nunca gasta más de lo que tiene, coloca dentro de su zona, no usa lo que no puede ver.
- `host.js`: bandos, acciones rechazadas del bando contrario, el ejército rival oculto durante la compra, inicio en igualdad.
- **Equilibrio**, con duelos simulados entre máquinas: ningún ejército de un solo tipo de unidad gana a todos los demás con el mismo dinero; cada grado de la máquina gana claramente al anterior.
- En el navegador: un duelo completo contra la máquina en cada arena, y un duelo entre dos pestañas contra un servidor de prueba.

El trabajo se reparte en cuatro planes, en este orden: (A) núcleo sin pantalla: `duel.js`, perfil y máquina; (B) pantalla, menú y la primera arena; (C) equilibrio con duelos simulados y las otras cuatro arenas; (D) red de casa.

## 13. Segunda fase: duelos en línea

Queda fuera de esta versión, pero el diseño la prepara: como el combate es automático y determinista, por la red solo hace falta mandar las compras y la colocación de cada asalto, no el combate. Eso sirve con cualquiera de los alojamientos que se barajaban para la parte 4 del plan (un servidor de salas en el VPS del usuario, Supabase o conexión directa). La decisión del alojamiento se toma entonces.

## 14. Fuera de alcance

- Duelos por internet con código de sala (§13).
- Cámara 3D libre, como la del RTS.
- Guardar un duelo a medias. El perfil se guarda al terminar cada duelo; si se cierra a mitad, ese duelo se pierde.
- Acelerar el combate, repeticiones y tabla de récords del duelo.
- Unidades nuevas, edificios o torres en la arena.
- Más de dos jugadores, y dos jugadores en el mismo aparato.
- Bajar de liga.
