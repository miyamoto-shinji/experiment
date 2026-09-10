import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { getSchoolViewTarget } from "./schoolMotion";

/** Owns the rendering surface and camera, while the aquarium owns its contents. */
export function createAquariumView(container: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-label", "銀色のアジが泳ぐ3Dビュー");
  renderer.domElement.setAttribute("role", "img");

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2("#0b2c36", 0.035);
  // Uniform illumination keeps fish colors stable as they swim or the camera turns.
  const light = new THREE.AmbientLight("#ffffff", 3.5);
  scene.add(light);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.enablePan = false;
  // Keep one-finger orbiting; touch zoom is available through the +/- buttons.
  controls.touches.TWO = null;
  controls.minPolarAngle = 0.75;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.6;

  const viewTarget = new THREE.Vector3();
  let baseDistance = 8;
  let mobile = false;
  let disposed = false;

  function resize(schoolActive: boolean) {
    if (disposed) return { mobile, layoutChanged: false };
    const width = container.clientWidth,
      height = container.clientHeight;
    const nextMobile = width <= 700;
    const layoutChanged = mobile !== nextMobile;
    mobile = nextMobile;
    camera.aspect = width / height;
    const worldWidth = mobile ? 5.8 : width < 1100 ? 10.4 : 10.8;
    baseDistance =
      worldWidth /
      (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    if (schoolActive) getSchoolViewTarget(mobile, viewTarget);
    else viewTarget.set(0, 0, 0);
    camera.position.set(
      viewTarget.x,
      viewTarget.y + 0.32,
      viewTarget.z + baseDistance,
    );
    controls.target.copy(viewTarget);
    controls.minDistance = baseDistance * 0.57;
    controls.maxDistance = baseDistance * 1.6;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    controls.update();
    return { mobile, layoutChanged };
  }

  function reset() {
    if (disposed) return;
    camera.position.set(
      viewTarget.x,
      viewTarget.y + 0.32,
      viewTarget.z + baseDistance,
    );
    controls.target.copy(viewTarget);
    controls.update();
  }

  function zoom(factor: number) {
    if (disposed) return;
    const offset = camera.position.clone().sub(controls.target);
    offset.setLength(
      THREE.MathUtils.clamp(
        offset.length() * factor,
        controls.minDistance,
        controls.maxDistance,
      ),
    );
    camera.position.copy(controls.target).add(offset);
    controls.update();
  }

  function update() {
    if (!disposed) controls.update();
  }

  function render() {
    if (!disposed) renderer.render(scene, camera);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    controls.dispose();
    light.removeFromParent();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return {
    scene,
    renderer,
    camera,
    get mobile() {
      return mobile;
    },
    resize,
    reset,
    zoom,
    update,
    render,
    dispose,
  };
}
