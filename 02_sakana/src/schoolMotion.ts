import * as THREE from "three";

/** All five fish use this formation; the single-fish view has its own controller. */
export const SCHOOL_MEMBERS = [
  { scale: 0.36 },
  { scale: 0.37 },
  { scale: 0.35 },
  { scale: 0.38 },
  { scale: 0.36 },
] as const;
const phases = [0, 1.1, 2.4, 3.6, 4.9];
const widths = [2.55, 2.62, 2.5, 2.58, 2.54];
const mobileWidths = [1.2, 1.3, 1.16, 1.28, 1.22];
// The two rear feeding slots need an extra gap for the rockfish's broad fins.
const mobileHeights = [0.98, 1.8, 2.62, 3.88, 4.7];
const DEPTH_CENTER = 6.4;
const depthRadii = [1.62, 1.72, 1.65, 1.7, 1.62];
const swimSpeeds = [0.48, 0.53, 0.57, 0.51, 0.55];
const RETURN_SECONDS = 3;
const TURN_SECONDS = 1.6;
const HOLD_SECONDS = 2;
const ease = (value: number) => value * value * (3 - 2 * value);
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

export function getSchoolScale(index: number, mobile: boolean): number {
  const member = SCHOOL_MEMBERS[index];
  if (!member) throw new RangeError("Unknown school member");
  return member.scale * (mobile ? 0.8 : 1);
}

export function getSchoolViewTarget(
  mobile: boolean,
  destination: THREE.Vector3,
): THREE.Vector3 {
  return destination.set(0, mobile ? 1 : 0.4, 6);
}

function routePoint(
  index: number,
  phase: number,
  mobile: boolean,
  destination: THREE.Vector3,
  direction?: THREE.Vector3,
) {
  const width = (mobile ? mobileWidths : widths)[index];
  const rise = mobile ? 0.22 : 0.2;
  const height = mobile ? mobileHeights[index] : -1.24 + index * 0.84;
  const depthRadius = depthRadii[index];
  destination.set(
    width * Math.sin(phase),
    height +
      rise * (0.8 * Math.sin(phase) + 0.1 * Math.sin(2 * phase + index * 0.7)),
    DEPTH_CENTER + depthRadius * Math.cos(phase),
  );
  direction?.set(
    width * Math.cos(phase),
    rise * (0.8 * Math.cos(phase) + 0.2 * Math.cos(2 * phase + index * 0.7)),
    -depthRadius * Math.sin(phase),
  );
  return destination;
}

/** Personal feeding positions stay distributed throughout the foreground water. */
export function getSchoolRestPosition(
  index: number,
  _exit: THREE.Vector3,
  mobile: boolean,
  destination: THREE.Vector3,
): THREE.Vector3 {
  if (!SCHOOL_MEMBERS[index]) throw new RangeError("Unknown school member");
  return routePoint(index, phases[index], mobile, destination);
}

export interface SchoolOptions {
  exit: THREE.Vector3;
  mobile: boolean;
  feeding: boolean;
  reducedMotion: boolean;
}
export interface SchoolPose {
  position: THREE.Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  scale: number;
  canFeed: boolean;
}

/** Separate, broad swimming circuits prevent the whole group gathering at one point. */
export function createSchoolMotion() {
  const poses: SchoolPose[] = SCHOOL_MEMBERS.map((member) => ({
    position: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    roll: 0,
    scale: member.scale,
    canFeed: false,
  }));
  const directions = poses.map(() => new THREE.Vector3());
  const starts = poses.map(() => new THREE.Vector3());
  const controlsA = poses.map(() => new THREE.Vector3());
  const controlsB = poses.map(() => new THREE.Vector3());
  const targets = poses.map(() => new THREE.Vector3());
  const turnFrom = new Float64Array(poses.length);
  const pitchFrom = new Float64Array(poses.length);
  const rollFrom = new Float64Array(poses.length);
  const lastExit = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  let initialized = false;
  let previousMobile = false;
  const swimPhases = new Float64Array(phases);
  let clock = 0;
  let modeTime = 0;
  let hold = 0;
  let mode: "swimming" | "returning" | "turning" | "feeding" | "resuming" =
    "swimming";

  function heading(pose: SchoolPose, direction: THREE.Vector3, delta?: number) {
    if (direction.lengthSq() < 1e-12) return;
    direction.normalize();
    const yaw = Math.atan2(direction.z, -direction.x);
    const turn = wrap(yaw - pose.yaw);
    const pitch = -Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
    pose.yaw +=
      delta === undefined
        ? turn
        : THREE.MathUtils.clamp(turn, -2.4 * delta, 2.4 * delta);
    pose.pitch +=
      delta === undefined
        ? pitch - pose.pitch
        : THREE.MathUtils.clamp(pitch - pose.pitch, -0.8 * delta, 0.8 * delta);
  }

  function placeAtRest(options: SchoolOptions) {
    poses.forEach((pose, index) => {
      getSchoolRestPosition(index, options.exit, options.mobile, pose.position);
      pose.scale = getSchoolScale(index, options.mobile);
      pose.yaw = 0;
      pose.pitch = 0;
      pose.roll = 0;
      pose.canFeed = true;
    });
  }

  function beginReturn(options: SchoolOptions) {
    mode = "returning";
    modeTime = 0;
    poses.forEach((pose, index) => {
      starts[index].copy(pose.position);
      getSchoolRestPosition(
        index,
        options.exit,
        options.mobile,
        targets[index],
      );
      const distance = pose.position.distanceTo(targets[index]);
      scratch.set(
        -Math.cos(pose.yaw) * Math.cos(pose.pitch),
        -Math.sin(pose.pitch),
        Math.sin(pose.yaw) * Math.cos(pose.pitch),
      );
      controlsA[index]
        .copy(pose.position)
        .addScaledVector(scratch, Math.min(0.45, distance * 0.25));
      controlsB[index].copy(targets[index]);
      controlsB[index].x += Math.min(0.4, distance * 0.25);
      // Keep every return in the same clear foreground water as the swimming routes.
      const low = DEPTH_CENTER - depthRadii[index];
      const high = DEPTH_CENTER + depthRadii[index];
      controlsA[index].z = THREE.MathUtils.clamp(controlsA[index].z, low, high);
      controlsB[index].z = THREE.MathUtils.clamp(controlsB[index].z, low, high);
    });
  }

  function reset() {
    initialized = false;
    swimPhases.set(phases);
    clock = 0;
  }

  function swimming(delta: number, options: SchoolOptions) {
    poses.forEach((pose, index) => {
      const angle = swimPhases[index];
      routePoint(index, angle, options.mobile, scratch, directions[index]);
      // Advancing by world distance keeps the fish moving steadily through broad turns.
      const speed =
        swimSpeeds[index] *
        (options.mobile ? 0.8 : 1) *
        (0.9 + Math.sin(clock * (0.13 + index * 0.008) + index) * 0.1);
      const rate = speed / directions[index].length();
      swimPhases[index] += delta * rate;
      const previousYaw = pose.yaw;
      routePoint(
        index,
        swimPhases[index],
        options.mobile,
        pose.position,
        directions[index],
      );
      heading(pose, directions[index]);
      if (delta > 0) {
        const yawRate = wrap(pose.yaw - previousYaw) / delta;
        const bank = THREE.MathUtils.clamp(-yawRate * 0.24, -0.12, 0.12);
        pose.roll = THREE.MathUtils.lerp(
          pose.roll,
          bank,
          1 - Math.exp(-delta * 3),
        );
      }
      pose.scale = getSchoolScale(index, options.mobile);
      pose.canFeed = false;
    });
  }

  function advance(delta: number, options: SchoolOptions) {
    clock += delta;
    modeTime += delta;
    if (mode === "swimming") {
      swimming(delta, options);
    } else if (mode === "returning") {
      const t = ease(Math.min(1, modeTime / RETURN_SECONDS));
      const s = 1 - t;
      poses.forEach((pose, index) => {
        pose.position
          .copy(starts[index])
          .multiplyScalar(s * s * s)
          .addScaledVector(controlsA[index], 3 * s * s * t)
          .addScaledVector(controlsB[index], 3 * s * t * t)
          .addScaledVector(targets[index], t * t * t);
        const direction = directions[index]
          .copy(controlsA[index])
          .sub(starts[index])
          .multiplyScalar(3 * s * s);
        scratch.copy(controlsB[index]).sub(controlsA[index]);
        direction.addScaledVector(scratch, 6 * s * t);
        scratch.copy(targets[index]).sub(controlsB[index]);
        direction.addScaledVector(scratch, 3 * t * t);
        heading(pose, direction, delta);
        pose.roll *= Math.exp(-delta * 3);
      });
      if (modeTime >= RETURN_SECONDS) {
        mode = "turning";
        modeTime = 0;
        poses.forEach((pose, index) => {
          pose.position.copy(targets[index]);
          turnFrom[index] = pose.yaw;
          pitchFrom[index] = pose.pitch;
          rollFrom[index] = pose.roll;
        });
      }
    } else if (mode === "turning" || mode === "resuming") {
      const t = ease(Math.min(1, modeTime / TURN_SECONDS));
      poses.forEach((pose, index) => {
        let targetYaw = 0,
          targetPitch = 0;
        if (mode === "resuming") {
          routePoint(
            index,
            phases[index],
            options.mobile,
            scratch,
            directions[index],
          );
          directions[index].normalize();
          targetYaw = Math.atan2(directions[index].z, -directions[index].x);
          targetPitch = -Math.asin(directions[index].y);
        }
        pose.yaw = turnFrom[index] + wrap(targetYaw - turnFrom[index]) * t;
        pose.pitch = THREE.MathUtils.lerp(pitchFrom[index], targetPitch, t);
        pose.roll = rollFrom[index] * (1 - t);
      });
      if (modeTime >= TURN_SECONDS) {
        mode = mode === "turning" ? "feeding" : "swimming";
        modeTime = 0;
        swimPhases.set(phases);
        hold = 0;
      }
    } else {
      placeAtRest(options);
      hold = options.feeding ? 0 : hold + delta;
      if (hold >= HOLD_SECONDS) {
        mode = "resuming";
        modeTime = 0;
        poses.forEach((pose, index) => {
          turnFrom[index] = pose.yaw;
          pitchFrom[index] = pose.pitch;
          rollFrom[index] = pose.roll;
        });
      }
    }
  }

  function update(delta: number, options: SchoolOptions): SchoolPose[] {
    const resized =
      initialized &&
      (previousMobile !== options.mobile || !lastExit.equals(options.exit));
    if (!initialized || resized) {
      placeAtRest(options);
      mode = options.feeding ? "feeding" : "swimming";
      modeTime = 0;
      swimPhases.set(phases);
      hold = 0;
      if (!options.feeding && !options.reducedMotion) swimming(0, options);
      initialized = true;
    }
    if (options.reducedMotion) {
      placeAtRest(options);
      mode = "feeding";
      hold = 0;
    } else {
      if (options.feeding && (mode === "swimming" || mode === "resuming"))
        beginReturn(options);
      let remaining = Number.isFinite(delta)
        ? THREE.MathUtils.clamp(delta, 0, 120)
        : 0;
      while (remaining > 1e-10) {
        const step = Math.min(remaining, 1 / 60);
        advance(step, options);
        remaining -= step;
      }
      poses.forEach((pose) => {
        pose.canFeed = mode === "feeding";
      });
    }
    previousMobile = options.mobile;
    lastExit.copy(options.exit);
    return poses;
  }
  return { reset, update };
}
