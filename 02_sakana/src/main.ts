import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createFish, type FishInstance } from "./fish/createFish";
import { species } from "./fish/species";
import { initializeOceanDepth } from "./oceanDepth";
import { createFishCollection } from "./collection";

import { initializeIcons, setButtonIcon } from "./icons";

function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Required element not found: ${id}`);
  return element as T;
}

initializeIcons();
const toastElement = getElement("toast");
let toastTimer: ReturnType<typeof setTimeout>;
function toast(message: string) {
  toastElement.textContent = message;
  toastElement.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastElement.classList.remove("visible"), 2400);
}

function startAquarium() {
  const container = getElement("aquarium");
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
  initializeOceanDepth(scene.fog);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 70);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.enablePan = false;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI - 0.25;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.6;
  // Uniform illumination keeps fish colors stable as they swim or the camera turns.
  scene.add(new THREE.AmbientLight("#ffffff", 3.5));
  let selectedSpecies = species.aji;
  let fish = createFish(selectedSpecies);
  scene.add(fish.group);
  const speciesScale = fish.group.scale.clone();
  const schoolOffsets = [
    [-2.5, 1.5],
    [1.5, 1.4],
    [3.2, -1.5],
    [-1.5, -1.3],
    [2.4, 2.5],
    [-3.1, 2.7],
  ];
  function createSchool(source: FishInstance, visible = false) {
    return schoolOffsets.map((_, i) => {
      const clone = source.group.clone(true);
      clone.scale.multiplyScalar(0.4 + (i % 3) * 0.075);
      clone.visible = visible;
      scene.add(clone);
      return clone;
    });
  }
  let school = createSchool(fish);

  // Soft suspended particles give the water depth without an image or external model.
  const particleCount = 230;
  const particlePositions = new Float32Array(particleCount * 3),
    sizes = new Float32Array(particleCount);
  let seed = 7281;
  function random() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  for (let i = 0; i < particleCount; i++) {
    particlePositions.set(
      [(random() - 0.5) * 23, (random() - 0.5) * 15, (random() - 0.5) * 15 - 4],
      i * 3,
    );
    sizes[i] = random() * 2.2 + 0.6;
  }
  const particlesGeometry = new THREE.BufferGeometry();
  particlesGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(particlePositions, 3),
  );
  particlesGeometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  const particlesMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
    },
    vertexShader: `attribute float aSize; uniform float uTime; uniform float uPixelRatio; varying float vAlpha;
    void main(){vec3 p=position;p.y=mod(p.y+7.5+uTime*.045,15.0)-7.5;p.x+=sin(uTime*.12+p.y)*.14;vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aSize*uPixelRatio*9.0/-mv.z,1.0,5.0);vAlpha=.12+aSize*.08;}`,
    fragmentShader: `varying float vAlpha;void main(){float d=length(gl_PointCoord-.5);float alpha=smoothstep(.5,.05,d)*vAlpha;gl_FragColor=vec4(.65,.84,.81,alpha);}`,
  });
  scene.add(new THREE.Points(particlesGeometry, particlesMaterial));
  let baseDistance = 8;
  const rest = new THREE.Vector3();
  function resize() {
    const width = container.clientWidth,
      height = container.clientHeight;
    const mobile = width <= 700;
    camera.aspect = width / height;
    const worldWidth = mobile ? 5.8 : width < 1100 ? 10.4 : 10.8;
    baseDistance =
      worldWidth /
      (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    camera.position.set(0, 0.32, baseDistance);
    controls.target.set(0, 0, 0);
    controls.minDistance = baseDistance * 0.57;
    controls.maxDistance = baseDistance * 1.6;
    rest.set(mobile ? -0.3 : width < 1100 ? 0.65 : 0.8, mobile ? 1.1 : 0.05, 0);
    fish.group.scale.copy(speciesScale).multiplyScalar(mobile ? 0.9 : 1.14);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    controls.update();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let schoolActive = false,
    elapsed = 0,
    previous = performance.now(),
    frame = 0;
  const entries = Object.values(species);
  const collection = createFishCollection(dialog, entries, (entry) => {
    if (entry.id === selectedSpecies.id) return;
    // Replace the entire school before disposing its shared resources.
    const nextFish = createFish(entry);
    const nextSchool = createSchool(nextFish, schoolActive);
    scene.remove(fish.group, ...school);
    fish.dispose();
    fish = nextFish;
    school = nextSchool;
    selectedSpecies = entry;
    speciesScale.copy(fish.group.scale);
    scene.add(fish.group);
    elapsed = 0;
    fish.update(elapsed);
    resize();
    updateSpeciesSummary();
  });
  getElement("species-count").textContent = String(entries.length).padStart(2, "0");
  function updateSpeciesSummary() {
    getElement("species-number").textContent = `NO. ${selectedSpecies.number}`;
    getElement("species-name").textContent = selectedSpecies.name;
    getElement("species-kanji").textContent = selectedSpecies.kanji;
    getElement("species-family").textContent = selectedSpecies.family;
    getElement("species-length").textContent =
      `全長 ${selectedSpecies.lengthLabel}`;
    getElement("species-description").replaceChildren(
      document.createTextNode(selectedSpecies.description[0]),
      document.createElement("br"),
      document.createTextNode(selectedSpecies.description[1]),
    );
    renderer.domElement.setAttribute(
      "aria-label",
      `銀色の${selectedSpecies.name}が泳ぐ3Dビュー`,
    );
    container.setAttribute(
      "aria-label",
      `泳ぐ${selectedSpecies.name}の3D水槽。ドラッグで回転、スクロールまたはピンチで拡大できます。`,
    );
    collection.setSelected(selectedSpecies.id);
  }
  updateSpeciesSummary();
  const schoolButton = getElement<HTMLButtonElement>("school");
  schoolButton.addEventListener("click", () => {
    schoolActive = !schoolActive;
    school.forEach((f) => (f.visible = schoolActive));
    schoolButton.setAttribute("aria-pressed", String(schoolActive));
    setButtonIcon(
      schoolButton,
      schoolActive ? "fish" : "school",
      schoolActive ? "1匹に戻す" : "群れにする",
    );
  });
  function resetView() {
    camera.position.set(0, 0.32, baseDistance);
    controls.target.set(0, 0, 0);
    controls.update();
  }
  getElement("reset-view").addEventListener("click", () => {
    resetView();
    toast("もとの視点に戻しました");
  });
  function zoom(factor: number) {
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
  getElement("zoom-in").addEventListener("click", () => zoom(0.85));
  getElement("zoom-out").addEventListener("click", () => zoom(1.18));
  const fullscreenButton = getElement<HTMLButtonElement>("fullscreen");
  fullscreenButton.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen)
        await document.documentElement.requestFullscreen();
      else toast("このブラウザでは全画面表示を利用できません");
    } catch {
      toast("全画面表示に切り替えられませんでした");
    }
  });
  document.addEventListener("fullscreenchange", () => {
    setButtonIcon(
      fullscreenButton,
      "expand",
      document.fullscreenElement ? "全画面表示を終了" : "全画面表示",
    );
  });
  function animate(now: number) {
    const delta = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (!reducedMotion.matches) elapsed += delta;
    fish.update(elapsed);
    fish.group.position.copy(rest);
    fish.group.position.x += Math.sin(elapsed * 0.28) * 0.22;
    fish.group.position.y += Math.sin(elapsed * 0.7) * 0.055;
    fish.group.rotation.set(
      Math.sin(elapsed * 0.65) * 0.025,
      -0.13 + Math.sin(elapsed * 0.38) * 0.17,
      Math.sin(elapsed * 0.53) * 0.015,
    );
    school.forEach((f, i) => {
      f.position.set(
        rest.x + schoolOffsets[i][0] + Math.sin(elapsed * 0.28 + i) * 0.16,
        rest.y + schoolOffsets[i][1] + Math.sin(elapsed * 0.7 + i) * 0.12,
        -2 - i * 0.6,
      );
      f.rotation.copy(fish.group.rotation);
    });
    particlesMaterial.uniforms.uTime.value = elapsed;
    controls.update();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  }
  frame = requestAnimationFrame(animate);
  document.addEventListener("visibilitychange", () => {
    cancelAnimationFrame(frame);
    if (!document.hidden) {
      previous = performance.now();
      frame = requestAnimationFrame(animate);
    }
  });
  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    cancelAnimationFrame(frame);
    toast("水槽の表示が中断されました。ページを再読み込みしてください。");
  });
  getElement("loading").classList.add("loaded");
  getElement("loading").setAttribute("aria-hidden", "true");
}

const dialog = getElement<HTMLDialogElement>("collection-dialog");
getElement("collection-open").addEventListener("click", () =>
  dialog.showModal(),
);
dialog.addEventListener("click", (e) => {
  const r = dialog.getBoundingClientRect();
  if (
    e.clientX < r.left ||
    e.clientX > r.right ||
    e.clientY < r.top ||
    e.clientY > r.bottom
  )
    dialog.close();
});
try {
  startAquarium();
} catch (error) {
  console.error(error);
  getElement("loading").innerHTML =
    '<div style="padding:32px;line-height:2;text-align:center">水槽を表示できませんでした。<br>WebGLに対応したブラウザで、もう一度お試しください。<br><button onclick="location.reload()" style="margin-top:20px;padding:10px 20px;border-radius:6px">再読み込み</button></div>';
}
