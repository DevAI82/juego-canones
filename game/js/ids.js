// Every object in a game -- towers, wall blocks, units, shots,
// explosions -- gets its id from this one counter, shared by the defence
// game (simulate.js) and the attack mode (attack.js), so no two things in
// a game ever share an id (orders and selections pick units and towers by
// id).
let nextId = 1;

export function assignId(obj) {
  obj.id = nextId++;
  return obj;
}
