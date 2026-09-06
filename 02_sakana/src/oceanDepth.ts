import type * as THREE from "three";
import "./oceanDepth.css";

const storageKey = "sakana.oceanDepth";
const waters = [
  { depth: 50, top: "#9ce8f7", middle: "#349dcd", bottom: "#84c9dc", fogDensity: 0.015 },
  { depth: 100, top: "#248dc8", middle: "#15558b", bottom: "#0a3154", fogDensity: 0.019 },
  { depth: 150, top: "#123d65", middle: "#081d3c", bottom: "#040f23", fogDensity: 0.023 },
] as const;

/** Normalize saved or selected depths to the three illustrated backgrounds. */
export function oceanAtDepth(value: number) {
  const depth = Number.isFinite(value) ? value : 50;
  return waters.reduce((nearest, water) =>
    Math.abs(water.depth - depth) < Math.abs(nearest.depth - depth) ? water : nearest,
  );
}

export function initializeOceanDepth(fog: THREE.FogExp2) {
  const range = document.querySelector<HTMLInputElement>("#ocean-depth");
  const output = document.querySelector<HTMLOutputElement>("#depth-value");
  if (!range || !output) throw new Error("The ocean depth control is missing.");
  const background = document.createElement("div");
  background.className = "ocean-background";
  background.setAttribute("aria-hidden", "true");
  const layers = waters.map((water) => {
    const layer = document.createElement("div");
    layer.className = "ocean-background-layer";
    layer.dataset.depth = String(water.depth);
    // Each layer retains its palette if the illustration is still loading or unavailable.
    layer.style.backgroundImage = `linear-gradient(180deg, ${water.top}, ${water.middle} 48%, ${water.bottom})`;
    const image = document.createElement("img");
    image.src = `${import.meta.env.BASE_URL}backgrounds/ocean-${water.depth}m.png`;
    image.alt = "";
    image.decoding = "async";
    image.draggable = false;
    image.addEventListener("load", () => image.classList.add("is-loaded"), { once: true });
    layer.appendChild(image);
    background.appendChild(layer);
    return layer;
  });
  document.body.prepend(background);

  const selectDepth = (value: number) => {
    const water = oceanAtDepth(value);
    const depth = String(water.depth);
    document.body.dataset.depth = depth;
    document.body.style.setProperty("--ocean-top", water.top);
    document.body.style.setProperty("--ocean-middle", water.middle);
    document.body.style.setProperty("--ocean-bottom", water.bottom);
    layers.forEach((layer) => layer.classList.toggle("is-active", layer.dataset.depth === depth));
    range.value = depth;
    range.setAttribute("aria-valuetext", `${depth}メートル`);
    range.style.setProperty("--depth-progress", `${water.depth - 50}%`);
    output.value = `${depth} m`;
    fog.color.set(water.middle);
    fog.density = water.fogDensity;
    try {
      localStorage.setItem(storageKey, depth);
    } catch { /* The depth control works even when browser storage is unavailable. */ }
  };

  let savedDepth = 50;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved !== null && saved.trim() !== "") savedDepth = Number(saved);
  } catch { /* The first preset is the fallback when storage is unavailable. */ }
  range.addEventListener("input", () => selectDepth(range.valueAsNumber));
  selectDepth(savedDepth);
}
