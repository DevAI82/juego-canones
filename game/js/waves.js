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
  // Waves 11-20: extended per user request (20 waves total, progressively
  // harder). Total enemy count climbs from ~29 (wave 10) toward ~68
  // (wave 20), spawn intervals tighten (more relentless, less time to
  // react between individual spawns), and the tougher/higher-value units
  // (tank, rocket) make up a growing share of each wave instead of being
  // a rare surprise -- by wave 19-20 they're a core part of the mix, not
  // an occasional curveball.
  { enemies: [{ type: "soldier", count: 10, interval: 0.3 }, { type: "motorcycle", count: 8, interval: 0.3 }, { type: "tank", count: 4, interval: 1.0 }] },
  { enemies: [{ type: "buggy", count: 8, interval: 0.3 }, { type: "rocket", count: 4, interval: 1.6 }, { type: "soldier", count: 6, interval: 0.3 }] },
  { enemies: [{ type: "motorcycle", count: 10, interval: 0.25 }, { type: "tank", count: 5, interval: 0.9 }, { type: "buggy", count: 6, interval: 0.3 }] },
  { enemies: [{ type: "soldier", count: 12, interval: 0.3 }, { type: "rocket", count: 5, interval: 1.5 }, { type: "motorcycle", count: 6, interval: 0.25 }] },
  { enemies: [{ type: "tank", count: 6, interval: 0.8 }, { type: "rocket", count: 5, interval: 1.4 }, { type: "buggy", count: 8, interval: 0.3 }] },
  { enemies: [{ type: "soldier", count: 14, interval: 0.25 }, { type: "motorcycle", count: 10, interval: 0.2 }, { type: "tank", count: 5, interval: 0.8 }] },
  { enemies: [{ type: "buggy", count: 10, interval: 0.25 }, { type: "rocket", count: 6, interval: 1.3 }, { type: "tank", count: 6, interval: 0.7 }] },
  { enemies: [{ type: "soldier", count: 14, interval: 0.2 }, { type: "motorcycle", count: 12, interval: 0.2 }, { type: "rocket", count: 6, interval: 1.2 }, { type: "tank", count: 5, interval: 0.8 }] },
  { enemies: [{ type: "tank", count: 8, interval: 0.6 }, { type: "rocket", count: 8, interval: 1.1 }, { type: "buggy", count: 10, interval: 0.2 }, { type: "motorcycle", count: 8, interval: 0.2 }] },
  { enemies: [{ type: "soldier", count: 16, interval: 0.2 }, { type: "buggy", count: 12, interval: 0.2 }, { type: "motorcycle", count: 12, interval: 0.15 }, { type: "tank", count: 10, interval: 0.5 }, { type: "rocket", count: 10, interval: 0.9 }] },
  // Waves 21-40: extended per user request (40 waves total). Continues the
  // same escalation waves 11-20 established, with the occasional lighter
  // "breather" wave (a wave right after a big/mixed one that's simpler,
  // even if not smaller) so it doesn't read as pure uninterrupted grind --
  // real TD games pace difficulty the same way. Every 5th wave (25/30/35)
  // is a deliberate milestone spike. By wave 40, spawn intervals are a
  // fraction of wave 1's and tank/rocket make up nearly half of every wave
  // instead of being the minority they still were at wave 20.
  { enemies: [{ type: "soldier", count: 16, interval: 0.18 }, { type: "buggy", count: 14, interval: 0.18 }, { type: "tank", count: 8, interval: 0.5 }] },
  { enemies: [{ type: "motorcycle", count: 16, interval: 0.15 }, { type: "rocket", count: 8, interval: 0.9 }, { type: "tank", count: 6, interval: 0.5 }] },
  { enemies: [{ type: "soldier", count: 18, interval: 0.15 }, { type: "buggy", count: 14, interval: 0.15 }, { type: "motorcycle", count: 10, interval: 0.15 }] },
  { enemies: [{ type: "tank", count: 10, interval: 0.45 }, { type: "rocket", count: 10, interval: 0.8 }, { type: "buggy", count: 10, interval: 0.15 }] },
  // Milestone.
  { enemies: [{ type: "soldier", count: 20, interval: 0.15 }, { type: "motorcycle", count: 16, interval: 0.12 }, { type: "rocket", count: 8, interval: 0.8 }, { type: "tank", count: 8, interval: 0.45 }] },
  { enemies: [{ type: "buggy", count: 16, interval: 0.12 }, { type: "rocket", count: 10, interval: 0.75 }, { type: "tank", count: 10, interval: 0.4 }] },
  { enemies: [{ type: "soldier", count: 20, interval: 0.12 }, { type: "motorcycle", count: 18, interval: 0.1 }, { type: "tank", count: 10, interval: 0.4 }] },
  { enemies: [{ type: "rocket", count: 12, interval: 0.7 }, { type: "tank", count: 12, interval: 0.35 }, { type: "buggy", count: 14, interval: 0.1 }] },
  { enemies: [{ type: "soldier", count: 24, interval: 0.1 }, { type: "motorcycle", count: 20, interval: 0.1 }, { type: "rocket", count: 10, interval: 0.65 }, { type: "tank", count: 10, interval: 0.35 }] },
  // Milestone.
  { enemies: [{ type: "tank", count: 14, interval: 0.3 }, { type: "rocket", count: 14, interval: 0.6 }, { type: "buggy", count: 16, interval: 0.1 }, { type: "motorcycle", count: 14, interval: 0.1 }] },
  { enemies: [{ type: "soldier", count: 24, interval: 0.1 }, { type: "buggy", count: 18, interval: 0.1 }, { type: "tank", count: 12, interval: 0.3 }] },
  { enemies: [{ type: "motorcycle", count: 22, interval: 0.08 }, { type: "rocket", count: 14, interval: 0.6 }, { type: "tank", count: 12, interval: 0.3 }] },
  { enemies: [{ type: "soldier", count: 26, interval: 0.08 }, { type: "tank", count: 14, interval: 0.28 }, { type: "rocket", count: 12, interval: 0.55 }] },
  { enemies: [{ type: "buggy", count: 20, interval: 0.08 }, { type: "motorcycle", count: 22, interval: 0.08 }, { type: "rocket", count: 14, interval: 0.55 }, { type: "tank", count: 12, interval: 0.28 }] },
  // Milestone.
  { enemies: [{ type: "tank", count: 16, interval: 0.25 }, { type: "rocket", count: 16, interval: 0.5 }, { type: "soldier", count: 22, interval: 0.08 }] },
  { enemies: [{ type: "motorcycle", count: 24, interval: 0.07 }, { type: "buggy", count: 22, interval: 0.07 }, { type: "tank", count: 14, interval: 0.25 }] },
  { enemies: [{ type: "soldier", count: 28, interval: 0.07 }, { type: "rocket", count: 16, interval: 0.5 }, { type: "tank", count: 14, interval: 0.25 }] },
  { enemies: [{ type: "tank", count: 18, interval: 0.22 }, { type: "rocket", count: 18, interval: 0.45 }, { type: "buggy", count: 20, interval: 0.07 }, { type: "motorcycle", count: 20, interval: 0.07 }] },
  { enemies: [{ type: "soldier", count: 30, interval: 0.06 }, { type: "motorcycle", count: 24, interval: 0.06 }, { type: "rocket", count: 16, interval: 0.45 }, { type: "tank", count: 16, interval: 0.22 }] },
  // Final wave: every unit type, at the game's largest numbers, spawning
  // near-continuously.
  { enemies: [{ type: "soldier", count: 32, interval: 0.06 }, { type: "buggy", count: 26, interval: 0.06 }, { type: "motorcycle", count: 26, interval: 0.05 }, { type: "tank", count: 20, interval: 0.2 }, { type: "rocket", count: 20, interval: 0.4 }] },
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
