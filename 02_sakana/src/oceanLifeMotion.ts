import * as THREE from "three";

export interface OceanLifePose {
  position: THREE.Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  scale: number;
  visible: boolean;
}

// These pockets are open water behind the actual left bank, not inside its mesh.
// The mobile bank moves 1.2 units to the right in oceanEnvironment.resize().
export const OCEAN_LIFE_SMALL_ROUTES = [
  {
    x: -5.8,
    y: -1.7,
    z: -3.9,
    width: 1.36,
    depth: 0.38,
    rise: 0.25,
    mobileRise: 1.2,
    scale: 0.34,
    period: 18,
    delay: 0.1,
  },
  {
    x: -5.95,
    y: -1.2,
    z: -4.8,
    width: 1.36,
    depth: 0.38,
    rise: 0.25,
    mobileRise: 1.12,
    scale: 0.31,
    period: 19,
    delay: 0.5,
  },
  {
    x: -6.4,
    y: -1.55,
    z: -5.65,
    width: 1.55,
    depth: 0.4,
    rise: 0.32,
    mobileRise: 1.18,
    scale: 0.36,
    period: 20,
    delay: 0.85,
  },
] as const;

export const OCEAN_LIFE_LARGE_ROUTE = {
  halfSpan: 42,
  y: 4.2,
  z: -18,
  scale: 2.4,
  firstStart: 16,
  firstDuration: 26,
  warning: 6,
  recovery: 2,
} as const;

const TAU = Math.PI * 2;
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** A full loop leaves and returns to the same occluded pocket with a smooth tangent. */
export function getOceanLifeSmallPoint(
  index: number,
  phase: number,
  mobile: boolean,
  destination: THREE.Vector3,
  tangent?: THREE.Vector3,
): THREE.Vector3 {
  const route = OCEAN_LIFE_SMALL_ROUTES[index];
  if (!route) throw new RangeError("Unknown ambient fish");
  const sin = Math.sin(phase),
    cos = Math.cos(phase);
  const rise = mobile ? route.mobileRise : route.rise;
  destination.set(
    route.x + (mobile ? 1.2 : 0) + route.width * (1 - cos),
    route.y + rise * (1 - cos),
    route.z + route.depth * sin,
  );
  tangent?.set(route.width * sin, rise * sin, route.depth * cos);
  return destination;
}

/** Independent background life: species changes never reset this controller. */
export function createOceanLifeMotion() {
  const makePose = (scale: number): OceanLifePose => ({
    position: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    roll: 0,
    scale,
    visible: true,
  });
  const small = OCEAN_LIFE_SMALL_ROUTES.map((route) => makePose(route.scale));
  const large = makePose(OCEAN_LIFE_LARGE_ROUTE.scale);
  large.visible = false;
  large.position.set(42, OCEAN_LIFE_LARGE_ROUTE.y, OCEAN_LIFE_LARGE_ROUTE.z);
  const result = { small, large, time: 0, encounter: false };
  const phases = new Float64Array(small.length);
  const rates = new Float64Array(small.length);
  const waiting = new Float64Array(OCEAN_LIFE_SMALL_ROUTES.map((r) => r.delay));
  const swimming = small.map(() => false);
  const tangent = new THREE.Vector3();
  let largeStart: number = OCEAN_LIFE_LARGE_ROUTE.firstStart;
  let largeDuration: number = OCEAN_LIFE_LARGE_ROUTE.firstDuration;
  let direction = 1;
  let refugeUntil = 0;
  let seed = 741923;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  function face(pose: OceanLifePose, vector: THREE.Vector3, delta: number) {
    const yaw = Math.atan2(vector.z, -vector.x);
    const turn = wrap(yaw - pose.yaw);
    pose.yaw += turn;
    pose.pitch = -Math.atan2(vector.y, Math.hypot(vector.x, vector.z));
    const bank =
      delta > 0 ? THREE.MathUtils.clamp((-turn / delta) * 0.07, -0.1, 0.1) : 0;
    pose.roll = THREE.MathUtils.damp(pose.roll, bank, 4, delta);
  }

  function placeSmall(mobile: boolean, delta: number) {
    small.forEach((pose, index) => {
      getOceanLifeSmallPoint(
        index,
        phases[index],
        mobile,
        pose.position,
        tangent,
      );
      face(pose, tangent, delta);
      // The depth buffer, rather than a visibility switch, hides returning fish.
      pose.visible = true;
    });
  }

  function advance(delta: number, mobile: boolean) {
    result.time += delta;
    if (result.time > largeStart + largeDuration) {
      const end = largeStart + largeDuration;
      refugeUntil = end + OCEAN_LIFE_LARGE_ROUTE.recovery;
      largeStart = end + 40 + random() * 25;
      largeDuration = 24 + random() * 4;
      direction *= -1;
    }
    result.encounter =
      result.time >= largeStart - OCEAN_LIFE_LARGE_ROUTE.warning ||
      result.time < refugeUntil;

    small.forEach((_, index) => {
      const route = OCEAN_LIFE_SMALL_ROUTES[index];
      if (!swimming[index]) {
        if (result.encounter) {
          // Stagger the cautious return to open water after the visitor is gone.
          waiting[index] = result.time + 0.5 + index * 0.4;
        } else if (result.time >= waiting[index]) {
          swimming[index] = true;
          phases[index] = 0;
          rates[index] = 0;
        }
      }
      if (!swimming[index]) return;
      // Complete the existing loop when startled; never reverse or cut through rock.
      const targetRate = result.encounter ? 1.25 : TAU / route.period;
      rates[index] = THREE.MathUtils.damp(rates[index], targetRate, 3, delta);
      phases[index] += rates[index] * delta;
      if (phases[index] >= TAU) {
        phases[index] = 0;
        swimming[index] = false;
        rates[index] = 0;
        waiting[index] = result.time + 2.2 + index * 0.7 + random() * 2.2;
      }
    });
    placeSmall(mobile, delta);

    const progress = (result.time - largeStart) / largeDuration;
    large.visible = progress >= 0 && progress <= 1;
    if (large.visible) {
      const angle = Math.PI * progress;
      large.position.set(
        direction * OCEAN_LIFE_LARGE_ROUTE.halfSpan * (1 - 2 * progress),
        OCEAN_LIFE_LARGE_ROUTE.y + 0.22 * Math.sin(angle),
        OCEAN_LIFE_LARGE_ROUTE.z + 1.5 * Math.sin(angle),
      );
      tangent.set(
        -direction * 2 * OCEAN_LIFE_LARGE_ROUTE.halfSpan,
        0.22 * Math.PI * Math.cos(angle),
        1.5 * Math.PI * Math.cos(angle),
      );
      face(large, tangent, delta);
    }
  }

  function update(delta: number, mobile: boolean, reducedMotion: boolean) {
    let remaining =
      reducedMotion || !Number.isFinite(delta)
        ? 0
        : THREE.MathUtils.clamp(delta, 0, 120);
    if (remaining === 0) placeSmall(mobile, 0);
    while (remaining > 1e-10) {
      const step = Math.min(remaining, 1 / 60);
      advance(step, mobile);
      remaining -= step;
    }
    return result;
  }

  placeSmall(false, 0);
  return { update };
}
