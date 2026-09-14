import * as THREE from "three";
import { createBackgroundFish } from "./sakana/backgroundFish";
import { createOceanLifeMotion } from "./oceanLifeMotion";

interface OceanLifeEnvironment {
  readonly depth: number;
}

/** Background residents have their own clock and shared, lightweight models. */
export function createOceanLife(
  scene: THREE.Scene,
  environment: OceanLifeEnvironment,
) {
  const group = new THREE.Group();
  group.name = "ocean-life";
  const smallModel = createBackgroundFish("small");
  const largeModel = createBackgroundFish("large");
  const motion = createOceanLifeMotion();
  const initial = motion.update(0, false, false);
  const small = initial.small.map((_, index) => {
    const fish = new THREE.Mesh(smallModel.geometry, smallModel.material);
    fish.name = `reef-fish-${index + 1}`;
    fish.userData.speciesId = "iwashi";
    group.add(fish);
    return fish;
  });
  const large = new THREE.Mesh(largeModel.geometry, largeModel.material);
  large.name = "distant-fish";
  group.add(large);
  scene.add(group);
  let disposed = false;

  function place(
    fish: THREE.Mesh,
    pose: ReturnType<typeof motion.update>["large"],
  ) {
    fish.visible = pose.visible;
    fish.position.copy(pose.position);
    fish.scale.setScalar(pose.scale);
    fish.rotation.set(0, pose.yaw, pose.pitch, "YXZ");
    fish.rotateX(pose.roll);
  }

  function update(delta: number, mobile: boolean, reducedMotion: boolean) {
    if (disposed) return;
    const state = motion.update(delta, mobile, reducedMotion);
    small.forEach((fish, index) => place(fish, state.small[index]));
    place(large, state.large);
    smallModel.update(state.time, environment.depth);
    largeModel.update(state.time, environment.depth);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    smallModel.dispose();
    largeModel.dispose();
  }

  update(0, false, false);
  return { update, dispose };
}
