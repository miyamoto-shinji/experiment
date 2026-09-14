import type { FishInstance } from "./fishModel";

/** Species metadata and proportions, independent of the aquarium UI. */
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

/** Register a species and its builder together so the collection and renderer agree. */
export interface FishDefinition {
  species: FishSpecies;
  create: (spec: FishSpecies) => FishInstance;
}
