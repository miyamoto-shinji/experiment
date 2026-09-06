import * as THREE from "three";
import "./oceanDepth.css";

const storageKey = "sakana.oceanDepth";
const stops = [
  { depth: 0, top: "#258b98", middle: "#12566a", bottom: "#082d40" },
  { depth: 50, top: "#14526c", middle: "#0b344d", bottom: "#061a30" },
  { depth: 150, top: "#0c294c", middle: "#081a37", bottom: "#040d20" },
  { depth: 300, top: "#080f29", middle: "#050b1d", bottom: "#020610" },
] as const;

/** An illustrated depth palette, independent of the fish lighting. */
export function oceanAtDepth(value: number) {
  const depth = THREE.MathUtils.clamp(Number.isFinite(value) ? value : 20, 0, 300);
  const end = stops.findIndex((stop) => stop.depth >= depth);
  const a = stops[Math.max(0, end - 1)], b = stops[end];
  const t = a === b ? 0 : (depth - a.depth) / (b.depth - a.depth);
  const blend = (key: "top" | "middle" | "bottom") =>
    `#${new THREE.Color(a[key]).lerp(new THREE.Color(b[key]), t).getHexString()}`;
  return {
    depth, top: blend("top"), middle: blend("middle"), bottom: blend("bottom"),
    fogDensity: 0.018 + (depth / 300) * 0.007,
  };
}

export function initializeOceanDepth(fog: THREE.FogExp2) {
  const slider = document.getElementById("ocean-depth") as HTMLInputElement;
  const output = document.getElementById("depth-value") as HTMLOutputElement;
  let savedDepth = 20;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved !== null && saved.trim() !== "") savedDepth = Number(saved);
  } catch { /* The control also works when browser storage is unavailable. */ }
  slider.value = String(oceanAtDepth(savedDepth).depth);

  function update() {
    const water = oceanAtDepth(slider.valueAsNumber);
    output.value = String(water.depth);
    slider.setAttribute("aria-valuetext", `水深 ${water.depth} メートル`);
    document.body.style.setProperty("--ocean-top", water.top);
    document.body.style.setProperty("--ocean-middle", water.middle);
    document.body.style.setProperty("--ocean-bottom", water.bottom);
    slider.style.setProperty("--depth-progress", `${water.depth / 3}%`);
    fog.color.set(water.middle);
    fog.density = water.fogDensity;
  }
  slider.addEventListener("input", update);
  slider.addEventListener("change", () => {
    try { localStorage.setItem(storageKey, slider.value); } catch { /* Optional persistence. */ }
  });
  update();
}
