import type { FishSpecies } from "./fishSpecies";
import type { FishInstance } from "./fishModel";
import {
  createStreamlinedFish,
  type StreamlinedFishFeatures,
} from "./createStreamlinedFish";

export const katsuoSpecies: FishSpecies = {
  id: "katsuo",
  name: "カツオ",
  kanji: "鰹",
  number: "004",
  description: [
    "深い藍色の背中と、力強く泳ぐ流線形の体。",
    "銀色のお腹に走る縞と、小さなひれが目じるし。",
  ],
  lengthLabel: "約40cm〜70cm",
  scientificName: "Katsuwonus pelamis",
  family: "サバ科",
  body: "scombrid",
  palette: {
    back: "#2b4368",
    flank: "#7389a5",
    belly: "#e7e9ee",
    fin: "#3a4d69",
    stripe: "#b9c7d5",
    finRay: "#53647e",
    finEdge: "#91a0b9",
  },
  shape: { length: 1.035, height: 0.98, width: 1.16, tailSize: 0.97 },
  motion: { frequency: 4.3, amplitude: 0.145 },
};

/** Four tapered stripes wrap with the skin, so they never float off the belly. */
function paintKatsuoSkin(ctx: CanvasRenderingContext2D) {
  for (const side of [1, -1]) {
    ctx.save();
    if (side === -1) {
      ctx.translate(0, 512);
      ctx.scale(1, -1);
    }
    ctx.fillStyle = "#354964";
    const stripes = [
      { y: 142, width: 5.1, start: 286, end: 957 },
      { y: 161, width: 6.1, start: 315, end: 951 },
      { y: 181, width: 6.4, start: 352, end: 939 },
      { y: 203, width: 5.4, start: 394, end: 908 },
    ];
    for (const { y, width, start, end } of stripes) {
      ctx.beginPath();
      ctx.moveTo(start, y);
      ctx.bezierCurveTo(start + 80, y - width, 722, y - width, end, y - 2);
      ctx.bezierCurveTo(766, y + width * 0.65, start + 78, y + width, start, y);
      ctx.fill();
    }
    // Broad silver facets echo the reference illustration's softly cut planes.
    ctx.fillStyle = "rgba(235,244,255,.13)";
    ctx.beginPath();
    ctx.moveTo(110, 129);
    ctx.lineTo(234, 103);
    ctx.lineTo(337, 134);
    ctx.lineTo(206, 156);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

const katsuoFeatures: StreamlinedFishFeatures = {
  skinBands: [
    [0, "#233b62"],
    [0.09, "#2b4368"],
    [0.17, "#526e96"],
    [0.225, "#8b9cb4"],
    [0.28, "#ced5df"],
    [0.37, "#e7e9ee"],
    [0.5, "#c1cad6"],
    [0.63, "#e7e9ee"],
    [0.72, "#ced5df"],
    [0.775, "#8b9cb4"],
    [0.83, "#526e96"],
    [0.91, "#2b4368"],
    [1, "#233b62"],
  ],
  paintSkin: paintKatsuoSkin,
  eyeScale: 0.8,
  irisColor: "#e5d19a",
  shoulderSpot: false,
  bodyFins(bodyFin) {
    bodyFin(-0.91, 0.3, 0.59, 0.2, 14);
    bodyFin(0.36, 0.95, 0.33, 0.65, 8);
    bodyFin(0.4, 0.98, 0.26, 0.65, 8, Math.PI);

    // Small, cream-colored finlets use the same membrane/material as larger fins.
    // Their low tessellation adds detail without multiplying render calls.
    const finlet = { color: "#d4c9ad", edge: "#eee5d4", segments: 16 };
    for (let i = 0; i < 7; i++) {
      const start = 0.99 + i * 0.105;
      const height = 0.12 - i * 0.007;
      for (const angle of [0, Math.PI]) {
        bodyFin(start, start + 0.12, height, 0.67, 1, angle, finlet);
      }
    }
  },
  pelvicFin(bodyFin, side) {
    bodyFin(-0.84, -0.34, 0.32, 0.63, 7, Math.PI - side * 0.36);
  },
  tailLobe(ribbonFin, tailPoint) {
    // A swept leading edge and concave trailing edge create the crescent fork.
    ribbonFin(
      [tailPoint(1.73, -0.025), tailPoint(1.88, -0.02), tailPoint(2.04, 0)],
      [
        tailPoint(1.73, 0.025),
        tailPoint(2.16, 0.58),
        tailPoint(2.61, 0.97),
        tailPoint(2.27, 0.43),
        tailPoint(2.04, 0),
      ],
      9,
      0,
    );
  },
  pectoralFin({ side, surface, ribbonFin }) {
    const top = surface(-0.88, 0.03, side, 0.003);
    const center = surface(-0.84, -0.08, side, 0.003);
    const bottom = surface(-0.75, -0.22, side, 0.003);
    ribbonFin(
      [top, center, bottom],
      [
        top,
        [-0.4, 0.09, 0.47 * side],
        [0.14, 0.18, 0.56 * side],
        [-0.34, -0.18, 0.49 * side],
        bottom,
      ],
      7,
      0,
    );
  },
};

export function createKatsuo(spec: FishSpecies): FishInstance {
  return createStreamlinedFish(spec, katsuoFeatures);
}
