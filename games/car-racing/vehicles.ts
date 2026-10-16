import * as THREE from "three";
import type { CarKind } from "./cars";
import type { Kind } from "./places";

// Vehicle models, built from boxes, extruded side profiles and wheels. No external model files.

export interface Wheel { g: THREE.Group; r: number }
export interface Vehicle {
  root: THREE.Group; tilt: THREE.Group; wheels: Wheel[];
  paint: THREE.MeshStandardMaterial; trailerPaint?: THREE.MeshStandardMaterial; tail: THREE.MeshStandardMaterial;
  hw: number; hl: number; kind: Kind | CarKind; lx: number; ly: number; tailGlows?: THREE.Sprite[];
  wiper?: THREE.Group; rearGlass?: THREE.Group; rearLen?: number; // rear window (player only): wiper, cracks
  flames?: THREE.Group; // nitro flames from the exhausts (player only)
  damage?: { geo: THREE.BufferGeometry; base: Float32Array }; // body mesh that can be dented (player only)
  cracks?: THREE.Mesh[]; // cracked-glass decals on the rear window, light to heavy (player only)
}

function roundedShape(pts: number[][], r: number) {
  const s = new THREE.Shape(), n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const d1 = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]), d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const r1 = Math.min(r, d1 / 2), r2 = Math.min(r, d2 / 2);
    const ax = p1[0] + (p0[0] - p1[0]) / d1 * r1, ay = p1[1] + (p0[1] - p1[1]) / d1 * r1;
    const bx = p1[0] + (p2[0] - p1[0]) / d2 * r2, by = p1[1] + (p2[1] - p1[1]) / d2 * r2;
    if (i === 0) s.moveTo(ax, ay); else s.lineTo(ax, ay);
    s.quadraticCurveTo(p1[0], p1[1], bx, by);
  }
  s.closePath();
  return s;
}
// Side profile (u = along the car, +u is the front; v = height) extruded across the car's width.
export function extrudeProfile(pts: number[][], r: number, width: number, bevel: number) {
  const depth = Math.max(0.01, width - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(roundedShape(pts, r), {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 5
  });
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2); // front (+u) now points to -z
  return g;
}

export interface CarSpec {
  hw: number; hl: number; wheelR: number; wheelW: number; wheelZ: number[]; wheelX: number;
  body: number[][]; bodyW: number; cab: number[][]; cabW: number; roof: { u: number; len: number; y: number; w: number };
  lightY: number; spoiler: { y: number; z: number; w: number; h: number };
  stripes: [len: number, y: number, z: number, rotX: number][]; // racing stripes on the player's car
}
export const SPEC: Record<CarKind, CarSpec> = {
  sedan: {
    hw: 0.9, hl: 2.3, wheelR: 0.34, wheelW: 0.25, wheelZ: [-1.45, 1.4], wheelX: 0.83,
    body: [[-2.25, 0.2], [-2.25, 0.78], [-1.2, 0.9], [1.1, 0.9], [2.0, 0.84], [2.25, 0.64], [2.25, 0.2]], bodyW: 1.8,
    cab: [[-1.25, 0.86], [-0.8, 1.36], [0.5, 1.36], [1.05, 0.86]], cabW: 1.62, roof: { u: -0.15, len: 1.3, y: 1.385, w: 1.6 },
    lightY: 0.66, spoiler: { y: 1.12, z: 2.1, w: 1.5, h: 0.18 },
    stripes: [[1.0, 0.955, -1.55, -0.055], [0.9, 0.915, 1.7, 0.1], [1.32, 1.43, 0.15, 0]]
  },
  coupe: {
    hw: 0.95, hl: 2.3, wheelR: 0.35, wheelW: 0.28, wheelZ: [-1.45, 1.45], wheelX: 0.88,
    body: [[-2.25, 0.18], [-2.25, 0.7], [-1.1, 0.82], [0.8, 0.8], [1.9, 0.64], [2.25, 0.48], [2.25, 0.18]], bodyW: 1.9,
    cab: [[-1.5, 0.78], [-0.75, 1.18], [0.3, 1.18], [0.95, 0.76]], cabW: 1.56, roof: { u: -0.22, len: 1.0, y: 1.205, w: 1.54 },
    lightY: 0.56, spoiler: { y: 1.0, z: 2.1, w: 1.7, h: 0.22 },
    stripes: [[1.1, 0.77, -1.4, -0.14], [0.9, 0.81, 1.7, 0.1], [1.0, 1.245, 0.22, 0]]
  },
  suv: {
    hw: 1.0, hl: 2.45, wheelR: 0.4, wheelW: 0.28, wheelZ: [-1.55, 1.5], wheelX: 0.92,
    body: [[-2.4, 0.26], [-2.4, 1.02], [1.5, 1.06], [2.2, 0.96], [2.4, 0.7], [2.4, 0.26]], bodyW: 1.96,
    cab: [[-2.35, 1.0], [-2.2, 1.7], [0.75, 1.7], [1.42, 1.0]], cabW: 1.8, roof: { u: -0.7, len: 2.9, y: 1.73, w: 1.78 },
    lightY: 0.82, spoiler: { y: 1.74, z: 2.3, w: 1.5, h: 0.14 },
    stripes: [[0.6, 1.06, -1.85, -0.14], [2.7, 1.775, 0.7, 0]]
  }
};
export const TRUCK = { hw: 1.25, hl: 6.8, r: 0.5, w: 0.34, axles: [5.6, 3.0, -4.8] };
type CanvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb?: boolean) => THREE.Texture;

export function createVehicleKit(canvasTex: CanvasTex, col: (h: number) => THREE.Color, radialTex: THREE.Texture) {
  const TIRE = new THREE.MeshLambertMaterial({ color: col(0x16171a) });
  const rimTex = canvasTex(128, 128, (g, w) => {
    const c = w / 2; g.fillStyle = "#17181b"; g.fillRect(0, 0, w, w);
    g.strokeStyle = "#c9ced5"; g.lineWidth = 9; g.beginPath(); g.arc(c, c, 54, 0, 7); g.stroke();
    g.fillStyle = "#c9ced5";
    for (let k = 0; k < 5; k++) { g.save(); g.translate(c, c); g.rotate(k * Math.PI * 2 / 5); g.fillRect(-8, -52, 16, 52); g.restore(); }
    g.fillStyle = "#8f959d"; g.beginPath(); g.arc(c, c, 13, 0, 7); g.fill();
  });
  const RIM = new THREE.MeshStandardMaterial({ map: rimTex, metalness: 0.65, roughness: 0.3 });
  const GLASS = new THREE.MeshStandardMaterial({ color: col(0x0b1118), metalness: 0.9, roughness: 0.07 });
  const DARK = new THREE.MeshLambertMaterial({ color: col(0x0a0a0c) });
  const HEAD = new THREE.MeshStandardMaterial({ color: col(0xfff4d6), emissive: col(0xfff0c0), emissiveIntensity: 2.4 });
  const wheelCache = new Map<string, { tire: THREE.BufferGeometry; rim: THREE.BufferGeometry }>();
  function makeWheel(r: number, w: number) {
    const key = r + "_" + w;
    let geo = wheelCache.get(key);
    if (!geo) { geo = { tire: new THREE.CylinderGeometry(r, r, w, 18).rotateZ(Math.PI / 2), rim: new THREE.CircleGeometry(r * 0.74, 20) }; wheelCache.set(key, geo); }
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo.tire, TIRE));
    for (const s of [-1, 1]) { const d = new THREE.Mesh(geo.rim, RIM); d.position.x = s * (w / 2 + 0.004); d.rotation.y = s * Math.PI / 2; g.add(d); }
    return g;
  }
  const glowMat = (color: number, opacity = 0.85) =>
    new THREE.SpriteMaterial({ map: radialTex, color: col(color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false });
  const sharedHeadGlow = glowMat(0xfff0b8, 0.9), sharedTailGlow = glowMat(0xff2a1a, 0.8);
  function glow(mat: THREE.SpriteMaterial, sz: number, x: number, y: number, z: number) {
    const s = new THREE.Sprite(mat); s.scale.set(sz, sz, 1); s.position.set(x, y, z); return s;
  }

  const carGeoCache: Partial<Record<CarKind, { body: THREE.BufferGeometry; cab: THREE.BufferGeometry; roof: THREE.BufferGeometry }>> = {};
  function buildCar(kind: CarKind, color: number, player: boolean): Vehicle {
    const S = SPEC[kind];
    const G = (carGeoCache[kind] ??= {
      body: extrudeProfile(S.body, 0.16, S.bodyW, 0.04), cab: extrudeProfile(S.cab, 0.1, S.cabW, 0), roof: new THREE.BoxGeometry(S.roof.w, 0.07, S.roof.len)
    });
    const root = new THREE.Group(), tilt = new THREE.Group(); root.add(tilt);
    const paint = new THREE.MeshStandardMaterial({ color: col(color), metalness: player ? 0.78 : 0.55, roughness: player ? 0.16 : 0.32 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = false) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; tilt.add(m); return m;
    };
    // the player's body gets its own copy of the mesh, with vertex colours, so it can be dented and scuffed
    let bodyGeo: THREE.BufferGeometry = G.body, bodyMat: THREE.Material = paint;
    if (player) {
      bodyGeo = G.body.clone();
      bodyGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(bodyGeo.attributes.position.count * 3).fill(1), 3));
      const pm = paint.clone(); pm.vertexColors = true; bodyMat = pm;
    }
    add(bodyGeo, bodyMat, 0, 0, 0, true);
    add(G.cab, GLASS, 0, 0, 0, true);
    add(G.roof, paint, 0, S.roof.y, -S.roof.u, true);
    const tail = new THREE.MeshStandardMaterial({ color: col(0x3a0000), emissive: col(0xff1a10), emissiveIntensity: 1.1 });
    const headBox = new THREE.BoxGeometry(0.4, 0.12, 0.06), tailBox = new THREE.BoxGeometry(0.46, 0.12, 0.06);
    const ly = S.lightY, lx = S.bodyW / 2 - 0.3;
    for (const s of [-1, 1]) {
      add(headBox, HEAD, s * lx, ly, -(S.hl + 0.03));
      add(tailBox, tail, s * lx, ly + 0.1, S.hl + 0.03);
      add(new THREE.BoxGeometry(0.2, 0.11, 0.12), paint, s * (S.cabW / 2 + 0.1), S.cab[0][1] + 0.1, -S.cab[3][0] + 0.15); // mirrors
    }
    add(new THREE.BoxGeometry(S.bodyW - 0.1, 0.12, 0.08), DARK, 0, 0.3, -(S.hl + 0.02));
    add(new THREE.BoxGeometry(S.bodyW - 0.1, 0.12, 0.08), DARK, 0, 0.3, S.hl + 0.02);
    const wheels: Wheel[] = [];
    for (const z of S.wheelZ) for (const s of [-1, 1]) {
      const w = makeWheel(S.wheelR, S.wheelW); w.position.set(s * S.wheelX, S.wheelR, z); tilt.add(w); wheels.push({ g: w, r: S.wheelR });
    }
    const v: Vehicle = { root, tilt, wheels, paint, tail, hw: S.hw, hl: S.hl, kind, lx, ly };
    if (player) {
      const stripe = new THREE.MeshStandardMaterial({ color: col(0x0a0a0c), metalness: 0.3, roughness: 0.35 });
      for (const s of [-1, 1]) for (const [len, y, z, rot] of S.stripes) { // black racing stripes
        add(new THREE.BoxGeometry(0.15, 0.02, len), stripe, s * 0.17, y, z).rotation.x = rot;
      }
      const sp = S.spoiler;
      add(new THREE.BoxGeometry(sp.w, 0.05, 0.3), stripe, 0, sp.y, sp.z);
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.05, sp.h, 0.2), stripe, s * sp.w * 0.4, sp.y - sp.h / 2 - 0.02, sp.z);
      // rear window: a group lying on the glass, with the wiper arm pivoting from its lower edge
      const [r0, r1] = [S.cab[0], S.cab[1]];
      const du = r1[0] - r0[0], dv = r1[1] - r0[1], rl = Math.hypot(du, dv), ny = du / rl, nz = dv / rl;
      const rg = new THREE.Group();
      rg.position.set(0, (r0[1] + r1[1]) / 2 + ny * 0.02, -(r0[0] + r1[0]) / 2 + nz * 0.02);
      rg.rotation.x = -Math.asin(ny);
      const pivot = new THREE.Group(); pivot.position.y = -rl * 0.42; pivot.visible = false;
      const wiperMat = new THREE.MeshLambertMaterial({ color: col(0x9aa0a8) }); // light grey so it shows against the dark glass
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, rl * 0.8, 0.02), wiperMat); arm.position.y = rl * 0.4; pivot.add(arm);
      rg.add(pivot); tilt.add(rg);
      v.wiper = pivot; v.rearGlass = rg; v.rearLen = rl;
      v.cracks = crackMats.map((m, i) => { const c = new THREE.Mesh(new THREE.PlaneGeometry(S.cabW * 0.86, rl * 0.92), m); c.position.z = 0.004 * (i + 1); c.visible = false; rg.add(c); return c; });
      v.damage = { geo: bodyGeo, base: Float32Array.from(bodyGeo.attributes.position.array as Float32Array) };
      // nitro flames: an orange cone with a pale core, one per exhaust
      const fl = new THREE.Group(); fl.visible = false;
      const flameOuter = new THREE.MeshBasicMaterial({ color: col(0xff7a1a), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
      const flameCore = new THREE.MeshBasicMaterial({ color: col(0xbfe3ff), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
      for (const s of [-1, 1]) {
        const o = new THREE.Mesh(new THREE.ConeGeometry(0.13, 1.5, 8).rotateX(Math.PI / 2).translate(0, 0, 0.75), flameOuter); o.position.set(s * 0.42, 0.42, S.hl + 0.05);
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.9, 8).rotateX(Math.PI / 2).translate(0, 0, 0.45), flameCore); c.position.copy(o.position);
        fl.add(o, c);
      }
      tilt.add(fl); v.flames = fl;
      v.tailGlows = [];
      for (const s of [-1, 1]) {
        tilt.add(glow(sharedHeadGlow, 1.7, s * 0.6, ly, -(S.hl + 0.2)));
        const tg = glow(glowMat(0xff2a1a, 0.6), 0.95, s * 0.6, ly + 0.1, S.hl + 0.2); tilt.add(tg); v.tailGlows.push(tg);
      }
    }
    return v;
  }

  let truckGeos: Record<string, THREE.BufferGeometry> | undefined;
  function buildTruck(): Vehicle {
    const T = (truckGeos ??= {
      cab: extrudeProfile([[3.9, 0.6], [3.9, 3.3], [5.3, 3.3], [5.85, 2.35], [6.8, 2.2], [6.8, 0.6]], 0.14, 2.4, 0.04),
      trailer: new THREE.BoxGeometry(2.5, 3.1, 10.6), chassis: new THREE.BoxGeometry(1.9, 0.5, 13.4),
      side: new THREE.BoxGeometry(0.06, 0.62, 1.15), wind: new THREE.BoxGeometry(2.05, 0.95, 0.06),
      band: new THREE.BoxGeometry(2.54, 0.35, 10.62), hl: new THREE.BoxGeometry(0.4, 0.14, 0.06), tl: new THREE.BoxGeometry(0.5, 0.16, 0.06)
    });
    const root = new THREE.Group(), tilt = new THREE.Group(); root.add(tilt);
    const cabPaint = new THREE.MeshStandardMaterial({ color: col(0xe9e9ec), metalness: 0.45, roughness: 0.35 });
    const trailerPaint = new THREE.MeshStandardMaterial({ color: col(0xe9e9ec), metalness: 0.1, roughness: 0.65 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = false) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; tilt.add(m); return m;
    };
    add(T.cab, cabPaint, 0, 0, 0, true);
    add(T.chassis, DARK, 0, 0.75, 0);
    add(T.trailer, trailerPaint, 0, 2.5, 1.55, true);
    add(T.band, cabPaint, 0, 1.55, 1.55);
    add(T.wind, GLASS, 0, 2.8, -5.58).rotation.x = 0.4; // sloped windscreen
    for (const s of [-1, 1]) add(T.side, GLASS, s * 1.21, 2.75, -4.7);
    const tail = new THREE.MeshStandardMaterial({ color: col(0x3a0000), emissive: col(0xff1a10), emissiveIntensity: 1.1 });
    for (const s of [-1, 1]) { add(T.hl, HEAD, s * 0.85, 1.0, -6.83); add(T.tl, tail, s * 0.85, 1.05, 6.83); }
    const wheels: Wheel[] = [];
    for (const u of TRUCK.axles) for (const s of [-1, 1]) { // 6 wheels
      const w = makeWheel(TRUCK.r, TRUCK.w); w.position.set(s * 1.0, TRUCK.r, -u); tilt.add(w); wheels.push({ g: w, r: TRUCK.r });
    }
    return { root, tilt, wheels, paint: cabPaint, trailerPaint, tail, hw: TRUCK.hw, hl: TRUCK.hl, kind: "truck", lx: 0.85, ly: 1.0 };
  }


  // cracked glass, light to heavy
  const crackMats = [1, 2, 3].map(level => new THREE.MeshBasicMaterial({
    map: canvasTex(256, 160, (g, w, h) => {
      const hits = level === 3 ? 2 : 1;
      g.strokeStyle = "rgba(235,245,255,.9)"; g.lineWidth = 1.6; g.lineJoin = "round";
      for (let k = 0; k < hits; k++) {
        const cx = w * (0.3 + Math.random() * 0.4), cy = h * (0.3 + Math.random() * 0.4), rays = 6 + level * 3, pts: [number, number][][] = [];
        for (let r = 0; r < rays; r++) {
          const a = (r / rays) * Math.PI * 2 + Math.random() * 0.4, len = (0.25 + Math.random() * 0.45) * w * (0.5 + level * 0.25);
          const line: [number, number][] = [[cx, cy]];
          for (let sgm = 1; sgm <= 3; sgm++) line.push([cx + Math.cos(a + (Math.random() - 0.5) * 0.25) * len * sgm / 3, cy + Math.sin(a + (Math.random() - 0.5) * 0.25) * len * sgm / 3]);
          pts.push(line);
          g.beginPath(); g.moveTo(line[0][0], line[0][1]); line.slice(1).forEach(p => g.lineTo(p[0], p[1])); g.stroke();
        }
        if (level >= 2) for (let ring = 1; ring <= level + 1; ring++) { // webbing between the cracks
          g.beginPath(); pts.forEach((l, i) => (i ? g.lineTo(l[Math.min(ring, 3)][0], l[Math.min(ring, 3)][1]) : g.moveTo(l[Math.min(ring, 3)][0], l[Math.min(ring, 3)][1]))); g.closePath(); g.stroke();
        }
        if (level === 3) { g.fillStyle = "rgba(255,255,255,.16)"; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(Math.random() * w, Math.random() * h); g.lineTo(Math.random() * w, Math.random() * h); g.lineTo(Math.random() * w, Math.random() * h); g.fill(); } }
      }
    }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1
  }));

  /** Crumple the player's body around a point (in the car's own coordinates) and scuff the paint there. */
  function dentCar(v: Vehicle, lx: number, ly: number, lz: number, radius: number, depth: number) {
    const d = v.damage; if (!d) return;
    const pos = d.geo.attributes.position as THREE.BufferAttribute, colors = d.geo.attributes.color as THREE.BufferAttribute;
    const len = Math.hypot(lx, (0.6 - ly) * 0.3, lz) || 1, dx = -lx / len, dy = ((0.6 - ly) * 0.3) / len, dz = -lz / len; // push towards the car's middle
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), dist = Math.hypot(x - lx, (y - ly) * 0.8, z - lz);
      if (dist >= radius) continue;
      const f = (1 - dist / radius) ** 2, n = 0.6 + 0.4 * Math.sin(x * 37 + z * 23 + y * 11);
      pos.setXYZ(i, x + dx * depth * f * n, y + dy * depth * f * n, z + dz * depth * f * n);
      const k = 1 - 0.3 * f; // scuffed paint, never darker than about half
      colors.setXYZ(i, Math.max(0.5, colors.getX(i) * k), Math.max(0.5, colors.getY(i) * k), Math.max(0.5, colors.getZ(i) * k));
    }
    pos.needsUpdate = colors.needsUpdate = true;
    d.geo.computeVertexNormals();
  }
  function repairCar(v: Vehicle) {
    const d = v.damage; if (!d) return;
    (d.geo.attributes.position.array as Float32Array).set(d.base);
    (d.geo.attributes.color.array as Float32Array).fill(1);
    d.geo.attributes.position.needsUpdate = d.geo.attributes.color.needsUpdate = true;
    d.geo.computeVertexNormals();
    v.cracks?.forEach(c => (c.visible = false));
  }
  function setCracks(v: Vehicle, level: number) { v.cracks?.forEach((c, i) => (c.visible = level > 0 && i === Math.min(level, 3) - 1)); }

  // ---- auto-rickshaw: three wheels, open canopy ----
  const autoGeos: Record<string, THREE.BufferGeometry> = {};
  const AUTO = { hw: 0.8, hl: 1.5 };
  function buildAuto(): Vehicle {
    const root = new THREE.Group(), tilt = new THREE.Group(); root.add(tilt);
    const paint = new THREE.MeshStandardMaterial({ color: col(0x1f7a3d), metalness: 0.3, roughness: 0.5 });
    const roofPaint = new THREE.MeshStandardMaterial({ color: col(0xf2c200), metalness: 0.2, roughness: 0.55 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = false) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; tilt.add(m); return m;
    };
    autoGeos.body ??= extrudeProfile([[-1.4, 0.28], [-1.4, 0.92], [0.1, 1.0], [0.9, 0.9], [1.4, 0.62], [1.3, 0.28]], 0.12, 1.3, 0.04);
    autoGeos.roof ??= new THREE.BoxGeometry(1.5, 0.07, 1.95);
    autoGeos.post ??= new THREE.BoxGeometry(0.05, 0.78, 0.05);
    autoGeos.screen ??= new THREE.BoxGeometry(1.3, 0.62, 0.03);
    autoGeos.tarp ??= new THREE.BoxGeometry(1.3, 0.78, 0.04);
    autoGeos.head ??= new THREE.BoxGeometry(0.3, 0.14, 0.05);
    autoGeos.tl ??= new THREE.BoxGeometry(0.2, 0.12, 0.04);
    add(autoGeos.body, paint, 0, 0, 0, true);
    add(autoGeos.roof, roofPaint, 0, 1.8, 0.4, true);
    for (const x of [-0.66, 0.66]) for (const z of [-0.5, 1.3]) add(autoGeos.post, DARK, x, 1.4, z);
    add(autoGeos.screen, GLASS, 0, 1.4, -0.52).rotation.x = -0.22;
    add(autoGeos.tarp, DARK, 0, 1.38, 1.32);
    const tail = new THREE.MeshStandardMaterial({ color: col(0x3a0000), emissive: col(0xff1a10), emissiveIntensity: 1.1 });
    add(autoGeos.head, HEAD, 0, 0.8, -(AUTO.hl + 0.01));
    for (const s of [-1, 1]) add(autoGeos.tl, tail, s * 0.45, 0.72, AUTO.hl + 0.01);
    const wheels: Wheel[] = [];
    const wf = makeWheel(0.28, 0.14); wf.position.set(0, 0.28, -1.05); tilt.add(wf); wheels.push({ g: wf, r: 0.28 });
    for (const s of [-1, 1]) { const w = makeWheel(0.28, 0.16); w.position.set(s * 0.62, 0.28, 0.8); tilt.add(w); wheels.push({ g: w, r: 0.28 }); }
    return { root, tilt, wheels, paint, trailerPaint: roofPaint, tail, hw: AUTO.hw, hl: AUTO.hl, kind: "auto", lx: 0.45, ly: 0.75 };
  }

  // ---- bus: long two-tone body with a band of windows ----
  const busGeos: Record<string, THREE.BufferGeometry> = {};
  const BUS = { hw: 1.3, hl: 5.4, r: 0.52 };
  function buildBus(): Vehicle {
    const root = new THREE.Group(), tilt = new THREE.Group(); root.add(tilt);
    const paint = new THREE.MeshStandardMaterial({ color: col(0xc0392b), metalness: 0.3, roughness: 0.5 });
    const upper = new THREE.MeshStandardMaterial({ color: col(0xe9e9ec), metalness: 0.15, roughness: 0.6 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = false) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; tilt.add(m); return m;
    };
    busGeos.lower ??= new THREE.BoxGeometry(2.5, 1.45, 10.8);
    busGeos.upper ??= new THREE.BoxGeometry(2.46, 1.5, 10.7);
    busGeos.win ??= new THREE.BoxGeometry(2.52, 0.78, 9.2);
    busGeos.front ??= new THREE.BoxGeometry(2.1, 0.92, 0.05);
    busGeos.board ??= new THREE.BoxGeometry(1.5, 0.22, 0.05);
    busGeos.roof ??= new THREE.BoxGeometry(2.3, 0.14, 8.6);
    busGeos.hl ??= new THREE.BoxGeometry(0.4, 0.16, 0.06);
    busGeos.tl ??= new THREE.BoxGeometry(0.34, 0.2, 0.06);
    add(busGeos.lower, paint, 0, 1.25, 0, true);
    add(busGeos.upper, upper, 0, 2.7, 0, true);
    add(busGeos.win, GLASS, 0, 2.75, 0.2);
    add(busGeos.front, GLASS, 0, 2.78, -(BUS.hl + 0.01));
    add(busGeos.board, DARK, 0, 3.3, -(BUS.hl + 0.02));
    add(busGeos.roof, paint, 0, 3.5, 0.3);
    const tail = new THREE.MeshStandardMaterial({ color: col(0x3a0000), emissive: col(0xff1a10), emissiveIntensity: 1.1 });
    for (const s of [-1, 1]) { add(busGeos.hl, HEAD, s * 0.85, 0.95, -(BUS.hl + 0.03)); add(busGeos.tl, tail, s * 0.9, 1.0, BUS.hl + 0.03); }
    const wheels: Wheel[] = [];
    for (const s of [-1, 1]) {
      const wf = makeWheel(BUS.r, 0.34); wf.position.set(s * 1.0, BUS.r, -3.5); tilt.add(wf); wheels.push({ g: wf, r: BUS.r });
      for (const dx of [0.98, 0.58]) { const wr = makeWheel(BUS.r, 0.3); wr.position.set(s * dx, BUS.r, 3.0); tilt.add(wr); wheels.push({ g: wr, r: BUS.r }); }
    }
    return { root, tilt, wheels, paint, trailerPaint: upper, tail, hw: BUS.hw, hl: BUS.hl, kind: "bus", lx: 0.88, ly: 1.0 };
  }

  // "HORN OK PLEASE" painted on the back of trucks, as on Indian roads
  const hornTex = canvasTex(256, 80, (g, w, h) => {
    g.fillStyle = "#f2b01c"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#c0392b"; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = "#c0392b"; g.font = "bold 30px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("HORN OK PLEASE", w / 2, h / 2 + 1);
  });
  const hornMat = new THREE.MeshBasicMaterial({ map: hornTex });
  const hornGeo = new THREE.PlaneGeometry(2.1, 0.66);
  function addHornSign(v: Vehicle) {
    const m = new THREE.Mesh(hornGeo, hornMat);
    m.position.set(0, 2.7, 6.86); m.visible = false; v.tilt.add(m);
    return m;
  }

  function dispose() { wheelCache.forEach(g => { g.tire.dispose(); g.rim.dispose(); }); }
  return { buildCar, buildTruck, buildAuto, buildBus, addHornSign, dentCar, repairCar, setCracks, glow, glowMat, sharedHeadGlow, sharedTailGlow, dispose };
}
