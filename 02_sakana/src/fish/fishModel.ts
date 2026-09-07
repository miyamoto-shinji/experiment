import * as THREE from "three";

export interface FishInstance {
  group: THREE.Group;
  readonly mouthPosition: THREE.Vector3;
  update: (time: number, mouthOpen?: number) => void;
  dispose: () => void;
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
  const lining = group.getObjectByName("fish-mouth-lining") as
    | THREE.Mesh
    | undefined;
  if (lining?.morphTargetInfluences) {
    // Two relative morphs reproduce the jaw rotation exactly, including intermediate angles.
    lining.morphTargetInfluences[0] = c - 1;
    lining.morphTargetInfluences[1] = s;
  }
}
