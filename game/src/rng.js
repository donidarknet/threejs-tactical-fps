// Seeded randomness, one place. mulberry32 is small, fast and deterministic, so a
// screenshot with ?seed=N replays the same bot placement and spread every time.
// Nothing else in the game rolls its own dice.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(random, low, high) {
  return low + random() * (high - low);
}

export function pick(random, list) {
  return list[Math.floor(random() * list.length) % list.length];
}

export function chance(random, probability) {
  return random() < probability;
}
