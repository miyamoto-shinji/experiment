import * as THREE from "three";
import { createKrillModel } from "./krillModel";

export interface FeedingActor {
  group: THREE.Group;
  mouthPosition: THREE.Vector3;
  getMouthPosition?: (destination: THREE.Vector3) => THREE.Vector3;
  /** World-space mouth at this fish's own feeding position, even while it returns there. */
  getFeedingOrigin?: (destination: THREE.Vector3) => THREE.Vector3;
  setMouthOpen: (amount: number) => void;
}

interface Krill {
  group: THREE.Group;
  owner: FeedingActor;
  age: number;
  size: number;
  drift: number;
  claimed: boolean;
  swallowed: boolean;
}

interface Appetite {
  offset: THREE.Vector3;
  tilt: number;
  openness: number;
  target?: Krill;
  bite: number;
  biteOrigin: THREE.Vector3;
  cooldown: number;
}

const MAX_KRILL = 24;
const LIFETIME = 18;
const BITE_DURATION = 0.7;
const SWALLOW_DISTANCE = 0.28;

function findNearestFood(
  foods: Krill[],
  position: THREE.Vector3,
  actor: FeedingActor,
) {
  let target: Krill | undefined;
  let nearest = Infinity;
  for (const food of foods) {
    if (food.claimed || food.owner !== actor) continue;
    const distance = position.distanceToSquared(food.group.position);
    if (distance < nearest) {
      nearest = distance;
      target = food;
    }
  }
  return target;
}

/** Baseline swimming poses are set by the aquarium before each update. */
export function createFeeding(scene: THREE.Scene) {
  const model = createKrillModel();
  const krill: Krill[] = [];
  const appetites = new Map<FeedingActor, Appetite>();
  const mouth = new THREE.Vector3();
  const baseMouth = new THREE.Vector3();
  const swallowPoint = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const screen = new THREE.Vector3();
  let time = 0;

  function locateMouth(actor: FeedingActor, destination: THREE.Vector3) {
    if (actor.getMouthPosition) actor.getMouthPosition(destination);
    else destination.copy(actor.mouthPosition);
    actor.group.updateMatrixWorld(true);
    return destination.applyMatrix4(actor.group.matrixWorld);
  }

  function animateSwallow(actor: FeedingActor, state: Appetite, food: Krill) {
    const progress = Math.min(1, state.bite / BITE_DURATION);
    if (actor.getMouthPosition) actor.getMouthPosition(swallowPoint);
    else swallowPoint.copy(actor.mouthPosition);
    // The fish faces local -X. Follow the moving opening, then draw food behind the lips.
    swallowPoint.x +=
      SWALLOW_DISTANCE * THREE.MathUtils.smoothstep(progress, 0.2, 0.85);
    food.group.position
      .lerpVectors(
        state.biteOrigin,
        swallowPoint,
        THREE.MathUtils.smoothstep(progress, 0, 0.55),
      )
      .applyMatrix4(actor.group.matrixWorld);
    // Keep the shrimp recognizable while entering; it disappears only inside the mouth.
    food.group.scale.setScalar(
      food.size * (1 - THREE.MathUtils.smoothstep(progress, 0.55, 0.9)),
    );
    if (progress === 1) {
      removeFood(food);
      state.target = undefined;
      state.cooldown = 0.32;
    }
  }

  function removeFood(food: Krill) {
    scene.remove(food.group);
    const index = krill.indexOf(food);
    if (index !== -1) krill.splice(index, 1);
  }

  function reset() {
    krill.forEach((food) => scene.remove(food.group));
    krill.length = 0;
    appetites.forEach((_, actor) => actor.setMouthOpen(0));
    appetites.clear();
  }

  return {
    get count() {
      return krill.length;
    },
    get canFeed() {
      return krill.length < MAX_KRILL;
    },
    feed(actors: FeedingActor[], camera: THREE.Camera): boolean {
      const visible = actors.filter((actor) => actor.group.visible);
      if (!visible.length || krill.length >= MAX_KRILL) return false;
      const count = Math.min(MAX_KRILL - krill.length, visible.length + 2);
      for (let i = 0; i < count; i++) {
        const actor = visible[i % visible.length];
        const fishSize = actor.group.scale.y;
        const shrimp = model.group.clone(true);
        if (actor.getFeedingOrigin) actor.getFeedingOrigin(shrimp.position);
        else locateMouth(actor, shrimp.position);
        shrimp.position.x += (Math.random() - 0.65) * 0.8 * fishSize;
        // Similar, short approaches keep the large fish from crossing the upper school row.
        shrimp.position.y += 0.7 + Math.random() * 0.25 + fishSize * 0.2;
        // Keep new food inside the view even after orbiting or zooming in.
        screen.copy(shrimp.position).project(camera);
        screen.x = THREE.MathUtils.clamp(screen.x, -0.76, 0.7);
        screen.y = THREE.MathUtils.clamp(screen.y, -0.3, 0.78);
        shrimp.position.copy(screen.unproject(camera));
        const size = 0.17 + Math.random() * 0.035;
        shrimp.scale.setScalar(size);
        shrimp.rotation.set(
          0,
          Math.random() * Math.PI,
          (Math.random() - 0.5) * 0.7,
        );
        scene.add(shrimp);
        krill.push({
          group: shrimp,
          owner: actor,
          age: 0,
          size,
          drift: Math.random() * Math.PI * 2,
          claimed: false,
          swallowed: false,
        });
      }
      return true;
    },
    update(delta: number, actors: FeedingActor[]) {
      time += delta;
      const visible = new Set(actors.filter((actor) => actor.group.visible));
      appetites.forEach((state, actor) => {
        if (visible.has(actor)) return;
        if (state.target) {
          state.target.claimed = false;
          // A temporarily returning fish keeps its portion, including an interrupted bite.
          state.target.swallowed = false;
          state.target.group.scale.setScalar(state.target.size);
        }
        actor.setMouthOpen(0);
        appetites.delete(actor);
      });
      for (let i = krill.length - 1; i >= 0; i--) {
        const food = krill[i];
        food.age += delta;
        if (!food.owner.group.visible || food.age > LIFETIME) {
          removeFood(food);
          continue;
        }
        if (food.swallowed) continue;
        food.group.position.y -= delta * 0.24;
        food.group.position.x +=
          Math.sin(time * 1.5 + food.drift) * delta * 0.045;
        food.group.rotation.z = Math.sin(time * 1.7 + food.drift) * 0.3;
        food.group.rotation.y += delta * 0.18;
        food.group.scale.setScalar(
          food.size * Math.min(1, (LIFETIME - food.age) / 1.5),
        );
      }

      for (const actor of visible) {
        let state = appetites.get(actor);
        if (!state) {
          state = {
            offset: new THREE.Vector3(),
            tilt: 0,
            openness: 0,
            bite: 0,
            biteOrigin: new THREE.Vector3(),
            cooldown: 0,
          };
          appetites.set(actor, state);
        }
        const fishSize = actor.group.scale.y;
        // Aquarium swimming can reset the lead fish's jaw; restore this actor's own pose first.
        actor.setMouthOpen(state.openness);
        locateMouth(actor, baseMouth);
        baseMouth.add(state.offset);
        if (state.target && !krill.includes(state.target))
          state.target = undefined;
        state.cooldown = Math.max(0, state.cooldown - delta);
        if (!state.target && state.cooldown === 0) {
          state.target = findNearestFood(krill, baseMouth, actor);
          if (state.target) {
            state.target.claimed = true;
            state.bite = 0;
          }
        }

        const target = state.target;
        let open = 0;
        if (target) {
          if (!target.swallowed) {
            const tilt = THREE.MathUtils.clamp(
              -(target.group.position.y - baseMouth.y) * 0.19,
              -0.3,
              0.18,
            );
            state.tilt = THREE.MathUtils.damp(state.tilt, tilt, 3, delta);
          }
          actor.group.position.add(state.offset);
          actor.group.rotation.z += state.tilt;
          locateMouth(actor, mouth);
          if (!target.swallowed) {
            direction.copy(target.group.position).sub(mouth);
            const distance = direction.length();
            const approach = THREE.MathUtils.clamp(
              distance / (0.4 * fishSize),
              0.28,
              1,
            );
            const step = Math.min(
              distance,
              delta * (0.85 + fishSize * 0.25) * approach,
            );
            if (distance > 0) direction.multiplyScalar(step / distance);
            state.offset.add(direction);
            actor.group.position.add(direction);
            locateMouth(actor, mouth);
            const gap = mouth.distanceTo(target.group.position);
            open = THREE.MathUtils.smoothstep(
              0.65 * fishSize - gap,
              0,
              0.43 * fishSize,
            );
            if (gap < 0.13 * fishSize && state.openness > 0.8) {
              target.swallowed = true;
              state.bite = 0;
              state.biteOrigin.copy(target.group.position);
              actor.group.worldToLocal(state.biteOrigin);
            }
          }
          if (target.swallowed) {
            state.bite += delta;
            const progress = Math.min(1, state.bite / BITE_DURATION);
            open = 1 - THREE.MathUtils.smoothstep(progress, 0.55, 1);
          }
        } else {
          state.offset.multiplyScalar(Math.exp(-delta * 1.8));
          state.tilt = THREE.MathUtils.damp(state.tilt, 0, 3, delta);
          actor.group.position.add(state.offset);
          actor.group.rotation.z += state.tilt;
        }
        state.openness = THREE.MathUtils.damp(state.openness, open, 12, delta);
        actor.setMouthOpen(state.openness);
        if (target?.swallowed) animateSwallow(actor, state, target);
      }
    },
    reset,
    dispose() {
      reset();
      model.dispose();
    },
  };
}
