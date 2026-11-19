// The vehicles of the RTS mode (per user request: a new kind of game,
// still to be designed with the user -- "sólo en el nuevo tipo de juego
// que se llamará RTS"). Kept apart from enemy.js's units, so neither the
// defence's waves nor the attack's shop ever have them.
//
// For now what's needed to show one: its name, its sheet of pictures --
// rendered off its 3D model like every unit's (unitSprites.js;
// tools/blender/rts.py) -- its portrait for a build button, and its size
// on the ground. What it costs, where it's built and what it does come
// with the mode.
export const RTS_UNIT_TYPES = {
  // The ore harvester: a big tracked vehicle with a drill at the front and
  // a hopper at the back.
  harvester: {
    name: "Cosechadora",
    sprite: "assets/units3d/harvester_hull.webp",
    portrait: "assets/units3d/harvester_icon.webp",
    footprint: [100, 43], // px: length, width -- a tank is 72 x 36
  },
};
export const RTS_UNIT_ORDER = Object.keys(RTS_UNIT_TYPES);
