import "./oceanDepth.css";

const storageKey = "sakana.oceanDepth";
const waters = [
  { depth: 50, top: "#9ce8f7", middle: "#349dcd", bottom: "#84c9dc" },
  { depth: 100, top: "#248dc8", middle: "#15558b", bottom: "#0a3154" },
  { depth: 150, top: "#123d65", middle: "#081d3c", bottom: "#040f23" },
] as const;

/** Normalize saved or selected depths to the three ocean environments. */
export function oceanAtDepth(value: number) {
  const depth = Number.isFinite(value) ? value : 50;
  return waters.reduce((nearest, water) =>
    Math.abs(water.depth - depth) < Math.abs(nearest.depth - depth)
      ? water
      : nearest,
  );
}

export function initializeOceanDepth(onChange: (depth: number) => void) {
  const range = document.querySelector<HTMLInputElement>("#ocean-depth");
  const output = document.querySelector<HTMLOutputElement>("#depth-value");
  if (!range || !output) throw new Error("The ocean depth control is missing.");
  const selectDepth = (value: number) => {
    const water = oceanAtDepth(value);
    const depth = String(water.depth);
    document.body.dataset.depth = depth;
    document.body.style.setProperty("--ocean-top", water.top);
    document.body.style.setProperty("--ocean-middle", water.middle);
    document.body.style.setProperty("--ocean-bottom", water.bottom);
    range.value = depth;
    range.setAttribute("aria-valuetext", `${depth}メートル`);
    range.style.setProperty("--depth-progress", `${water.depth - 50}%`);
    output.value = `${depth} m`;
    onChange(water.depth);
    try {
      localStorage.setItem(storageKey, depth);
    } catch {
      /* The depth control works even when browser storage is unavailable. */
    }
  };

  let savedDepth = 50;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved !== null && saved.trim() !== "") savedDepth = Number(saved);
  } catch {
    /* The first preset is the fallback when storage is unavailable. */
  }
  const onInput = () => selectDepth(range.valueAsNumber);
  range.addEventListener("input", onInput);
  selectDepth(savedDepth);
  return () => range.removeEventListener("input", onInput);
}
