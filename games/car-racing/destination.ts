import { exitsAt, generateMap, idx, roadLen, shortestPath, step, turnToward, DX, DY, type Dir, type Exits, type Node, type RouteMap } from "./route";
import type { JunctionInfo, Turn } from "./junction";

// Destination mode: where the player is on the road network, which junction is next, which way is fastest,
// and the minimap that shows all of it.

export class Destination {
  map: RouteMap;
  from!: Node; // the junction the car last left
  to!: Node; // the junction it is heading for
  heading!: Dir;
  len = 0; // length of the road from `from` to `to`, in metres
  originZ = 0; // where `from` sits on the (straight) road the game draws
  private visited = new Set<number>();
  private pathKey = "";
  private path: Node[] = [];

  constructor(map: RouteMap = generateMap()) {
    this.map = map;
    this.reset();
  }
  reset() {
    this.from = this.map.start; this.heading = this.map.startDir;
    this.to = step(this.from, this.heading); this.len = roadLen(this.map, this.from, this.heading) ?? 600;
    this.originZ = 0; this.visited = new Set([idx(this.map, this.from)]);
  }

  name(n: Node) { return this.map.names[idx(this.map, n)]; }
  get destName() { return this.name(this.map.dest); }
  get startName() { return this.name(this.map.start); }
  get exits(): Exits { return exitsAt(this.map, this.to, this.heading); }
  get atDestination() { return this.to.x === this.map.dest.x && this.to.y === this.map.dest.y; }

  /** What the junction ahead looks like, for the junction kit. */
  junctionInfo(z: number): JunctionInfo {
    const e = this.exits;
    return { z, left: e.left && this.name(e.left.to), straight: e.straight && this.name(e.straight.to), right: e.right && this.name(e.right.to), dest: this.atDestination ? this.destName : undefined };
  }

  /** The car drove straight through the junction. Returns false if there is no road straight on. */
  goStraight(jz: number): boolean {
    const e = this.exits.straight; if (!e) return false;
    this.visited.add(idx(this.map, this.to));
    this.from = this.to; this.to = e.to; this.len = e.len; this.originZ = jz;
    return true;
  }
  /** The car turned onto a crossing road. The new road starts at z = 0 in the freshly laid-out world. */
  turn(dir: "left" | "right") {
    const e = this.exits[dir]; if (!e) return;
    this.visited.add(idx(this.map, this.to));
    this.from = this.to; this.to = e.to; this.heading = e.dir; this.len = e.len; this.originZ = 0;
  }

  /** The turn the fastest route takes at the junction ahead (undefined once you are at the destination). */
  recommended(): Turn | undefined {
    const p = this.route();
    if (p.length < 2) return undefined;
    const a = p[0], b = p[1];
    const d = (b.x > a.x ? 1 : b.x < a.x ? 3 : b.y > a.y ? 2 : 0) as Dir;
    return turnToward(this.heading, d);
  }
  /** Junctions along the fastest route, starting with the one ahead. */
  route(): Node[] {
    const key = `${this.to.x},${this.to.y},${this.heading}`;
    if (key !== this.pathKey) { this.pathKey = key; this.path = shortestPath(this.map, this.to, this.heading, this.map.dest)?.nodes ?? [this.to]; }
    return this.path;
  }

  /** How far along the current road the car is, 0 to 1. */
  progress(pz: number) { return Math.max(0, Math.min(1, (this.originZ - pz) / this.len)); }

  /** Draw the minimap: roads, the fastest route, junction names, the destination and the car. */
  draw(canvas: HTMLCanvasElement, pz: number, showCar = true) {
    const g = canvas.getContext("2d"); if (!g) return;
    const W = canvas.width, H = canvas.height, m = this.map, pad = W * 0.16;
    const cw = (W - pad * 2) / (m.w - 1), ch = (H - pad * 2) / (m.h - 1);
    const P = (n: Node | { x: number; y: number }) => ({ x: pad + n.x * cw, y: pad + n.y * ch });
    g.clearRect(0, 0, W, H);
    g.lineCap = "round"; g.lineJoin = "round";
    // roads
    g.strokeStyle = "rgba(255,255,255,.22)"; g.lineWidth = W * 0.026;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) for (const d of [1, 2] as Dir[]) {
      if (roadLen(m, { x, y }, d) === undefined) continue;
      const a = P({ x, y }), b = P({ x: x + DX[d], y: y + DY[d] });
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
    // the fastest route from the junction ahead
    const r = this.route();
    if (r.length > 1) {
      g.strokeStyle = "#c6f432"; g.lineWidth = W * 0.022; g.setLineDash([W * 0.035, W * 0.03]);
      g.beginPath(); const s = P(r[0]); g.moveTo(s.x, s.y); r.slice(1).forEach(n => { const p = P(n); g.lineTo(p.x, p.y); }); g.stroke(); g.setLineDash([]);
    }
    // junctions
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const p = P({ x, y }), seen = this.visited.has(y * m.w + x);
      g.fillStyle = seen ? "#fff" : "rgba(255,255,255,.55)"; g.beginPath(); g.arc(p.x, p.y, W * 0.022, 0, 7); g.fill();
    }
    // destination: a flag and its name
    const d = P(m.dest);
    g.fillStyle = "#ff8a3d"; g.beginPath(); g.arc(d.x, d.y, W * 0.05, 0, 7); g.fill();
    g.fillStyle = "#111"; g.font = `bold ${W * 0.07}px Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("★", d.x, d.y + 1);
    g.fillStyle = "#fff"; g.font = `bold ${W * 0.062}px Arial, sans-serif`;
    g.fillText(this.destName, Math.min(W - W * 0.17, Math.max(W * 0.17, d.x)), d.y + (d.y > H * 0.5 ? -W * 0.085 : W * 0.085));
    // the car
    if (showCar) {
      const a = P(this.from), b = P(this.to), t = this.progress(pz);
      const cx = a.x + (b.x - a.x) * t, cy = a.y + (b.y - a.y) * t, ang = this.heading * (Math.PI / 2);
      g.save(); g.translate(cx, cy); g.rotate(ang);
      g.fillStyle = "#c6f432"; g.strokeStyle = "#0E1222"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, -W * 0.06); g.lineTo(W * 0.045, W * 0.04); g.lineTo(0, W * 0.015); g.lineTo(-W * 0.045, W * 0.04); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
  }
}
