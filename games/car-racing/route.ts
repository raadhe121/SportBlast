// The road network for Destination mode: a grid of junctions joined by roads of different lengths.
// Pure logic (no graphics) so it can be tested on its own.

export type Dir = 0 | 1 | 2 | 3; // 0 north (up the map), 1 east, 2 south, 3 west
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
export const DIR_NAMES = ["north", "east", "south", "west"];

export interface Node { x: number; y: number }
export interface Exit { dir: Dir; to: Node; len: number }
export interface Exits { left?: Exit; straight?: Exit; right?: Exit }
export interface RouteMap {
  w: number; h: number;
  names: string[]; // one per junction, index y * w + x
  edgeLen: Map<string, number>; // road length in metres, keyed by the two junction indexes
  start: Node; startDir: Dir;
  dest: Node;
}

const PLACE_NAMES = [
  "Central", "Harbour", "Airport", "Market", "Old Town", "Stadium", "University", "Park", "Station", "Castle",
  "Lighthouse", "Riverside", "Museum", "Brewery", "Hilltop", "Mill", "Bridgeend", "Lakeside", "Docks", "Summit"
];

export const idx = (m: { w: number }, n: Node) => n.y * m.w + n.x;
const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const inside = (m: { w: number; h: number }, x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h;

/** Length of the road leaving junction n in direction d, or undefined if there is no road that way. */
export function roadLen(m: RouteMap, n: Node, d: Dir): number | undefined {
  const x = n.x + DX[d], y = n.y + DY[d];
  if (!inside(m, x, y)) return undefined;
  return m.edgeLen.get(key(idx(m, n), idx(m, { x, y })));
}
export const step = (n: Node, d: Dir): Node => ({ x: n.x + DX[d], y: n.y + DY[d] });
export const turnLeft = (d: Dir) => ((d + 3) % 4) as Dir;
export const turnRight = (d: Dir) => ((d + 1) % 4) as Dir;

/** The ways out of junction n for a car that arrived heading `arrival` (no U-turns). */
export function exitsAt(m: RouteMap, n: Node, arrival: Dir): Exits {
  const mk = (dir: Dir): Exit | undefined => { const len = roadLen(m, n, dir); return len === undefined ? undefined : { dir, to: step(n, dir), len }; };
  return { left: mk(turnLeft(arrival)), straight: mk(arrival), right: mk(turnRight(arrival)) };
}

function connected(m: RouteMap) {
  const seen = new Set<number>([0]), stack = [0];
  while (stack.length) {
    const i = stack.pop()!, n = { x: i % m.w, y: Math.floor(i / m.w) };
    for (let d = 0 as Dir; d < 4; d++) {
      if (roadLen(m, n, d) === undefined) continue;
      const j = idx(m, step(n, d));
      if (!seen.has(j)) { seen.add(j); stack.push(j); }
    }
  }
  return seen.size === m.w * m.h;
}
const degree = (m: RouteMap, n: Node) => [0, 1, 2, 3].filter(d => roadLen(m, n, d as Dir) !== undefined).length;

/**
 * Fastest way from junction `from` (reached heading `arrival`) to `to`, without U-turns.
 * Returns the junctions to pass through, starting with `from`, and the total distance.
 */
export function shortestPath(m: RouteMap, from: Node, arrival: Dir, to: Node): { nodes: Node[]; dist: number } | null {
  type S = { n: Node; d: Dir; cost: number; prev?: S };
  const best = new Map<string, number>();
  const open: S[] = [{ n: from, d: arrival, cost: 0 }];
  while (open.length) {
    open.sort((a, b) => a.cost - b.cost);
    const cur = open.shift()!;
    if (cur.n.x === to.x && cur.n.y === to.y) {
      const nodes: Node[] = []; for (let s: S | undefined = cur; s; s = s.prev) nodes.unshift(s.n);
      return { nodes, dist: cur.cost };
    }
    const k = `${cur.n.x},${cur.n.y},${cur.d}`;
    if ((best.get(k) ?? Infinity) <= cur.cost) continue;
    best.set(k, cur.cost);
    for (const e of Object.values(exitsAt(m, cur.n, cur.d))) if (e) open.push({ n: e.to, d: e.dir, cost: cur.cost + e.len, prev: cur });
  }
  return null;
}

/** Which way a path turns at the junction it is about to reach: left, straight or right. */
export function turnToward(arrival: Dir, next: Dir): "left" | "straight" | "right" {
  return next === arrival ? "straight" : next === turnLeft(arrival) ? "left" : "right";
}

export function generateMap(w = 4, h = 4, rnd: () => number = Math.random): RouteMap {
  const m: RouteMap = { w, h, names: [], edgeLen: new Map(), start: { x: 0, y: 0 }, startDir: 0, dest: { x: 0, y: 0 } };
  const pool = [...PLACE_NAMES];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  m.names = Array.from({ length: w * h }, (_, i) => pool[i % pool.length]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = y * w + x;
    if (x + 1 < w) m.edgeLen.set(key(a, a + 1), 560 + Math.floor(rnd() * 40) * 10);
    if (y + 1 < h) m.edgeLen.set(key(a, a + w), 560 + Math.floor(rnd() * 40) * 10);
  }
  // close a few roads so some crossroads become T-junctions, but keep every junction reachable and never leave a dead end
  for (let tries = 0, removed = 0; tries < 30 && removed < 3; tries++) {
    const keys = [...m.edgeLen.keys()], k = keys[Math.floor(rnd() * keys.length)], len = m.edgeLen.get(k)!;
    m.edgeLen.delete(k);
    const [a, b] = k.split("-").map(Number);
    const na = { x: a % w, y: Math.floor(a / w) }, nb = { x: b % w, y: Math.floor(b / w) };
    if (connected(m) && degree(m, na) >= 2 && degree(m, nb) >= 2) removed++; else m.edgeLen.set(k, len);
  }
  // start on the bottom row heading north (or along the edge if the road north is closed); the destination is far away
  for (let attempt = 0; attempt < 200; attempt++) {
    const start = { x: Math.floor(rnd() * w), y: h - 1 };
    const dirs = ([0, 1, 3] as Dir[]).filter(d => roadLen(m, start, d) !== undefined);
    if (!dirs.length) continue;
    const startDir = dirs[0];
    const dest = { x: Math.floor(rnd() * w), y: Math.floor(rnd() * (h - 1)) };
    if (Math.abs(dest.x - start.x) + Math.abs(dest.y - start.y) < w + h - 4) continue;
    const first = step(start, startDir);
    if (!shortestPath(m, first, startDir, dest) && !(first.x === dest.x && first.y === dest.y)) continue;
    m.start = start; m.startDir = startDir; m.dest = dest;
    return m;
  }
  m.start = { x: 0, y: h - 1 }; m.startDir = 0; m.dest = { x: w - 1, y: 0 };
  return m;
}
