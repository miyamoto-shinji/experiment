import "./oceanDepth.css";

const waters = [
  { depth: 50, top: "#9ce8f7", middle: "#349dcd", bottom: "#84c9dc" },
  { depth: 100, top: "#248dc8", middle: "#15558b", bottom: "#0a3154" },
  { depth: 150, top: "#123d65", middle: "#081d3c", bottom: "#040f23" },
] as const;

export function initializeOceanDepth(onChange: (depth: number) => void) {
  const button = document.querySelector<HTMLButtonElement>("#ocean-depth");
  const value = document.querySelector<HTMLElement>("#depth-value");
  if (!button || !value) throw new Error("The ocean depth control is missing.");
  let selectedIndex = 0;
  const selectDepth = () => {
    const water = waters[selectedIndex];
    const depth = String(water.depth);
    const nextDepth = waters[(selectedIndex + 1) % waters.length].depth;
    document.body.dataset.depth = depth;
    document.body.style.setProperty("--ocean-top", water.top);
    document.body.style.setProperty("--ocean-middle", water.middle);
    document.body.style.setProperty("--ocean-bottom", water.bottom);
    value.textContent = `${depth}m`;
    button.title = `水深${depth}m。${nextDepth}mに変更`;
    button.setAttribute("aria-label", button.title);
    onChange(water.depth);
  };

  const onClick = () => {
    selectedIndex = (selectedIndex + 1) % waters.length;
    selectDepth();
  };
  button.addEventListener("click", onClick);
  selectDepth();
  return () => button.removeEventListener("click", onClick);
}
