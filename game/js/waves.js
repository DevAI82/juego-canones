export const WAVES = [
  { enemies: [{ type: "soldier", count: 5, interval: 1.0 }] },
  { enemies: [{ type: "soldier", count: 4, interval: 0.9 }, { type: "buggy", count: 2, interval: 0.8 }] },
  // motorcycle debuts: fast/weak, teaches that speed alone can still be
  // handled by early towers if placed with any real range.
  { enemies: [{ type: "buggy", count: 3, interval: 0.6 }, { type: "motorcycle", count: 4, interval: 0.4 }] },
  { enemies: [{ type: "soldier", count: 6, interval: 0.7 }, { type: "tank", count: 1, interval: 2.0 }] },
  { enemies: [{ type: "buggy", count: 4, interval: 0.5 }, { type: "tank", count: 2, interval: 1.8 }] },
  // rocket debuts: fewer, tougher, and it outranges early towers -- the
  // first wave that rewards focusing fire on the dangerous unit first.
  { enemies: [{ type: "soldier", count: 6, interval: 0.5 }, { type: "rocket", count: 2, interval: 2.2 }] },
  { enemies: [{ type: "motorcycle", count: 6, interval: 0.3 }, { type: "tank", count: 3, interval: 1.5 } ] },
  { enemies: [{ type: "soldier", count: 8, interval: 0.4 }, { type: "rocket", count: 2, interval: 2.0 }, { type: "buggy", count: 4, interval: 0.4 }] },
  { enemies: [{ type: "buggy", count: 6, interval: 0.4 }, { type: "motorcycle", count: 6, interval: 0.3 }, { type: "tank", count: 3, interval: 1.2 } ] },
  { enemies: [{ type: "soldier", count: 10, interval: 0.35 }, { type: "buggy", count: 6, interval: 0.4 }, { type: "tank", count: 4, interval: 1.0 }, { type: "rocket", count: 3, interval: 1.8 } ] },
];

export function buildSpawnQueue(waveIndex) {
  const wave = WAVES[waveIndex];
  const queue = [];
  for (const group of wave.enemies) {
    let t = 0;
    for (let i = 0; i < group.count; i++) {
      queue.push({ type: group.type, time: t });
      t += group.interval;
    }
  }
  return queue.sort((a, b) => a.time - b.time);
}
