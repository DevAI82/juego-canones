// `style` is purely cosmetic (main.js's draw dispatch reads it to pick a
// tank-shell sprite vs. a lightweight tracer streak) -- stepProjectile
// itself never looks at it.
export function createProjectile(x, y, target, damage, speed = 400, style = "tracer") {
  return { x, y, target, damage, speed, style, alive: true };
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
