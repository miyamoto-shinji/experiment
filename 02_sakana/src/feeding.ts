import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export interface FeedingActor {
  group: THREE.Group;
  mouthPosition: THREE.Vector3;
  setMouthOpen: (amount: number) => void;
}

interface Krill {
  group: THREE.Group;
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
  cooldown: number;
}

const MAX_KRILL = 24;
const LIFETIME = 18;
const BITE_DURATION = 0.65;

/** A shared, small coral-pink crustacean: curved segments, tail fan and antennae. */
function createKrillModel() {
  const group = new THREE.Group();
  group.name = "krill";
  const shell = new THREE.MeshBasicMaterial({ color: "#f3ac95" });
  const eyes = new THREE.MeshBasicMaterial({ color: "#412e38" });
  const feelers = new THREE.LineBasicMaterial({ color: "#ffe1c9" });
  const segments: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const segment = new THREE.SphereGeometry(1, 10, 8);
    const size = 0.16 * (1 - t * 0.65);
    segment.scale(size * 1.1, size, size * 0.7);
    segment.translate(0.33 - t * 0.8, Math.sin(t * Math.PI) * 0.13, 0);
    segments.push(segment);
  }
  const tail = new THREE.ConeGeometry(0.15, 0.22, 3);
  tail.rotateZ(-Math.PI / 2);
  tail.scale(1, 1, 0.45);
  tail.translate(-0.53, -0.02, 0);
  segments.push(tail);
  const geometry = mergeGeometries(segments)!;
  segments.forEach((segment) => segment.dispose());
  group.add(new THREE.Mesh(geometry, shell));
  const eyeParts = [-1, 1].map((side) => {
    const eye = new THREE.SphereGeometry(0.038, 8, 6);
    eye.translate(0.39, 0.075, side * 0.11);
    return eye;
  });
  const eyeGeometry = mergeGeometries(eyeParts)!;
  eyeParts.forEach((eye) => eye.dispose());
  group.add(new THREE.Mesh(eyeGeometry, eyes));
  const lines = [
    0.43, 0.07, 0.04, 0.68, 0.28, 0.05,
    0.68, 0.28, 0.05, 0.83, 0.25, 0.06,
    0.43, 0.04, -0.04, 0.71, 0.13, -0.05,
    0.71, 0.13, -0.05, 0.85, 0.07, -0.06,
  ];
  for (let i = 0; i < 4; i++) {
    const x = 0.2 - i * 0.14;
    lines.push(x, 0.02, 0, x - 0.11, -0.18, 0.04);
  }
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
  group.add(new THREE.LineSegments(lineGeometry, feelers));
  return {
    group,
    dispose() {
      geometry.dispose();
      eyeGeometry.dispose();
      lineGeometry.dispose();
      shell.dispose();
      eyes.dispose();
      feelers.dispose();
    },
  };
}

/** Baseline swimming poses are set by the aquarium before each update. */
export function createFeeding(scene: THREE.Scene) {
  const model = createKrillModel();
  const krill: Krill[] = [];
  const appetites = new Map<FeedingActor, Appetite>();
  const mouth = new THREE.Vector3();
  const baseMouth = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const screen = new THREE.Vector3();
  let time = 0;

  function locateMouth(actor: FeedingActor, destination: THREE.Vector3) {
    actor.group.updateMatrixWorld(true);
    return destination.copy(actor.mouthPosition).applyMatrix4(actor.group.matrixWorld);
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
    get count() { return krill.length; },
    get canFeed() { return krill.length < MAX_KRILL; },
    feed(actors: FeedingActor[], camera: THREE.Camera): boolean {
      const visible = actors.filter((actor) => actor.group.visible);
      if (!visible.length || krill.length >= MAX_KRILL) return false;
      const count = Math.min(MAX_KRILL - krill.length, visible.length + 2);
      for (let i = 0; i < count; i++) {
        const actor = visible[i % visible.length];
        const fishSize = actor.group.scale.y;
        const shrimp = model.group.clone(true);
        locateMouth(actor, shrimp.position);
        shrimp.position.x += (Math.random() - 0.65) * 0.8 * fishSize;
        shrimp.position.y += (1.65 + Math.random() * 0.8) * fishSize;
        // Keep new food inside the view even after orbiting or zooming in.
        screen.copy(shrimp.position).project(camera);
        screen.x = THREE.MathUtils.clamp(screen.x, -0.76, 0.7);
        screen.y = THREE.MathUtils.clamp(screen.y, -0.3, 0.78);
        shrimp.position.copy(screen.unproject(camera));
        const size = 0.17 + Math.random() * 0.035;
        shrimp.scale.setScalar(size);
        shrimp.rotation.set(0, Math.random() * Math.PI, (Math.random() - 0.5) * 0.7);
        scene.add(shrimp);
        krill.push({
          group: shrimp, age: 0, size,
          drift: Math.random() * Math.PI * 2, claimed: false, swallowed: false,
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
          if (state.target.swallowed) removeFood(state.target);
        }
        actor.setMouthOpen(0);
        appetites.delete(actor);
      });
      for (let i = krill.length - 1; i >= 0; i--) {
        const food = krill[i];
        food.age += delta;
        if (food.age > LIFETIME) { removeFood(food); continue; }
        if (food.swallowed) continue;
        food.group.position.y -= delta * 0.24;
        food.group.position.x += Math.sin(time * 1.5 + food.drift) * delta * 0.045;
        food.group.rotation.z = Math.sin(time * 1.7 + food.drift) * 0.3;
        food.group.rotation.y += delta * 0.18;
        food.group.scale.setScalar(food.size * Math.min(1, (LIFETIME - food.age) / 1.5));
      }

      for (const actor of visible) {
        let state = appetites.get(actor);
        if (!state) {
          state = { offset: new THREE.Vector3(), tilt: 0, openness: 0, bite: 0, cooldown: 0 };
          appetites.set(actor, state);
        }
        const fishSize = actor.group.scale.y;
        locateMouth(actor, baseMouth);
        if (state.target && !krill.includes(state.target)) state.target = undefined;
        state.cooldown = Math.max(0, state.cooldown - delta);
        if (!state.target && state.cooldown === 0) {
          let nearest = Infinity;
          for (const food of krill) {
            if (food.claimed) continue;
            const distance = baseMouth.distanceToSquared(food.group.position);
            if (distance < nearest) { nearest = distance; state.target = food; }
          }
          if (state.target) { state.target.claimed = true; state.bite = 0; }
        }

        const target = state.target;
        let open = 0;
        if (target) {
          const tilt = THREE.MathUtils.clamp(-(target.group.position.y - baseMouth.y) * 0.19, -0.3, 0.18);
          state.tilt = THREE.MathUtils.damp(state.tilt, tilt, 3, delta);
          actor.group.position.add(state.offset);
          actor.group.rotation.z += state.tilt;
          locateMouth(actor, mouth);
          if (!target.swallowed) {
            direction.copy(target.group.position).sub(mouth);
            const distance = direction.length();
            const step = Math.min(distance, delta * (0.85 + fishSize * 0.25));
            if (distance > 0) direction.multiplyScalar(step / distance);
            state.offset.add(direction);
            actor.group.position.add(direction);
            locateMouth(actor, mouth);
            const gap = mouth.distanceTo(target.group.position);
            open = THREE.MathUtils.smoothstep(0.65 * fishSize - gap, 0, 0.43 * fishSize);
            if (gap < 0.13 * fishSize && state.openness > 0.8) {
              target.swallowed = true;
              state.bite = 0;
            }
          }
          if (target.swallowed) {
            state.bite += delta;
            const progress = Math.min(1, state.bite / BITE_DURATION);
            open = 1 - THREE.MathUtils.smoothstep(progress, 0.4, 1);
            // Draw the morsel into the opening, then close the jaw around it.
            direction.set(0.2 * progress, 0, 0).transformDirection(actor.group.matrixWorld);
            target.group.position.lerp(mouth, Math.min(1, delta * 18));
            target.group.position.addScaledVector(direction, progress * 0.015);
            target.group.scale.setScalar(target.size * (1 - THREE.MathUtils.smoothstep(progress, 0.15, 0.8)));
            if (progress === 1) {
              removeFood(target);
              state.target = undefined;
              state.cooldown = 0.32;
            }
          }
        } else {
          state.offset.multiplyScalar(Math.exp(-delta * 1.8));
          state.tilt = THREE.MathUtils.damp(state.tilt, 0, 3, delta);
          actor.group.position.add(state.offset);
          actor.group.rotation.z += state.tilt;
        }
        state.openness = THREE.MathUtils.damp(state.openness, open, 12, delta);
        actor.setMouthOpen(state.openness);
      }
    },
    reset,
    dispose() { reset(); model.dispose(); },
  };
}
