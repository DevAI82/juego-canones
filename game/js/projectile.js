export function createProjectile(x, y, target, damage, speed = 400) {
  return { x, y, target, damage, speed, alive: true };
}

export function stepProjectile(proj, dt) {
  if (!proj.alive) return false;
  if (!proj.target.alive) {
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
