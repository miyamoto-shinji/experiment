import type { FishSpecies } from "./fishSpecies";
import type { FishInstance } from "./fishModel";
import {
  createStreamlinedFish,
  type StreamlinedFishFeatures,
} from "./createStreamlinedFish";

export const iwashiSpecies: FishSpecies = {
  id: "iwashi",
  name: "イワシ",
  kanji: "鰯",
  number: "002",
  description: [
    "青灰色の背中から、白銀色へつながる細長い体。",
    "体の横に並ぶ黒い斑点が、イワシの目じるし。",
  ],
  lengthLabel: "約15–25 cm",
  scientificName: "Sardinops melanostictus",
  family: "ニシン科",
  body: "clupeid",
  palette: {
    back: "#3d586f",
    flank: "#8aa5b8",
    belly: "#edf1f3",
    fin: "#b8b895",
    stripe: "#d1d5c7",
    finRay: "#919781",
    finEdge: "#e4e4cc",
  },
  shape: { length: 1.08, height: 0.8, width: 0.83, tailSize: 0.82 },
  motion: { frequency: 4.0, amplitude: 0.16 },
};

const iwashiFeatures: StreamlinedFishFeatures = {
  bodyFins(bodyFin) {
    bodyFin(-0.35, 0.46, 0.46, 0.49, 12);
    bodyFin(0.6, 1.43, 0.22, 0.3, 12, Math.PI);
  },
  pelvicFin(bodyFin, side) {
    bodyFin(-0.24, 0.16, 0.2, 0.58, 8, Math.PI - side * 0.35);
  },
  sideMarkings({ spec, section, surfaceDisc, outline }) {
    // Flush, bilateral markings stay seated on the slender body.
    for (let i = 0; i < 9; i++) {
      const x = -0.69 + i * 0.23;
      const [h, , cy] = section(x);
      const radius = 0.048 - i * 0.0013;
      surfaceDisc(
        x,
        cy + h * 0.37,
        radius / spec.shape.length,
        radius / spec.shape.height,
        0.003,
        outline,
      );
    }
  },
};

export function createIwashi(spec: FishSpecies): FishInstance {
  return createStreamlinedFish(spec, iwashiFeatures);
}
