// The vehicles of the RTS mode (per user request: a new kind of game,
// still to be designed with the user -- "sólo en el nuevo tipo de juego
// que se llamará RTS"). Kept apart from enemy.js's units, so neither the
// defence's waves nor the attack's shop ever have them.
//
// For now what's needed to show one: its name, its picture from above --
// drawn on the map turned the way it heads, like every unit, so it faces
// right (+x) -- its portrait for a build button, and its size on the
// ground. tools/extract_harvester.py makes the pictures from the user's
// drawings in enemigos/. What it costs, where it's built and what it does
// come with the mode.
export const RTS_UNIT_TYPES = {
  // The ore harvester: a big tracked vehicle with a drill at the front and
  // a hopper at the back.
  harvester: {
    name: "Cosechadora",
    sprite: "assets/unit_harvester.png",
    portrait: "assets/harvester_portrait.webp",
    footprint: [100, 43], // px: length, width -- a tank is 72 x 36
  },
};
export const RTS_UNIT_ORDER = Object.keys(RTS_UNIT_TYPES);
