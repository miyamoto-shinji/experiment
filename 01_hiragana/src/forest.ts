import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export class Forest {
  readonly element = document.createElement('div');
  private renderer: THREE.WebGLRenderer;
  private world = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-6, 6, 5, -5, 0.1, 80);
  private bear = new THREE.Group();
  private arm = new THREE.Group();
  private rabbit = new THREE.Group();
  private tiles = new THREE.Group();
  private flowers: THREE.Group[] = [];
  private materials = new Map<string, THREE.MeshLambertMaterial>();
  private sphere = new THREE.SphereGeometry(1, 20, 12);
  private celebration = -10;
  private reduced = false;
  private visible = true;
  private lastFrame = 0;
  private frame = 0;
  private observer: ResizeObserver;
  private intersection: IntersectionObserver;
  private disposed = false;
  private still = false;
  private needsRender = true;
  private slowFrames = 0;
  private celebrationTimer?: number;

  constructor(private onFailure: () => void) {
    this.element.className = 'forest-canvas';
    this.element.setAttribute('aria-hidden', 'true');
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.element.append(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.dispose(); this.onFailure();
    });
    this.camera.position.set(6.3, 6.3, 11);
    this.camera.lookAt(0, 1.45, 0);
    this.world.add(new THREE.HemisphereLight('#fffce8', '#a0ac79', 3));
    const sun = new THREE.DirectionalLight('#fff0d9', 4.1);
    sun.position.set(-4, 10, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 25 });
    sun.shadow.normalBias = 0.035;
    sun.shadow.bias = -0.0005;
    this.world.add(sun);
    this.build();
    // Bake fixed shapes together; keep the bear's arm and reward flowers movable.
    this.world.updateMatrixWorld(true);
    this.batch(this.world, new Set([this.bear, this.rabbit, this.tiles, ...this.flowers]));
    this.batch(this.bear, new Set([this.arm]));
    this.batch(this.arm);
    this.batch(this.rabbit);
    this.flowers.forEach(flower => this.batch(flower));
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.element);
    this.intersection = new IntersectionObserver(entries => { this.visible = entries[0]?.isIntersecting ?? true; });
    this.intersection.observe(this.element);
    this.animate(0);
  }

  private material(color: string) {
    if (!this.materials.has(color)) this.materials.set(color, new THREE.MeshLambertMaterial({ color }));
    return this.materials.get(color)!;
  }
  private batch(root: THREE.Object3D, skip = new Set<THREE.Object3D>()) {
    const pieces: THREE.BufferGeometry[] = [];
    const sources: THREE.Mesh[] = [];
    const inverse = root.matrixWorld.clone().invert();
    const visit = (object: THREE.Object3D) => {
      if (skip.has(object)) return;
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshLambertMaterial) {
        const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
        geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
        const count = geometry.getAttribute('position').count;
        const colors = new Float32Array(count * 3);
        const { r, g, b } = object.material.color;
        for (let i = 0; i < count; i++) { colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b; }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        pieces.push(geometry); sources.push(object);
      }
      object.children.forEach(visit);
    };
    root.children.forEach(visit);
    if (!pieces.length) return;
    const merged = mergeGeometries(pieces);
    pieces.forEach(piece => piece.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    sources.forEach(source => source.removeFromParent()); root.add(mesh);
  }
  private ball(parent: THREE.Object3D, color: string, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) {
    const mesh = new THREE.Mesh(this.sphere, this.material(color));
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  private mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(geometry, this.material(color));
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  private flower(x: number, z: number, color: string, scale = 1) {
    const flower = new THREE.Group(); flower.position.set(x, 0.25, z); flower.scale.setScalar(scale);
    this.mesh(flower, new THREE.CylinderGeometry(0.025, 0.03, 0.48, 6), '#659053', 0, 0.2, 0);
    this.ball(flower, '#88a965', 0.1, 0.2, 0, 0.16, 0.06, 0.08).rotation.z = 0.4;
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      this.ball(flower, color, Math.sin(angle) * 0.13, 0.49 + Math.cos(angle) * 0.13, 0, 0.12, 0.12, 0.065);
    }
    this.ball(flower, '#f7ca66', 0, 0.49, 0.065, 0.085);
    flower.rotation.y = 0.4; this.world.add(flower); return flower;
  }
  private tree(x: number, z: number, height: number, color: string, pine = false) {
    const tree = new THREE.Group(); tree.position.set(x, 0.2, z);
    this.mesh(tree, new THREE.CylinderGeometry(0.13, 0.19, height * 0.75, 9), '#a08964', 0, height * 0.34, 0);
    if (pine) {
      for (let i = 0; i < 3; i++) this.mesh(tree, new THREE.ConeGeometry(height * (0.34 - i * 0.075), height * 0.53, 7), color, 0, height * (0.42 + i * 0.22), 0);
    } else {
      this.mesh(tree, new THREE.IcosahedronGeometry(height * 0.44, 2), color, 0, height * 0.75, 0).scale.set(0.9, 1.12, 0.85);
      this.ball(tree, color, -height * 0.18, height * 0.65, height * 0.06, height * 0.31);
    }
    this.world.add(tree);
  }
  private makeBear() {
    const b = this.bear;
    this.ball(b, '#ba8353', 0, 0.86, 0, 0.64, 0.8, 0.46);
    this.ball(b, '#e9c69a', 0, 0.78, 0.38, 0.4, 0.48, 0.15);
    this.ball(b, '#b78154', -0.34, 0.25, 0.13, 0.27, 0.3, 0.37);
    this.ball(b, '#b78154', 0.34, 0.25, 0.13, 0.27, 0.3, 0.37);
    this.ball(b, '#c89461', 0, 1.82, 0, 0.8, 0.7, 0.61);
    for (const x of [-0.58, 0.58]) {
      this.ball(b, '#b98255', x, 2.3, -0.02, 0.29);
      this.ball(b, '#e6b78e', x, 2.32, 0.2, 0.17, 0.17, 0.055);
      this.ball(b, '#e8ac8d', x * 0.72, 1.72, 0.51, 0.135, 0.08, 0.055);
    }
    this.ball(b, '#f0d5ae', 0, 1.61, 0.54, 0.34, 0.23, 0.15);
    this.ball(b, '#503e31', 0, 1.72, 0.694, 0.102, 0.073, 0.058);
    for (const x of [-0.25, 0.25]) {
      this.ball(b, '#3c372b', x, 1.92, 0.559, 0.047, 0.06, 0.028);
      this.ball(b, '#fff4d8', x - 0.011, 1.937, 0.584, 0.012);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 6, 14, Math.PI), this.material('#624733'));
    smile.position.set(0, 1.585, 0.691); smile.rotation.z = Math.PI; b.add(smile);
    this.ball(b, '#bf8a57', -0.63, 0.98, 0.02, 0.22, 0.46, 0.24).rotation.z = -0.2;
    this.arm.position.set(0.57, 1.27, 0);
    this.ball(this.arm, '#bf8a57', 0.08, -0.22, 0.04, 0.22, 0.46, 0.24); b.add(this.arm);
    const scarf = this.mesh(b, new THREE.TorusGeometry(0.46, 0.115, 8, 32), '#c16f45', 0, 1.28, 0);
    scarf.rotation.x = Math.PI / 2;
    this.ball(b, '#c16f45', -0.22, 1.05, 0.47, 0.15, 0.3, 0.065).rotation.z = -0.24;
    b.position.set(0.4, 0.25, 1.0); b.rotation.y = 0.36; this.world.add(b);
  }
  private makeRabbit() {
    const r = this.rabbit;
    this.ball(r, '#f5eedb', 0, 0.51, 0, 0.36, 0.48, 0.31);
    this.ball(r, '#fff7e6', 0, 1.07, 0.03, 0.43, 0.39, 0.35);
    for (const x of [-0.2, 0.2]) {
      this.ball(r, '#fff7e6', x, 1.63, 0, 0.135, 0.47, 0.12).rotation.z = -x * 0.8;
      this.ball(r, '#edc2b1', x, 1.64, 0.102, 0.065, 0.34, 0.03).rotation.z = -x * 0.8;
      this.ball(r, '#fff7e6', x, 0.13, 0.1, 0.17, 0.15, 0.24);
      this.ball(r, '#534737', x * 0.8, 1.12, 0.354, 0.028, 0.04, 0.02);
      this.ball(r, '#eec7b3', x * 1.3, 1.01, 0.308, 0.07, 0.045, 0.025);
    }
    this.ball(r, '#bb826c', 0, 1.02, 0.38, 0.041, 0.03, 0.025);
    const collar = this.mesh(r, new THREE.TorusGeometry(0.27, 0.065, 8, 24), '#839d79', 0, 0.79, 0);
    collar.rotation.x = Math.PI / 2;
    r.position.set(-1.55, 0.25, 1.1); r.rotation.y = 0.4; this.world.add(r);
  }
  private tile(glyph: string, color: string, x: number, y: number, z: number, tilt: number) {
    const tile = new THREE.Group();
    const shape = new THREE.Shape();
    const size = 1.02, half = size / 2, radius = 0.17;
    shape.moveTo(-half + radius, -half); shape.lineTo(half - radius, -half);
    shape.quadraticCurveTo(half, -half, half, -half + radius); shape.lineTo(half, half - radius);
    shape.quadraticCurveTo(half, half, half - radius, half); shape.lineTo(-half + radius, half);
    shape.quadraticCurveTo(-half, half, -half, half - radius); shape.lineTo(-half, -half + radius);
    shape.quadraticCurveTo(-half, -half, -half + radius, -half);
    this.mesh(tile, new THREE.ExtrudeGeometry(shape, { depth: 0.13, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 3, steps: 1 }), '#fff9e7', 0, 0, 0);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color; ctx.font = '600 194px "Klee One", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(glyph, 128, 130);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
    label.position.z = 0.18; tile.add(label);
    tile.position.set(x, y, z); tile.rotation.set(-0.1, 0.43, tilt); tile.userData.baseY = y;
    this.tiles.add(tile);
  }
  private build() {
    const ground = this.mesh(this.world, new THREE.CylinderGeometry(4.15, 3.95, 0.45, 72), '#bccb8b', 0, -0.01, 0);
    ground.scale.set(1.2, 1, 0.87);
    const top = this.mesh(this.world, new THREE.CylinderGeometry(4.12, 4.12, 0.05, 72), '#cedba0', 0, 0.24, 0); top.scale.set(1.2, 1, 0.87);
    const path = this.ball(this.world, '#e8d6aa', 0.15, 0.27, 1.8, 1.25, 0.026, 1.55); path.rotation.y = -0.2;
    this.tree(-3.25, -0.8, 3.9, '#7a9c65');
    this.tree(-1.9, -2, 3.5, '#597e60', true);
    this.tree(0.3, -2.0, 3.1, '#91af75');
    this.tree(2.65, -1.45, 4.2, '#63865f', true);
    this.tree(3.5, 0.2, 3.0, '#9db77b');
    for (const [x, z, s] of [[-3.4, 1.2, 0.75], [3, 1.7, 0.65], [-2.6, -0.2, 0.55], [1.9, -1, 0.55]]) {
      this.ball(this.world, '#97b375', x, 0.4, z, s, s * 0.55, s * 0.7);
      this.ball(this.world, '#aac184', x + 0.4, 0.36, z + 0.1, s * 0.64, s * 0.5, s * 0.64);
    }
    for (const [x, z] of [[-2.7, 1.7], [2.75, 0.4], [2.9, 0.7]]) {
      this.mesh(this.world, new THREE.CylinderGeometry(0.055, 0.07, 0.22, 8), '#f3dfb9', x, 0.36, z);
      this.ball(this.world, '#bf7652', x, 0.51, z, 0.22, 0.115, 0.22);
      this.ball(this.world, '#fff4dc', x - 0.06, 0.61, z + 0.03, 0.03, 0.012, 0.03);
    }
    this.makeBear(); this.makeRabbit();
    this.tile('あ', '#bb6a44', -1.6, 3.6, 1.1, 0.14);
    this.tile('い', '#547659', 0.4, 4.2, 0.7, -0.1);
    this.tile('う', '#c39c42', 2.5, 3.6, 1, -0.18);
    this.world.add(this.tiles);
    this.flower(-3.2, 0.7, '#fff3cd', 0.9); this.flower(2.4, 1.55, '#fff7df', 1);
    for (let i = 0; i < 5; i++) {
      const flower = this.flower(-1.8 + i * 0.84, 2.6 - Math.abs(i - 2) * 0.16, ['#e8a889', '#fff4d0', '#dba1a2', '#fff4d0', '#e8a889'][i], 1.05);
      flower.visible = false; this.flowers.push(flower);
    }
  }
  mount(slot: HTMLElement, mode: 'home' | 'play' | 'reward', count: number, reduced: boolean) {
    if (this.disposed) return;
    slot.append(this.element);
    this.tiles.visible = mode !== 'play';
    this.reduced = reduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.flowers.forEach((flower, index) => { flower.visible = index < count; });
    this.renderer.shadowMap.needsUpdate = true;
    this.resize();
  }
  celebrate() {
    this.celebration = performance.now() / 1000;
    this.needsRender = true;
    window.clearTimeout(this.celebrationTimer);
    this.celebrationTimer = window.setTimeout(() => { this.needsRender = true; }, 1700);
  }
  private resize() {
    const { width, height } = this.element.getBoundingClientRect();
    if (!width || !height || this.disposed) return;
    const aspect = width / height;
    const extent = aspect < 1.2 ? 5.4 / aspect : 4.6;
    this.camera.left = -extent * aspect; this.camera.right = extent * aspect;
    this.camera.top = extent; this.camera.bottom = -extent;
    this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false);
    this.needsRender = true;
  }
  private animate = (now: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    if (!this.visible || !this.element.isConnected || document.hidden) return;
    if ((this.reduced || this.still) && !this.needsRender) return;
    if (now - this.lastFrame < 32) return;
    this.lastFrame = now;
    const time = now / 1000;
    const celebrationTime = time - this.celebration;
    const celebrating = celebrationTime >= 0 && celebrationTime < 1.6;
    const quiet = this.reduced || this.still;
    this.bear.position.y = 0.25 + (!quiet && celebrating ? Math.abs(Math.sin(celebrationTime * 7)) * 0.36 * (1 - celebrationTime / 1.6) : 0);
    this.bear.scale.y = quiet ? 1 : 1 + Math.sin(time * 1.8) * 0.009;
    this.arm.rotation.z = quiet ? (celebrating ? 2.3 : 0.7) : celebrating ? 2.4 + Math.sin(time * 13) * 0.22 : 0.7 + Math.sin(time * 2.4) * 0.15;
    this.rabbit.rotation.z = quiet ? 0 : Math.sin(time * 1.4) * 0.025;
    if (!quiet) this.tiles.children.forEach((tile, i) => { tile.position.y = tile.userData.baseY + Math.sin(time * 1.5 + i) * 0.075; });
    try {
      const start = performance.now();
      this.renderer.render(this.world, this.camera);
      this.needsRender = false;
      this.slowFrames = performance.now() - start > 80 ? this.slowFrames + 1 : 0;
      // Preserve responsive letter buttons on devices that render 3D in software.
      if (this.slowFrames >= 3 && !this.still) {
        this.still = true; this.renderer.setPixelRatio(1); this.resize();
      }
    }
    catch { this.dispose(); this.onFailure(); }
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true; cancelAnimationFrame(this.frame); window.clearTimeout(this.celebrationTimer); this.observer?.disconnect(); this.intersection?.disconnect();
    this.world.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) { if ('map' in material) (material.map as THREE.Texture | null)?.dispose(); material.dispose(); }
      }
    });
    this.renderer.dispose(); this.element.remove();
  }
}
