import * as THREE from "three";

export interface FishInstance {
  group: THREE.Group;
  readonly mouthPosition: THREE.Vector3;
  update: (time: number, mouthOpen?: number) => void;
  dispose: () => void;
}

/** Feeding targets the aperture between the fixed upper lip and moving lower lip. */
export function getFishMouthPosition(
  group: THREE.Group,
  fallback: THREE.Vector3,
  destination: THREE.Vector3,
) {
  const jaw = group.getObjectByName("fish-lower-jaw");
  const tip = jaw?.userData.mouthTip as [number, number, number] | undefined;
  if (!jaw || !tip) return destination.copy(fallback);
  jaw.updateMatrix();
  destination.fromArray(tip).applyMatrix4(jaw.matrix);
  destination.set(
    (destination.x + tip[0]) / 2,
    (destination.y + tip[1]) / 2,
    (destination.z + tip[2]) / 2,
  );
  return destination;
}

/** Geometry stays in fish coordinates; each clone has its own movable jaw. */
export function setFishMouthOpen(group: THREE.Group, openness: number) {
  const jaw = group.getObjectByName("fish-lower-jaw");
  if (!jaw) return;
  const [x, y] = (jaw.userData.hinge ?? [-1.69, -0.112]) as [number, number];
  const angle =
    THREE.MathUtils.clamp(Number.isFinite(openness) ? openness : 0, 0, 1) *
    (jaw.userData.maxAngle ?? 0.67);
  const c = Math.cos(angle),
    s = Math.sin(angle);
  jaw.rotation.z = angle;
  jaw.position.set(x * (1 - c) + y * s, y * (1 - c) - x * s, 0);
  const surface = group.getObjectByName("fish-jaw-throat") as
    THREE.Mesh | undefined;
  if (surface?.morphTargetInfluences) {
    // Two relative morphs reproduce the jaw rotation exactly, including intermediate angles.
    surface.morphTargetInfluences[0] = c - 1;
    surface.morphTargetInfluences[1] = s;
  }
}
