import * as THREE from "three";
import { consolidate } from "./scenery";

// Everything that makes a point on the road a crossroads: the crossing roads, a junction box, painted lane
// arrows, a stop line, an overhead direction sign, a finish arch (at the destination) and a wall where the road ends.
// All of it is positioned relative to the junction centre, which the caller places with place().

type CanvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb?: boolean) => THREE.Texture;

export interface JunctionInfo {
  z: number; // where the junction centre is on the (straight) road
  left?: string; straight?: string; right?: string; // where each exit leads; missing = no road that way
  dest?: string; // set when this junction is the destination
}
export type Turn = "left" | "straight" | "right";

const ROAD_HALF = 8.6;
const ARM_LEN = 200;

export function createJunctionKit(canvasTex: CanvasTex, col: (h: number) => THREE.Color) {
  const group = new THREE.Group();
  group.visible = false;
  const geos: THREE.BufferGeometry[] = [], mats: THREE.Material[] = [];
  const geo = <T extends THREE.BufferGeometry>(g: T) => (geos.push(g), g);
  const mat = <T extends THREE.Material>(m: T) => (mats.push(m), m);
  const noCull = (o: THREE.Object3D) => o.traverse(c => { c.frustumCulled = false; });

  /* ---- crossing roads: they share the main road's material so rain, wetness and bending match ---- */
  const armGeo = geo(new THREE.PlaneGeometry(ROAD_HALF * 2, ARM_LEN, 1, 50).rotateX(-Math.PI / 2).translate(0, 0, -ARM_LEN / 2));
  { const uv = armGeo.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (ARM_LEN / 40)); } // repeat the 40 m texture along the road
  const railMat = mat(new THREE.MeshStandardMaterial({ color: col(0xb4bcc4), metalness: 0.75, roughness: 0.38 }));
  const arms = [1, -1].map(side => {
    const g = new THREE.Group();
    const road = new THREE.Mesh(armGeo, new THREE.MeshBasicMaterial()); road.receiveShadow = true; g.add(road); // material swapped in by setRoadMaterial
    const rails = new THREE.Group();
    for (const x of [-8.2, 8.2]) {
      const beam = new THREE.Mesh(geo(new THREE.BoxGeometry(0.09, 0.3, ARM_LEN)), railMat); beam.position.set(x, 0.66, -ARM_LEN / 2); rails.add(beam);
      const low = new THREE.Mesh(geo(new THREE.BoxGeometry(0.07, 0.12, ARM_LEN)), railMat); low.position.set(x, 0.4, -ARM_LEN / 2); rails.add(low);
    }
    g.add(consolidate(rails, false));
    g.position.set(-side * ROAD_HALF, 0, 0); // starts at the edge of the main road...
    g.rotation.y = side * (Math.PI / 2); // ...and runs away from it: +1 = left arm (towards -x), -1 = right arm
    group.add(g);
    return { g, road };
  });
  function setRoadMaterial(m: THREE.Material) { arms.forEach(a => { (a.road as THREE.Mesh).material = m; }); }

  /* ---- junction box: plain asphalt where the roads cross, with the main road's dashes painted out ---- */
  const asphalt = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = "#3a3d43"; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 24; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(img, 0, 0);
  });
  const boxMat = mat(new THREE.MeshLambertMaterial({ map: asphalt, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  const box = new THREE.Mesh(geo(new THREE.PlaneGeometry(ROAD_HALF * 2, ROAD_HALF * 2, 1, 4).rotateX(-Math.PI / 2)), boxMat);
  box.position.y = 0.014; box.receiveShadow = true; group.add(box);
  const markMat = mat(new THREE.MeshBasicMaterial({ color: col(0xf0f0e8), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const stop = new THREE.Mesh(geo(new THREE.PlaneGeometry(14.4, 0.5).rotateX(-Math.PI / 2)), markMat); stop.position.set(0, 0.02, ROAD_HALF + 1.4); group.add(stop);

  /* ---- lane arrows painted before the junction ---- */
  const arrowTex = (kind: Turn) => canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = "#f2f2ea"; g.strokeStyle = "#f2f2ea"; g.lineJoin = "round";
    if (kind === "straight") {
      g.fillRect(52, 90, 24, 150); g.beginPath(); g.moveTo(64, 14); g.lineTo(106, 100); g.lineTo(22, 100); g.closePath(); g.fill();
    } else { // a stem that bends 90 degrees, ending in a head (drawn for a left turn and mirrored for a right turn)
      g.save();
      if (kind === "right") { g.translate(w, 0); g.scale(-1, 1); }
      g.fillRect(78, 118, 24, 122); g.fillRect(40, 118, 62, 24);
      g.beginPath(); g.moveTo(46, 92); g.lineTo(46, 168); g.lineTo(8, 130); g.closePath(); g.fill();
      g.restore();
    }
  });
  const arrowMats: Record<Turn, THREE.Material> = {
    left: mat(new THREE.MeshBasicMaterial({ map: arrowTex("left"), transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
    straight: mat(new THREE.MeshBasicMaterial({ map: arrowTex("straight"), transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
    right: mat(new THREE.MeshBasicMaterial({ map: arrowTex("right"), transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))
  };
  const arrowGeo = geo(new THREE.PlaneGeometry(2.6, 5.2).rotateX(-Math.PI / 2));
  const arrows = [-5.4, -1.8, 1.8, 5.4].map(x => { const m = new THREE.Mesh(arrowGeo, arrowMats.straight); m.position.set(x, 0.022, 38); group.add(m); return m; });

  /* ---- overhead direction sign ---- */
  const signCanvas = document.createElement("canvas"); signCanvas.width = 1024; signCanvas.height = 240;
  const signTex = new THREE.CanvasTexture(signCanvas); signTex.encoding = THREE.sRGBEncoding; signTex.anisotropy = 4;
  const signMat = mat(new THREE.MeshBasicMaterial({ map: signTex }));
  const postGeo = geo(new THREE.CylinderGeometry(0.22, 0.26, 8, 8)), beamGeo = geo(new THREE.BoxGeometry(21.4, 0.4, 0.4));
  const poleMat = mat(new THREE.MeshStandardMaterial({ color: col(0x5d646c), metalness: 0.6, roughness: 0.5 }));
  const gantry = new THREE.Group();
  for (const x of [-10.2, 10.2]) { const p = new THREE.Mesh(postGeo, poleMat); p.position.set(x, 4, 0); gantry.add(p); }
  const beam = new THREE.Mesh(beamGeo, poleMat); beam.position.set(0, 7.6, 0); gantry.add(beam);
  const board = new THREE.Mesh(geo(new THREE.PlaneGeometry(15, 3.5)), signMat); board.position.set(0, 5.9, 0.25); gantry.add(board);
  const back = new THREE.Mesh(geo(new THREE.PlaneGeometry(15, 3.5)), mat(new THREE.MeshBasicMaterial({ color: col(0x2c3138) }))); back.position.set(0, 5.9, 0.2); back.rotation.y = Math.PI; gantry.add(back);
  gantry.position.z = 110; group.add(gantry);

  /* ---- finish arch ---- */
  const bannerCanvas = document.createElement("canvas"); bannerCanvas.width = 1024; bannerCanvas.height = 160;
  const bannerTex = new THREE.CanvasTexture(bannerCanvas); bannerTex.encoding = THREE.sRGBEncoding; bannerTex.anisotropy = 4;
  const arch = new THREE.Group();
  for (const x of [-10.2, 10.2]) { const p = new THREE.Mesh(postGeo, poleMat); p.position.set(x, 4, 0); arch.add(p); }
  const archBeam = new THREE.Mesh(beamGeo, poleMat); archBeam.position.set(0, 8.2, 0); arch.add(archBeam);
  const banner = new THREE.Mesh(geo(new THREE.PlaneGeometry(20.4, 3.2)), mat(new THREE.MeshBasicMaterial({ map: bannerTex }))); banner.position.set(0, 6.4, 0.25); arch.add(banner);
  const checker = canvasTex(64, 8, g => { for (let i = 0; i < 8; i++) for (let j = 0; j < 1; j++) { g.fillStyle = i % 2 ? "#111" : "#fff"; g.fillRect(i * 8, 0, 8, 8); } });
  checker.wrapS = THREE.RepeatWrapping; checker.repeat.set(2, 1);
  const finishLine = new THREE.Mesh(geo(new THREE.PlaneGeometry(ROAD_HALF * 2, 1.6).rotateX(-Math.PI / 2)), mat(new THREE.MeshBasicMaterial({ map: checker, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })));
  finishLine.position.set(0, 0.026, 0);
  arch.add(finishLine); arch.visible = false; group.add(arch);

  /* ---- wall where the road ends ---- */
  const wallTex = canvasTex(512, 160, (g, w, h) => {
    g.fillStyle = "#8d9299"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#6e747b"; for (let y = 0; y < h - 60; y += 28) g.fillRect(0, y, w, 2);
    g.save(); g.beginPath(); g.rect(0, h - 56, w, 56); g.clip();
    g.fillStyle = "#f2c200"; g.fillRect(0, h - 56, w, 56);
    g.fillStyle = "#1a1a1a"; for (let x = -60; x < w + 60; x += 56) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 28, h); g.lineTo(x + 56, h - 56); g.lineTo(x + 28, h - 56); g.closePath(); g.fill(); }
    g.restore();
  });
  const wall = new THREE.Mesh(geo(new THREE.BoxGeometry(46, 10, 3)), mat(new THREE.MeshLambertMaterial({ map: wallTex })));
  wall.position.set(0, 5, -(ROAD_HALF + 2.5)); wall.castShadow = true; wall.visible = false; group.add(wall);

  noCull(group);

  /* ---- drawing the signs ---- */
  function drawArrow(g: CanvasRenderingContext2D, cx: number, cy: number, turn: Turn) {
    g.save(); g.translate(cx, cy); g.rotate(turn === "left" ? -Math.PI / 2 : turn === "right" ? Math.PI / 2 : 0); g.fillStyle = "#fff";
    g.fillRect(-9, -4, 18, 46); g.beginPath(); g.moveTo(0, -46); g.lineTo(30, -2); g.lineTo(-30, -2); g.closePath(); g.fill(); g.restore();
  }
  function drawSign(info: JunctionInfo) {
    const g = signCanvas.getContext("2d")!, w = signCanvas.width, h = signCanvas.height;
    g.fillStyle = "#0c6b3c"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#fff"; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    const items = ([["left", info.left], ["straight", info.straight], ["right", info.right]] as [Turn, string | undefined][]).filter(([, n]) => n);
    const colW = (w - 60) / Math.max(1, items.length);
    items.forEach(([turn, name], i) => {
      const cx = 30 + colW * (i + 0.5);
      drawArrow(g, cx, 100, turn);
      g.fillStyle = "#fff"; g.font = "bold 52px Arial, Helvetica, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText((name as string).toUpperCase(), cx, 182, colW - 24);
    });
    signTex.needsUpdate = true;
  }
  function drawBanner(name: string) {
    const g = bannerCanvas.getContext("2d")!, w = bannerCanvas.width, h = bannerCanvas.height;
    g.fillStyle = "#111"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? "#111" : "#fff"; g.fillRect(i * 32, j * 20 + (j ? h - 40 : 0), 32, 20); }
    g.fillStyle = "#c6f432"; g.font = "bold 84px Arial, Helvetica, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("FINISH · " + name.toUpperCase(), w / 2, h / 2 + 2, w - 60);
    bannerTex.needsUpdate = true;
  }

  /** Move the kit to a junction and set up its roads, arrows, signs and wall. */
  function place(info: JunctionInfo) {
    group.position.z = info.z;
    arms[0].g.visible = !!info.left; arms[1].g.visible = !!info.right;
    wall.visible = !info.straight && !info.dest;
    // lane arrows: left lane turns left if it can, right lane turns right, the middle lanes carry on; at a T-junction the lanes split
    const t: Turn[] = info.straight
      ? [info.left ? "left" : "straight", "straight", "straight", info.right ? "right" : "straight"]
      : info.left && info.right ? ["left", "left", "right", "right"] : info.left ? ["left", "left", "left", "left"] : ["right", "right", "right", "right"];
    arrows.forEach((a, i) => { a.material = arrowMats[t[i]]; });
    drawSign(info);
    gantry.visible = !!(info.left || info.straight || info.right);
    arch.visible = !!info.dest;
    if (info.dest) drawBanner(info.dest);
    group.visible = true;
  }
  function hide() { group.visible = false; }
  function dispose() { geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); signTex.dispose(); bannerTex.dispose(); }
  return { group, place, hide, setRoadMaterial, dispose };
}
export type JunctionKit = ReturnType<typeof createJunctionKit>;
