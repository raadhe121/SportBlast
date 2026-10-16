import * as THREE from "three";
import type { Place, SceneryKind } from "./places";

// Roadside scenery for each location, built from simple shapes.

type CanvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb?: boolean) => THREE.Texture;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Merge every mesh under a group that shares a material into one mesh, so an item costs one draw call per material
 * instead of one per part. Parts must be plain meshes with one material each (instanced meshes are left alone).
 */
export function consolidate(src: THREE.Object3D, castShadow = true): THREE.Group {
  src.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const keep: THREE.Object3D[] = [];
  src.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material)) { if ((o as THREE.InstancedMesh).isInstancedMesh) keep.push(o); return; }
    const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone());
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const list = byMat.get(m.material) ?? []; list.push(geo); byMat.set(m.material, list);
  });
  const out = new THREE.Group();
  out.userData = { ...src.userData };
  for (const [mat, list] of byMat) {
    const merged = mergeGeometries(list); list.forEach(x => x.dispose());
    const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = castShadow; mesh.receiveShadow = false; out.add(mesh);
  }
  for (const k of keep) out.add(k);
  return out;
}
function mergeGeometries(list: THREE.BufferGeometry[]) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array as Float32Array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array as Float32Array, o * 2);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3)); out.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return out;
}

export function createScenery(canvasTex: CanvasTex, col: (h: number) => THREE.Color) {
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const g = <T extends THREE.BufferGeometry>(x: T) => (geos.push(x), x);
  const lambert = (c: number) => { const m = new THREE.MeshLambertMaterial({ color: col(c) }); mats.push(m); return m; };
  const phong = (c: number) => { const m = new THREE.MeshPhongMaterial({ color: col(c), flatShading: true, specular: 0x000000, shininess: 0 }); mats.push(m); return m; };

  /* ---- forests, palms, alpine trees ---- */
  const trunkMat = lambert(0x5b4030), palmTrunk = lambert(0x8a6a4a);
  const pineMats = [0x2c5a34, 0x25502e, 0x356b3c].map(phong);
  const alpineMats = [0x1f4a3a, 0x1b4234, 0x275545].map(phong);
  const roundMats = [0x4d8a3c, 0x5a9a43, 0x3f7a35, 0x6aa04a].map(phong);
  const banyanMats = [0x5f8a2f, 0x4f7a28, 0x6e9a38].map(phong);
  const frondMat = phong(0x4f8a35);
  const trunkGeo = g(new THREE.CylinderGeometry(0.16, 0.26, 1.7, 6));
  const coneGeos = [g(new THREE.ConeGeometry(1.7, 2.3, 7)), g(new THREE.ConeGeometry(1.35, 2.1, 7)), g(new THREE.ConeGeometry(0.95, 1.9, 7))];
  const blobGeo = g(new THREE.IcosahedronGeometry(1.7, 1));
  const frondGeo = g(new THREE.BoxGeometry(0.55, 0.05, 3.4).translate(0, 0, 1.7));
  const palmGeo = g(new THREE.CylinderGeometry(0.16, 0.3, 1, 6).translate(0, 0.5, 0));

  function pine(mset: THREE.Material[], scale: number) {
    const grp = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.y = 0.85; grp.add(trunk);
    const m = pick(mset);
    ([[1.9, 0], [3.5, 1], [4.9, 2]] as const).forEach(([y, k]) => { const c = new THREE.Mesh(coneGeos[k], m); c.position.y = y + 0.4; c.castShadow = true; grp.add(c); });
    grp.scale.setScalar(scale);
    return grp;
  }
  function roundTree(mset: THREE.Material[], scale: number) {
    const grp = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.y = 0.85; grp.add(trunk);
    const b = new THREE.Mesh(blobGeo, pick(mset)); b.position.y = 3.3; b.scale.set(1, rnd(1, 1.25), 1); b.rotation.y = rnd(0, 6); b.castShadow = true; grp.add(b);
    grp.scale.setScalar(scale);
    return grp;
  }
  function palm() {
    const grp = new THREE.Group(), h = rnd(6, 9.5);
    const trunk = new THREE.Mesh(palmGeo, palmTrunk); trunk.scale.set(1, h, 1); trunk.rotation.z = rnd(-0.1, 0.1); grp.add(trunk);
    const crown = new THREE.Group(); crown.position.set(Math.sin(trunk.rotation.z) * -h, h, 0);
    for (let i = 0; i < 9; i++) {
      const pivot = new THREE.Group(); pivot.rotation.y = (i / 9) * Math.PI * 2 + rnd(-0.2, 0.2);
      const f = new THREE.Mesh(frondGeo, frondMat); f.rotation.x = rnd(0.35, 0.8); f.castShadow = true; pivot.add(f); crown.add(pivot);
    }
    grp.add(crown);
    return grp;
  }

  /* ---- roadside signs and shops (India) ---- */
  const adTex = [["SALE", "#e63946", "#ffe66d"], ["HOTEL", "#1d3557", "#f1faee"], ["MILK", "#2a9d8f", "#ffffff"], ["TYRES", "#f4a261", "#1b1b1b"]].map(([t, bg, fg]) =>
    canvasTex(256, 128, (c, w, h) => {
      c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg; c.fillRect(8, 8, w - 16, 6); c.fillRect(8, h - 14, w - 16, 6);
      c.font = "bold 58px Arial, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(t, w / 2, h / 2);
    }));
  const adMats = adTex.map(t => { const m = new THREE.MeshBasicMaterial({ map: t }); mats.push(m); return m; });
  const postGeo = g(new THREE.CylinderGeometry(0.12, 0.12, 6, 6));
  const boardGeo = g(new THREE.PlaneGeometry(7, 3.5));
  const metal = lambert(0x555b62);
  function hoarding() {
    const grp = new THREE.Group();
    for (const x of [-2.4, 2.4]) { const p = new THREE.Mesh(postGeo, metal); p.position.set(x, 3, 0); grp.add(p); }
    const b = new THREE.Mesh(boardGeo, pick(adMats)); b.position.y = 6.5; grp.add(b);
    grp.userData.faceRoad = true;
    return grp;
  }
  const shopBody = g(new THREE.BoxGeometry(5, 3, 5.5)), shopRoof = g(new THREE.CylinderGeometry(3.9, 3.9, 5.9, 3).rotateZ(Math.PI / 2).rotateX(0));
  const shopColors = [0xe76f51, 0x2a9d8f, 0xf4a261, 0x6a8caf, 0xe9c46a].map(lambert);
  function shop() {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(shopBody, pick(shopColors)); body.position.y = 1.5; body.castShadow = true; grp.add(body);
    const roof = new THREE.Mesh(shopRoof, metal); roof.rotation.y = Math.PI / 2; roof.scale.set(1, 0.38, 1); roof.position.y = 3.4; grp.add(roof);
    const sign = new THREE.Mesh(g(new THREE.PlaneGeometry(4, 1)), pick(adMats)); sign.position.set(0, 2.5, 2.8); grp.add(sign);
    grp.userData.faceRoad = true;
    return grp;
  }

  /* ---- boulders, cacti ---- */
  const rockMats = [0x7a8088, 0x6b7178, 0x8a9096].map(phong);
  const sandRocks = [0xb98d5a, 0xa87f50, 0xc99c68].map(phong);
  const rockGeo = g(new THREE.IcosahedronGeometry(1, 0));
  function boulders(mset: THREE.Material[], big: number) {
    const grp = new THREE.Group();
    for (let i = 0, n = 1 + Math.floor(Math.random() * 3); i < n; i++) {
      const r = new THREE.Mesh(rockGeo, pick(mset));
      r.scale.set(rnd(1, 2.6) * big, rnd(0.8, 2) * big, rnd(1, 2.6) * big);
      r.position.set(rnd(-2.5, 2.5), r.scale.y * 0.5, rnd(-2.5, 2.5)); r.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3)); r.castShadow = true; grp.add(r);
    }
    return grp;
  }
  const cactusMat = lambert(0x5a8a45);
  const cactusTrunk = g(new THREE.CylinderGeometry(0.34, 0.4, 1, 8).translate(0, 0.5, 0));
  const cactusArm = g(new THREE.CylinderGeometry(0.22, 0.22, 1, 8));
  const cactusCap = g(new THREE.SphereGeometry(0.34, 8, 6));
  function cactus() {
    const grp = new THREE.Group(), h = rnd(3.2, 5.5);
    const t = new THREE.Mesh(cactusTrunk, cactusMat); t.scale.set(1, h, 1); t.castShadow = true; grp.add(t);
    const cap = new THREE.Mesh(cactusCap, cactusMat); cap.position.y = h; grp.add(cap);
    for (const s of Math.random() < 0.5 ? [-1] : [-1, 1]) {
      const y = rnd(1.4, h * 0.6), len = rnd(0.8, 1.3), up = rnd(1, 1.8);
      const a = new THREE.Mesh(cactusArm, cactusMat); a.rotation.z = Math.PI / 2; a.scale.set(1, len, 1); a.position.set(s * (0.3 + len / 2), y, 0); grp.add(a);
      const v = new THREE.Mesh(cactusArm, cactusMat); v.scale.set(1, up, 1); v.position.set(s * (0.3 + len), y + up / 2, 0); v.castShadow = true; grp.add(v);
    }
    return grp;
  }
  const bushMat = new THREE.MeshBasicMaterial({ color: col(0x8a6a3a), wireframe: true }); mats.push(bushMat);
  const bushGeo = g(new THREE.IcosahedronGeometry(0.8, 0));
  function bush() { const m = new THREE.Mesh(bushGeo, bushMat); m.position.y = 0.6; const grp = new THREE.Group(); grp.add(m); return grp; }

  /* ---- city buildings ---- */
  const winTex = (tint: string, lit: boolean) => {
    const t = canvasTex(64, 64, (c, w, h) => {
      c.fillStyle = lit ? "#000" : "#2a3340"; c.fillRect(0, 0, w, h);
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        const on = Math.random() < 0.4;
        c.fillStyle = lit ? (on ? tint : "#000") : on ? "#7d93ab" : "#3d4d60";
        c.fillRect(x * 32 + 6, y * 32 + 6, 20, 20);
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const bMats = [["#ffd89a", "#aab4c0"], ["#cfe6ff", "#c8b9a6"], ["#ffe9b8", "#9aa3ad"]].map(([tint, wall]) => {
    const m = new THREE.MeshStandardMaterial({ map: winTex(tint, false), emissiveMap: winTex(tint, true), emissive: col(0xffffff), emissiveIntensity: 0, roughness: 0.8, metalness: 0.1 });
    mats.push(m); m.userData.wall = wall; return m;
  });
  const WIN = 3.4; // window pitch in metres
  function building() {
    const w = rnd(9, 17), d = rnd(9, 15), h = rnd(14, 62);
    const geo = new THREE.BoxGeometry(w, h, d); geos.push(geo);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let face = 0; face < 6; face++) { // scale window texture so windows keep their size
      const su = face < 2 ? d / WIN : w / WIN, sv = h / WIN;
      if (face === 2 || face === 3) continue;
      for (let i = face * 4; i < face * 4 + 4; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
    const m = new THREE.Mesh(geo, pick(bMats));
    m.position.y = h / 2; m.castShadow = true;
    const grp = new THREE.Group(); grp.add(m);
    return grp;
  }

  function make(kind: SceneryKind): THREE.Group {
    const r = Math.random();
    let item: THREE.Group;
    switch (kind) {
      case "palms": item = r < 0.42 ? palm() : r < 0.78 ? roundTree(banyanMats, rnd(1.1, 1.8)) : r < 0.9 ? hoarding() : shop(); break;
      case "alpine": item = r < 0.72 ? pine(alpineMats, rnd(1.1, 2.2)) : boulders(rockMats, 1.4); break;
      case "desert": item = r < 0.55 ? cactus() : r < 0.85 ? boulders(sandRocks, 1.2) : bush(); break;
      case "city": item = building(); break;
      default: item = r < 0.55 ? pine(pineMats, rnd(0.85, 1.6)) : roundTree(roundMats, rnd(0.85, 1.6));
    }
    return consolidate(item, kind !== "desert" || r < 0.85); // the tumbleweed casts no shadow
  }

  /* ---- distant hills, with colour that gets lighter towards the top (and snow caps) ---- */
  const hillMat = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, specular: 0x000000, shininess: 0 }); mats.push(hillMat);
  const white = col(0xf2f6fa);
  function makeHill(place: Place) {
    const geo = new THREE.IcosahedronGeometry(1, 1); geos.push(geo);
    const pos = geo.attributes.position as THREE.BufferAttribute, colors = new Float32Array(pos.count * 3);
    const base = col(pick(place.hillColors)), hi = base.clone().lerp(white, 0.3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      c.copy(base).lerp(hi, clamp01((y + 0.2) / 1.2));
      if (place.snow && y > 0.5) c.copy(white);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return new THREE.Mesh(geo, hillMat);
  }

  /* ---- ground ---- */
  const groundCache = new Map<string, THREE.Texture>();
  function groundTexture(place: Place) {
    let t = groundCache.get(place.id);
    if (!t) {
      t = canvasTex(256, 256, (c, w, h) => {
        c.fillStyle = place.ground; c.fillRect(0, 0, w, h);
        const base = new THREE.Color(place.ground);
        for (let i = 0; i < 2600; i++) {
          const l = rnd(-0.07, 0.07);
          c.fillStyle = `rgb(${clamp01(base.r + l) * 255 | 0},${clamp01(base.g + l * 1.2) * 255 | 0},${clamp01(base.b + l * 0.6) * 255 | 0})`;
          c.fillRect(Math.random() * w, Math.random() * h, rnd(1, 3), rnd(1, 5));
        }
        if (place.id === "city") { c.strokeStyle = "rgba(0,0,0,.18)"; c.lineWidth = 2; for (let k = 0; k <= w; k += 128) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k, h); c.moveTo(0, k); c.lineTo(w, k); c.stroke(); } }
        if (place.id === "desert") { c.strokeStyle = "rgba(150,100,50,.14)"; c.lineWidth = 3; for (let k = 10; k < h; k += 26) { c.beginPath(); c.moveTo(0, k); c.bezierCurveTo(w * 0.3, k - 8, w * 0.6, k + 8, w, k); c.stroke(); } }
        const img = c.getImageData(0, 0, w, h), d = img.data;
        for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
        c.putImageData(img, 0, 0);
      });
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(200, 200);
      groundCache.set(place.id, t);
    }
    return t;
  }

  /** Lit windows glow at night. */
  function setNight(on: boolean) { for (const m of bMats) m.emissiveIntensity = on ? 1.1 : 0; }
  function dispose() { geos.forEach(x => x.dispose()); mats.forEach(x => x.dispose()); }
  return { make, makeHill, groundTexture, setNight, dispose };
}
