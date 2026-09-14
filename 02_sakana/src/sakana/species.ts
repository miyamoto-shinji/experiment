import type { FishSpecies } from "./fishSpecies";
import { fishDefinitions } from "./registry";
export type { FishSpecies } from "./fishSpecies";

/** The collection reads metadata from the same registrations used for rendering. */
export const species: Record<string, FishSpecies> = Object.fromEntries(
  fishDefinitions.map(({ species: entry }) => [entry.id, entry]),
);
