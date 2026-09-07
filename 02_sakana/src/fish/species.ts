import { fishVisualStyle } from "./visualStyle";

/** Species data is independent of rendering. New body families can register their own builder. */
export interface FishSpecies {
  id: string;
  name: string;
  kanji: string;
  number: string;
  description: [string, string];
  lengthLabel: string;
  scientificName: string;
  family: string;
  body: "carangid" | "clupeid" | "rockfish";
  palette: {
    back: string;
    flank: string;
    belly: string;
    fin: string;
    stripe: string;
    finRay: string;
    finEdge: string;
  };
  shape: { length: number; height: number; width: number; tailSize: number };
  motion: { frequency: number; amplitude: number };
}

export const species: Record<string, FishSpecies> = {
  aji: {
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
  },
  iwashi: {
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
  },
  kasago: {
    id: "kasago",
    name: "カサゴ",
    kanji: "笠子",
    number: "003",
    description: [
      "赤茶色のまだら模様と、扇のような大きな胸びれ。",
      "背中に並ぶトゲが目じるしの、岩場にすむ魚。",
    ],
    lengthLabel: "約30 cm",
    scientificName: "Sebastiscus marmoratus",
    family: "メバル科",
    body: "rockfish",
    palette: {
      back: "#775247",
      flank: "#be6642",
      belly: "#e3cdb7",
      fin: "#bd5c32",
      stripe: "#edc49d",
      finRay: "#783d2a",
      finEdge: "#e9ac7d",
    },
    shape: { length: 0.97, height: 0.97, width: 1, tailSize: 1 },
    motion: { frequency: 2.2, amplitude: 0.085 },
  },
};
