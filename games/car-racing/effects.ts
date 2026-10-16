import * as THREE from "three";

// Visual effects: tyre smoke and sparks (sprite particles), skid marks on the road, and a radial motion blur.

interface Particle {
  s: THREE.Sprite; life: number; max: number;
  vx: number; vy: number; vz: number; s0: number; s1: number; a0: number;
}

/** A fixed pool of sprites that are recycled as particles die. */
export class SpritePool {
  group = new THREE.Group();
  private items: Particle[] = [];
  private next = 0;
  constructor(map: THREE.Texture, count: number, blending: THREE.Blending, color: number, private gravity = 0) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map, color, blending, depthWrite: false, transparent: true, opacity: 0, fog: false });
      const s = new THREE.Sprite(mat); s.visible = false; this.group.add(s);
      this.items.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 1, s1: 1, a0: 1 });
    }
  }
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, alpha: number) {
    const p = this.items[this.next++ % this.items.length];
    p.life = p.max = life; p.vx = vx; p.vy = vy; p.vz = vz; p.s0 = s0; p.s1 = s1; p.a0 = alpha;
    p.s.position.set(x, y, z); p.s.visible = true;
  }
  update(dt: number) {
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const t = 1 - p.life / p.max;
      p.vy -= this.gravity * dt;
      p.s.position.x += p.vx * dt; p.s.position.y = Math.max(0.02, p.s.position.y + p.vy * dt); p.s.position.z += p.vz * dt;
      const sz = p.s0 + (p.s1 - p.s0) * t;
      p.s.scale.set(sz, sz, 1);
      p.s.material.opacity = p.a0 * (1 - t) * (1 - t * 0.4);
    }
  }
  clear() { for (const p of this.items) { p.life = 0; p.s.visible = false; } }
  dispose() { for (const p of this.items) p.s.material.dispose(); }
}

/** Dark strips laid on the road behind skidding wheels. They stay where they were drawn, so the car drives away from them. */
export class SkidMarks {
  readonly mesh: THREE.InstancedMesh;
  private i = 0;
  private dummy = new THREE.Object3D();
  constructor(private count = 260) {
    const geo = new THREE.PlaneGeometry(0.24, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    this.clear();
  }
  add(x: number, z: number, yaw: number, len = 1.4) {
    this.dummy.position.set(x, 0.04, z); this.dummy.rotation.set(0, yaw, 0); this.dummy.scale.set(1, 1, len); this.dummy.updateMatrix();
    this.mesh.setMatrixAt(this.i, this.dummy.matrix);
    this.i = (this.i + 1) % this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() {
    this.dummy.position.set(0, -50, 0); this.dummy.scale.set(0, 0, 0); this.dummy.updateMatrix();
    for (let k = 0; k < this.count; k++) this.mesh.setMatrixAt(k, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}

/**
 * Radial motion blur. The scene is drawn into a texture, then redrawn to the screen with each pixel
 * smeared towards the centre. Used only while going fast; otherwise the scene is drawn straight to the screen.
 * If this device cannot render to a texture, `supported` is false and the caller falls back to speed lines.
 */
export class MotionBlur {
  supported = false;
  private rt?: THREE.WebGLRenderTarget;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat?: THREE.ShaderMaterial;
  private quad?: THREE.Mesh;

  constructor(private renderer: THREE.WebGLRenderer, w: number, h: number) {
    try {
      if (!renderer.capabilities.isWebGL2) return;
      const float = renderer.extensions.has("EXT_color_buffer_float");
      this.rt = new THREE.WebGLMultisampleRenderTarget(w, h, {
        type: float ? THREE.HalfFloatType : THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter
      });
      this.mat = new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: this.rt.texture }, uStrength: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.46) } },
        vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }",
        fragmentShader: `
          uniform sampler2D tDiffuse; uniform float uStrength; uniform vec2 uCenter; varying vec2 vUv;
          void main() {
            vec2 dir = vUv - uCenter;
            float k = uStrength * (0.25 + length( dir ) * 1.6);
            vec3 sum = vec3( 0.0 ); float tot = 0.0;
            for ( int i = 0; i < 10; i ++ ) {
              float t = float( i ) / 9.0, w = 1.0 - t * 0.55;
              sum += texture2D( tDiffuse, vUv - dir * k * t ).rgb * w; tot += w;
            }
            gl_FragColor = vec4( sum / tot, 1.0 );
            #include <encodings_fragment>
          }`,
        depthTest: false, depthWrite: false
      });
      this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
      this.quad.frustumCulled = false;
      this.quadScene.add(this.quad);
      this.supported = true;
    } catch {
      this.supported = false;
    }
  }
  setSize(w: number, h: number) { this.rt?.setSize(w, h); }
  /** strength 0 draws normally; above that, draws through the blur. */
  render(scene: THREE.Scene, camera: THREE.Camera, strength: number) {
    const r = this.renderer;
    if (!this.supported || strength < 0.004 || !this.rt || !this.mat) { r.render(scene, camera); return; }
    this.mat.uniforms.uStrength.value = strength;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }
  dispose() { this.rt?.dispose(); this.mat?.dispose(); this.quad?.geometry.dispose(); }
}
