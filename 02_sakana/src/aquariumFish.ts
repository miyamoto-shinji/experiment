import * as THREE from "three";
import {
  createFish,
  setFishMouthOpen,
  type FishInstance,
} from "./fish/createFish";
import { getFishMouthPosition } from "./fish/fishModel";
import type { FishSpecies } from "./fish/species";
import { createFeeding, type FeedingActor } from "./feeding";
import { createShelterMotion } from "./shelterMotion";
import {
  SCHOOL_MEMBERS,
  createSchoolMotion,
  getSchoolRestPosition,
  getSchoolScale,
} from "./schoolMotion";

export interface AquariumFishEnvironment {
  readonly exitPosition: THREE.Vector3;
  readonly shelterPosition: THREE.Vector3;
  readonly shelterRoute: { approach: THREE.Vector3; gate: THREE.Vector3 };
}

/** Owns the fish, their shared resources, swimming controllers and feeding state. */
export function createAquariumFish(
  scene: THREE.Scene,
  environment: AquariumFishEnvironment,
  initialSpecies: FishSpecies,
) {
  const shelter = createShelterMotion();
  const schoolMotion = createSchoolMotion();
  let selectedSpecies = initialSpecies;
  let schoolActive = false;
  let mobileView = false;
  let displayScale = 1.14;
  let disposed = false;
  let fish = createFish(selectedSpecies);
  scene.add(fish.group);
  const speciesScale = fish.group.scale.clone();
  const rest = environment.exitPosition.clone();
  const scaledMouth = fish.mouthPosition.clone().multiply(speciesScale);

  function createSchool(source: FishInstance) {
    return SCHOOL_MEMBERS.slice(1).map(({ scale }) => {
      const clone = source.group.clone(true);
      clone.scale.multiplyScalar(scale);
      clone.visible = schoolActive;
      scene.add(clone);
      return clone;
    });
  }
  let school = createSchool(fish);
  const feeding = createFeeding(scene);

  function createFeedingActors(): FeedingActor[] {
    return [fish.group, ...school].map((group, index) => ({
      group,
      mouthPosition: fish.mouthPosition,
      getMouthPosition: (destination) =>
        getFishMouthPosition(group, fish.mouthPosition, destination),
      getFeedingOrigin: (destination) => {
        if (schoolActive)
          getSchoolRestPosition(index, rest, mobileView, destination);
        else destination.copy(rest);
        const scale = schoolActive
          ? getSchoolScale(index, mobileView)
          : displayScale;
        return destination.addScaledVector(scaledMouth, scale);
      },
      setMouthOpen: (amount) => setFishMouthOpen(group, amount),
    }));
  }
  let feedingActors = createFeedingActors();

  function setLayout(mobile: boolean) {
    if (disposed) return;
    // The rocks and feeding lanes move only when the layout crosses this breakpoint.
    if (mobileView !== mobile) feeding.reset();
    mobileView = mobile;
    rest.copy(environment.exitPosition);
    displayScale = mobile ? 0.8 : 1.14;
    fish.group.scale.copy(speciesScale).multiplyScalar(displayScale);
  }

  function selectSpecies(spec: FishSpecies): boolean {
    if (disposed || spec.id === selectedSpecies.id) return false;
    feeding.reset();
    const nextFish = createFish(spec);
    const nextSchool = createSchool(nextFish);
    // Every instance must leave the scene before its shared model resources are released.
    scene.remove(fish.group, ...school);
    fish.dispose();
    fish = nextFish;
    school = nextSchool;
    schoolMotion.reset();
    feedingActors = createFeedingActors();
    selectedSpecies = spec;
    speciesScale.copy(fish.group.scale);
    scaledMouth.copy(fish.mouthPosition).multiply(speciesScale);
    scene.add(fish.group);
    fish.update(0);
    shelter.reset();
    return true;
  }

  function toggleSchool(): boolean {
    if (disposed) return schoolActive;
    feeding.reset();
    schoolActive = !schoolActive;
    shelter.reset();
    schoolMotion.reset();
    school.forEach((group) => {
      group.visible = schoolActive;
    });
    return schoolActive;
  }

  function feed(camera: THREE.Camera): boolean {
    if (disposed) return false;
    const added = feeding.feed(feedingActors, camera);
    if (added && !schoolActive) shelter.reveal();
    return added;
  }

  function update(delta: number, elapsed: number, reducedMotion: boolean) {
    if (disposed) return;
    fish.update(elapsed);
    if (schoolActive) {
      const poses = schoolMotion.update(delta, {
        exit: rest,
        mobile: mobileView,
        feeding: feeding.count > 0,
        reducedMotion,
      });
      feedingActors.forEach(({ group }, index) => {
        const pose = poses[index];
        group.scale.copy(speciesScale).multiplyScalar(pose.scale);
        group.position.copy(pose.position);
        group.rotation.set(0, pose.yaw, pose.pitch, "YXZ");
        group.rotateX(Math.sin(elapsed * 0.6 + index * 1.7) * 0.018);
      });
      feeding.update(
        delta,
        feedingActors.filter((_, index) => poses[index].canFeed),
      );
    } else {
      const pose = shelter.update(delta, {
        shelter: environment.shelterPosition,
        exit: environment.exitPosition,
        route: environment.shelterRoute,
        feeding: feeding.count > 0,
        reducedMotion,
        mobile: mobileView,
      });
      fish.group.scale
        .copy(speciesScale)
        .multiplyScalar(displayScale * pose.scale);
      fish.group.position.copy(pose.position);
      fish.group.rotation.set(0, pose.yaw, pose.pitch, "YXZ");
      fish.group.rotateX(Math.sin(elapsed * 0.65) * 0.018);
      feeding.update(delta, pose.canFeed ? [feedingActors[0]] : []);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(fish.group, ...school);
    feeding.dispose();
    fish.dispose();
  }

  return {
    get selectedSpecies() {
      return selectedSpecies;
    },
    get schoolActive() {
      return schoolActive;
    },
    get canFeed() {
      return !disposed && feeding.canFeed;
    },
    setLayout,
    selectSpecies,
    toggleSchool,
    feed,
    update,
    resetFeeding: () => feeding.reset(),
    dispose,
  };
}
