import * as THREE from "three";
import type { FishSpecies } from "./species";

export function mottledTexture(spec: FishSpecies) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const base = ctx.createLinearGradient(0, 0, 0, 512);
  for (const [stop, color] of [
    [0, spec.palette.back],
    [0.13, "#9c593f"],
    [0.26, spec.palette.flank],
    [0.38, "#d2966f"],
    [0.45, spec.palette.belly],
    [0.5, "#c3b4a7"],
    [0.55, spec.palette.belly],
    [0.62, "#d2966f"],
    [0.74, spec.palette.flank],
    [0.87, "#9c593f"],
    [1, spec.palette.back],
  ] as [number, string][])
    base.addColorStop(stop, color);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 1024, 512);
  let seed = 42137;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  function patch(x: number, y: number, rx: number, ry: number, color: string) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2,
        radius = 0.64 + random() * 0.45;
      const px = x + Math.cos(a) * rx * radius,
        py = y + Math.sin(a) * ry * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  for (const side of [0, 1]) {
    const y = (value: number) => (side === 0 ? value : 512 - value);
    // Uneven, broad patches, rather than an evenly spaced dot pattern.
    for (let i = 0; i < 44; i++) {
      patch(
        random() * 1060 - 18,
        y(12 + random() * 180),
        24 + random() * 50,
        10 + random() * 24,
        ["#884e3cb8", "#9b5038bb", "#d17443ad"][i % 3],
      );
    }
    for (let i = 0; i < 58; i++) {
      const large = i % 4 === 0;
      patch(
        random() * 1024,
        y(20 + random() * 183),
        large ? 28 + random() * 16 : 9 + random() * 12,
        large ? 17 + random() * 10 : 5 + random() * 8,
        ["#edc5a0", "#d8a581", "#f0ceab"][i % 3],
      );
    }
    for (let i = 0; i < 130; i++) {
      patch(
        random() * 1024,
        y(random() * 245),
        20 + random() * 24,
        10 + random() * 12,
        i % 2 ? "#fff0d609" : "#582e250b",
      );
    }
  }
  // A broad, warm sheen gives volume under the aquarium's uniform lighting.
  for (const y of [96, 416]) {
    ctx.save();
    ctx.translate(400, y);
    ctx.scale(400, 20);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    glow.addColorStop(0, "#ffe0b91a");
    glow.addColorStop(1, "#ffe0b900");
    ctx.fillStyle = glow;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
