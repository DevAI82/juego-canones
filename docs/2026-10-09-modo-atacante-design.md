# Modo atacante — Diseño

Fecha: 2026-10-09
Estado: aprobado en conversación, pendiente de revisión por escrito

## 1. Contexto

Segunda de las cuatro partes acordadas:

1. Menú principal y guardar/cargar partida (hecha).
2. **Modo atacante para un jugador, contra una defensa controlada por el ordenador** (este documento).
3. Dos jugadores en el mismo PC.
4. Salas en línea con código para invitar a amigos.

Las habilidades de apoyo (humo, inhibidor, reparación, bombardeo) quedan para una entrega posterior. Esta parte deja preparado el «humano contra humano» de las partes 3 y 4, pero no lo implementa.

## 2. Objetivo

Jugar como atacante: formar un ejército, controlarlo al estilo Command & Conquer, mejorar las unidades y romper la base que defiende el ordenador antes de que termine la ronda 15.

## 3. Cómo se juega

### 3.1 Empezar

Menú principal → **Nueva partida** → **Atacar** (deja de estar en gris) → elegir mapa (los 4 actuales) → elegir dificultad de la defensa: **Fácil**, **Normal** o **Difícil**.

### 3.2 Preparación

- Sin reloj. La defensa del ordenador coloca sus primeras torres.
- El atacante recibe el dinero de la ronda 1 al empezar la preparación, compra unidades (aparecen en la entrada activa), las coloca y compra mejoras.
- El botón **«¡Al ataque!»** empieza la ronda 1.

### 3.3 Rondas

- **15 rondas de 60 segundos.** La batalla es continua: no se detiene entre rondas y el ejército sigue en el mapa.
- **Al empezar cada ronda:** el atacante cobra su dinero de la ronda (el de la ronda 1 ya lo cobró al empezar la preparación) y la defensa recibe su presupuesto, con el que construye, mejora y repara.
- El jugador puede pausar en cualquier momento (⏸ o el menú de pausa).

### 3.4 Dinero del atacante

| Concepto | Cantidad (valores iniciales) |
|---|---|
| Al empezar la ronda *n* | $150 + $25 × (*n* − 1) |
| Daño hecho a torres y muros | 25 % del daño, en dólares (destruir una torre básica ≈ $20) |
| Cada unidad que entra en la base | $20 |

### 3.5 Unidades

Las cinco actuales, con sus características de hoy como base:

| Unidad | Precio | Vida | Velocidad | Daño por disparo | Alcance | Vidas que quita a la base |
|---|---|---|---|---|---|---|
| Soldado | $15 | 40 | 50 | 2 | 90 | 1 |
| Moto | $25 | 18 | 78 | 2 | 95 | 1 |
| Buggy | $35 | 30 | 62 | 2 | 110 | 1 |
| Tanque | $90 | 120 | 32 | 5 | 130 | 2 |
| Lanzacohetes | $120 | 75 | 34 | 10 | 220 | 2 |

- **Tope: 60 unidades en el mapa a la vez**, contando las compradas que aún esperan para aparecer.
- Al comprar, aparecen una tras otra (medio segundo entre cada una) en la entrada activa y se quedan quietas esperando órdenes.
- En modo ataque no hay subidas automáticas por oleada (las del tanque y el lanzacohetes en modo defensa): todo lo que mejora una unidad es lo que compra el jugador.
- Los precios son valores iniciales; se ajustan con partidas automáticas (sección 9).

### 3.6 Mejoras por tipo de unidad

Cinco mejoras de 5 niveles para cada tipo de unidad. Cada nivel comprado afecta a **todas** las unidades de ese tipo, las que ya están en el mapa y las que se compren después.

| Mejora | Efecto por nivel (inicial) | Coste del nivel *k* (inicial) |
|---|---|---|
| Daño | daño por disparo × 1,25 | $60 × *k* |
| Alcance | alcance × 1,15 | $40 × *k* |
| Blindaje | vida máxima × 1/0,85 (×2,25 al nivel 5, como las torres) | $60 × *k* |
| Cadencia | tiempo entre disparos × 0,85 | $60 × *k* |
| Velocidad | velocidad × 1,06 | $40 × *k* |

Las unidades no tienen cargador como las torres: por eso la mejora de munición se convierte en cadencia. Al subir el blindaje, las unidades desplegadas ganan la vida extra igual que las torres.

### 3.7 Ganar y perder

- La base tiene **20 vidas**. Cada unidad que entra le quita las suyas (tabla 3.5) y desaparece.
- **Gana el atacante** si deja la base a 0 vidas antes de que termine la ronda 15.
- **Gana la base** si termina la ronda 15 con vidas.
- La pantalla final dice quién ha ganado y resume la partida: ronda alcanzada, vidas quitadas, torres destruidas, unidades perdidas y dinero gastado. En esta parte el modo ataque no entra en el ranking de puntuaciones.

### 3.8 La defensa del ordenador

- **Dinero:** una cantidad inicial, un presupuesto al empezar cada ronda y la recompensa de cada unidad del atacante que destruye (la misma que gana el defensor humano hoy).
- **Qué hace:**
  - En la preparación coloca sus primeras torres, empezando por los puntos que cubren a la vez más caminos hacia la base.
  - Al empezar cada ronda y de vez en cuando durante ella, gasta su dinero: nuevas torres donde más cubren los caminos (con preferencia por los que está usando el ejército atacante), mejoras y reparaciones.
  - En **Difícil**, además, levanta muros en las calles por las que avanza el atacante.
- **Usa las mismas acciones que un jugador defensor** (colocar torre, mejorar, reparar, muro): no hace nada que un humano no pudiera hacer.
- **La dificultad** cambia su dinero (inicial y por ronda) y lo bien que elige. Valores iniciales:

| Dificultad | Dinero inicial | Por ronda | Muros |
|---|---|---|---|
| Fácil | $250 | $60 | No |
| Normal | $350 | $90 | No |
| Difícil | $450 | $120 | Sí |

### 3.9 Mapas, calles y entradas

- **Por dónde se mueven las unidades:** solo por carreteras y calles. La red de cada mapa es la de sus carreteras actuales, con sus cruces.
- **Mapas 3 y 4:** se les añaden calles que se ven en la imagen pero que hoy no usan los enemigos, trazadas sobre el asfalto como las del nivel 4. Los mapas 1 y 2 usan las carreteras que ya tienen.
- **Entradas:** el comienzo de cada carretera en el borde del mapa. Las unidades aparecen en el primer punto de esa carretera que queda dentro del mapa.
- **La base:** el punto al que llegan hoy los enemigos en cada mapa (en el nivel 3, el patio de la fortaleza, entrando por sus puertas; en el nivel 4, la puerta del cuartel).

## 4. Controles (al estilo Command & Conquer)

### 4.1 Seleccionar

- **Clic izquierdo** en una unidad propia: la selecciona (y suelta las demás).
- **Arrastrar con el botón izquierdo:** recuadro; selecciona todas las unidades propias de dentro.
- **Mayús + clic** o **Mayús + recuadro:** añade o quita de la selección.
- **Doble clic** en una unidad: selecciona todas las de su tipo que se ven en pantalla.
- Clic izquierdo en el suelo (sin arrastrar): suelta la selección.

### 4.2 Grupos

- **Ctrl + 1…9:** guarda la selección como grupo con ese número (una unidad solo pertenece a un grupo; si ya estaba en otro, pasa al nuevo). Algunos navegadores reservan Ctrl + número para cambiar de pestaña; por eso **Alt + 1…9** hace lo mismo.
- **1…9:** selecciona ese grupo (las unidades destruidas desaparecen de él).
- **Pulsar el número dos veces seguidas** (en medio segundo): la cámara se centra en el grupo.

### 4.3 Órdenes (clic derecho)

- **En el suelo:** las seleccionadas van al punto de calle más cercano al clic, por el camino más corto de la red de calles, y allí se paran. Se reparten a lo largo de la calle, una detrás de otra y alternando lados, en vez de amontonarse. Aparece una marca verde.
- **Sobre una torre o un muro:** cada unidad avanza por la calle hasta tenerlo a tiro, se para y lo ataca hasta destruirlo; después se queda quieta. Aparece una marca roja.
- **Sobre la base** (o muy cerca): van a ella y entran.
- **Tecla S:** paran donde estén.
- Una orden nueva sustituye a la anterior.
- **Nada se mueve sin orden.** Sin órdenes, o mientras se mueven, disparan solas a las torres que tengan a tiro, sin cambiar de camino. Un muro que corta la calle las detiene y le disparan hasta destruirlo, como ahora.

### 4.4 Otras teclas y cámara

- **Esc:** si hay unidades seleccionadas, primero las suelta; si no, abre el menú de pausa.
- **Cámara:** flechas del teclado, ratón en el borde de la pantalla, arrastrar con el botón central, minimapa y rueda para el zoom. WASD no mueve la cámara en este modo, porque la S es «parar».

### 4.5 Pantalla táctil (básico)

Tocar una unidad la selecciona; tocar el suelo, una torre o la base da la orden a la selección. El recuadro y los grupos son solo con ratón y teclado.

## 5. Interfaz

- **Tienda de unidades** (donde está el menú de construir en modo defensa): cinco tarjetas con precio y nivel de mejora. **Clic** compra 1 unidad; **Mayús + clic** compra 5 (o las que permita el dinero y el tope). En gris si no hay dinero o se ha llegado al tope.
- **Entradas:** una bandera en cada entrada del mapa y en el minimapa. Clic en una bandera la hace la **entrada activa** (resaltada); ahí aparecen las compras.
- **Panel de mejoras:** al seleccionar unidades aparece el panel de mejoras de su tipo (daño, alcance, blindaje, cadencia, velocidad), con el mismo aspecto que el de las torres; si la selección mezcla tipos, una pestaña por tipo.
- **Unidades seleccionadas:** anillo verde, barra de vida siempre visible y número de grupo, si tienen.
- **Torres de la defensa:** al pasar el ratón por encima se dibuja su alcance.
- **Marcador:** ronda (*n*/15), tiempo que queda de la ronda, dinero, vidas de la base y unidades en el mapa (*n*/60).
- **«¡Al ataque!»:** durante la preparación ocupa el sitio del botón «Iniciar oleada».
- **Menú:** «Atacar» se activa en «¿Cómo quieres jugar?»; tras el mapa, una pantalla **«Dificultad»** con Fácil, Normal y Difícil.

## 6. Guardado

- **Autoguardado al empezar cada ronda** (y al empezar la preparación). Guarda: modo y dificultad, mapa, ronda, dinero y mejoras del atacante, cada unidad (tipo, posición y vida), las torres y muros de la defensa con su dinero y vidas, y las estadísticas.
- Las órdenes en curso no se guardan: al cargar, el ejército está quieto donde se guardó y la partida en pausa, al principio de esa ronda.
- **Guardado manual** en los 3 huecos, desde el menú de pausa: en la preparación o al empezar una ronda se hace al momento; durante una ronda queda pedido y se hace al empezar la siguiente (aviso «Se guardará al empezar la ronda siguiente»).
- La lista de partidas guardadas indica si cada una es de defensa o de ataque.

## 7. Partida en red de casa

En esta parte el modo ataque solo funciona en partida individual. Si el juego se ha abierto desde el servidor de casa, «Atacar» aparece en gris con el aviso «Solo en partida individual, por ahora».

## 8. Estructura del código

- `js/ids.js` (nuevo): el contador de identificadores, que hoy vive dentro de `simulate.js`, para que lo compartan la simulación y las reglas del ataque.
- `js/roadGraph.js` (nuevo): red de calles de un mapa (carreteras + calles extra, con sus cruces); punto de calle más cercano a un clic; camino más corto entre dos puntos; puntos de parada repartidos para un grupo.
- `js/attack.js` (nuevo): reglas del modo ataque: dinero del atacante, catálogo y precios, tope, mejoras por tipo, compras y despliegue, órdenes (mover, atacar torre, entrar, parar), rondas, premios, victoria y derrota.
- `js/defenseAI.js` (nuevo): la defensa del ordenador, que solo usa las acciones públicas de `simulate.js`.
- `js/selection.js` (nuevo): lógica pura de selección (unidad bajo el cursor, recuadro, Mayús, doble clic por tipo) y grupos.
- `js/attackControls.js` y `js/attackUI.js` (nuevos): ratón, teclado y cámara del modo ataque; tienda, panel de mejoras, banderas, marcador. `main.js` solo los conecta según el modo.
- `js/simulate.js`: un campo de modo en el estado; en modo ataque, nada de oleadas prefijadas, unidades con órdenes, llegar al final de una orden = pararse (salvo la orden de entrar), premios por daño, fin de partida con ganador. El modo defensa no cambia.
- `js/levels.js`: calles extra de los mapas 3 y 4.
- Guardado (`simulate.js`): el formato gana un campo de modo; los guardados de defensa existentes siguen cargando igual.

## 9. Pruebas

- **Tests automáticos:**
  - Red de calles: cruces detectados, camino más corto por calles, punto más cercano, puntos de parada repartidos.
  - Compras: cobran el precio, respetan el tope de 60 y el dinero; las unidades aparecen en la entrada y se quedan quietas.
  - Órdenes: una unidad mandada a un punto llega y se para sin quitar vidas; mandada a la base, entra y quita sus vidas y da $20; mandada contra una torre, se para a tiro y la ataca; «parar» la detiene.
  - Dinero: 25 % del daño a torres y muros; cobro creciente al empezar cada ronda.
  - Mejoras: cambian las unidades nuevas y las desplegadas.
  - Fin: la base a 0 vidas da la victoria al atacante; acabar la ronda 15 se la da a la base.
  - Defensa del ordenador: gasta su dinero en torres en puntos válidos que cubren caminos, repara y mejora; en Difícil pone muros; nunca hace acciones inválidas.
  - Selección y grupos: recuadro, Mayús, doble clic por tipo, grupos y su limpieza.
  - Guardado: ida y vuelta en modo ataque; los guardados de defensa siguen cargando.
- **Partidas completas automáticas:** un bot atacante sencillo (compra unidades, las agrupa y las manda por la carretera menos defendida) contra la defensa del ordenador, en los 4 mapas y las 3 dificultades. Objetivos de equilibrio para ese bot: en **Fácil** gana la mayoría de partidas; en **Normal**, alrededor de la mitad; en **Difícil**, pocas. Precios, ingresos y presupuestos de la defensa se ajustan hasta conseguirlo.
- **Navegador:** recorrido completo (menú → mapa → dificultad → preparación → rondas → victoria o derrota), con selección, grupos, órdenes, tienda, mejoras, cámara, guardar y cargar.

## 10. Fuera de alcance

- Habilidades de apoyo (entrega posterior).
- Atacante contra defensor humano (partes 3 y 4) y modo ataque en la red de casa.
- Moverse fuera de calles y carreteras.
- Tipos de unidad nuevos o arte nuevo (salvo iconos y marcas sencillas dibujadas por el juego).
- Niebla de guerra: el atacante ve todo el mapa y todas las torres.
- Formaciones elaboradas más allá de repartir las paradas a lo largo de la calle.
- Ranking de puntuaciones del modo ataque.
