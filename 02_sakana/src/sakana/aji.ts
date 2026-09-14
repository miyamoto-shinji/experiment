import type { FishSpecies } from "./fishSpecies";
import type { FishInstance } from "./fishModel";
import {
  createStreamlinedFish,
  type StreamlinedFishFeatures,
} from "./createStreamlinedFish";
import { fishVisualStyle } from "./visualStyle";

export const ajiSpecies: FishSpecies = {
  id: "aji",
  name: "アジ",
  kanji: "鯵",
  number: "001",
  description: [
    "きらめく銀色の体と、すらりとした尾びれ。",
    "体の横に並ぶ「ぜいご」が、アジの目じるし。",
  ],
  lengthLabel: "約20–40 cm",
  scientificName: "Trachurus japonicus",
  family: "アジ科",
  body: "carangid",
  palette: {
    ...fishVisualStyle.palette,
    finRay: fishVisualStyle.details.finRay,
    finEdge: "#ded38e",
  },
  shape: { length: 1, height: 1, width: 1, tailSize: 1 },
  motion: { frequency: 3.5, amplitude: 0.19 },
};

const ajiFeatures: StreamlinedFishFeatures = {
  bodyFins(bodyFin) {
    bodyFin(-0.88, -0.06, 0.44, 0.66, 11);
    bodyFin(0.06, 1.44, 0.34, 0.27, 17);
    bodyFin(0.03, 1.4, 0.27, 0.3, 15, Math.PI);
  },
  pelvicFin(bodyFin, side) {
    bodyFin(-0.77, -0.24, 0.26, 0.58, 8, Math.PI - side * 0.35);
  },
  lateralDetails({ side, section, surface, tube, lineMaterial }) {
    // Raised scutes follow the narrow rear part of each lateral line.
    for (let i = 0; i < 25; i++) {
      const x = 0.4 + i * 0.051,
        [, , cy] = section(x);
      const center = surface(x, cy + 0.015, side, 0.006);
      const size = 0.022 - i * 0.0004;
      tube(
        [
          [center[0] - 0.018, center[1] + size, center[2]],
          [center[0] + 0.01, center[1], center[2] + 0.005 * side],
          [center[0] - 0.018, center[1] - size, center[2]],
        ],
        0.0035,
        lineMaterial,
      );
    }
  },
};

export function createAji(spec: FishSpecies): FishInstance {
  return createStreamlinedFish(spec, ajiFeatures);
}
