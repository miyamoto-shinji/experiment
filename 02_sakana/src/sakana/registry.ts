import { ajiSpecies, createAji } from "./aji";
import { iwashiSpecies, createIwashi } from "./iwashi";
import { kasagoSpecies, createKasago } from "./kasago";
import { katsuoSpecies, createKatsuo } from "./katsuo";
import type { FishDefinition } from "./fishSpecies";

/** Add each new fish here; display order and available builders share this list. */
export const fishDefinitions: readonly FishDefinition[] = [
  { species: ajiSpecies, create: createAji },
  { species: iwashiSpecies, create: createIwashi },
  { species: kasagoSpecies, create: createKasago },
  { species: katsuoSpecies, create: createKatsuo },
];

const definitionsById = new Map(
  fishDefinitions.map((definition) => [definition.species.id, definition]),
);

export function getFishDefinition(id: string): FishDefinition | undefined {
  return definitionsById.get(id);
}
