import type { FishSpecies } from "./fishSpecies";
import type { FishInstance } from "./fishModel";
import { getFishDefinition } from "./registry";
export { setFishMouthOpen, type FishInstance } from "./fishModel";

/** Select a species builder; fish-specific shapes live in their own modules. */
export function createFish(spec: FishSpecies): FishInstance {
  const definition = getFishDefinition(spec.id);
  if (!definition) throw new Error(`Unsupported fish species: ${spec.id}`);
  return definition.create(spec);
}
