// `style` and `sound` are purely cosmetic -- main.js's draw dispatch reads
// `style` to pick a tank-shell sprite vs. a lightweight tracer streak, and
// its audio layer reads `sound` to pick a machinegun/cannon/missile sound
// effect (independent of `style`: the enemy rocket launcher renders with
// the same shell sprite as a cannon shot but should still sound distinct).
// stepProjectile itself never looks at either.
export function createProjectile(x, y, target, damage, speed = 400, style = "tracer", sound = "machinegun") {
  return { x, y, target, damage, speed, style, sound, alive: true };
}

export function stepProjectile(proj, dt) {
  if (!proj.alive) return false;
  const targetDead = proj.target.alive === false || proj.target.hp <= 0;
  if (targetDead) {
    proj.alive = false;
    return false;
  }
  const dx = proj.target.x - proj.x;
  const dy = proj.target.y - proj.y;
  const dist = Math.hypot(dx, dy);
  const step = proj.speed * dt;

  if (step >= dist) {
    proj.x = proj.target.x;
    proj.y = proj.target.y;
    proj.alive = false;
    return true;
  }
  proj.x += (dx / dist) * step;
  proj.y += (dy / dist) * step;
  return false;
}
