import * as THREE from "three";

export interface ShelterOptions {
  shelter: THREE.Vector3;
  exit: THREE.Vector3;
  feeding: boolean;
  reducedMotion: boolean;
  mobile?: boolean;
  route?: { approach: THREE.Vector3; gate: THREE.Vector3 };
}

export type SwimPhase =
  | "cruising"
  | "visiting"
  | "hidden"
  | "emerging"
  | "returning"
  | "feeding";

export interface ShelterPose {
  position: THREE.Vector3;
  scale: number;
  yaw: number;
  pitch: number;
  roll: number;
  canFeed: boolean;
  hidden: boolean;
  phase: SwimPhase;
}

const VISIT_AFTER = 42;
const HIDDEN_SECONDS = 0.8;
const RETURN_SECONDS = 5.4;
const EMERGE_SECONDS = 14;
const ease = (value: number) => value * value * (3 - 2 * value);
const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Continuous swimming with brief rock visits and an interruptible feeding rendezvous. */
export function createShelterMotion() {
  const pose: ShelterPose = {
    position: new THREE.Vector3(),
    scale: 1,
    yaw: 0,
    pitch: 0,
    roll: 0,
    canFeed: false,
    hidden: false,
    phase: "cruising",
  };
  type Stage = "approach" | "inward" | "corridor" | "outward" | "settling";
  interface Step {
    from: THREE.Vector3;
    to: THREE.Vector3;
    yawFrom: number;
    yawTo: number;
    pitchFrom: number;
    pitchTo: number;
    duration: number;
    stage: Stage;
    curve?: THREE.CubicBezierCurve3;
    progress?: number[];
    effort?: number;
  }
  const direction = new THREE.Vector3();
  const approach = new THREE.Vector3();
  const gate = new THREE.Vector3();
  const front = new THREE.Vector3();
  const lastExit = new THREE.Vector3();
  const lastShelter = new THREE.Vector3();
  const lastGate = new THREE.Vector3();
  let steps: Step[] = [];
  let stepIndex = 0;
  let stepTime = 0;
  let initialized = false;
  let requestFood = false;
  let phaseTime = 0;
  let mobile = false;
  let cruiseAngle = 0;
  let cruiseSpeed = 0;

  function enter(phase: SwimPhase) {
    pose.phase = phase;
    phaseTime = 0;
    if (phase === "cruising") {
      cruiseAngle = 0;
      cruiseSpeed = 0;
    }
  }

  function reset() {
    initialized = false;
    requestFood = false;
  }

  function reveal() {
    requestFood = true;
  }

  function readRoute(options: ShelterOptions) {
    approach.copy(options.route?.approach ?? options.exit);
    gate.copy(options.route?.gate ?? approach);
    if (!options.route) gate.z = options.shelter.z;
    // Turning happens in front of the banks or in the reserved rear corridor.
    front.copy(approach);
  }

  function beginTravel(
    phase: "visiting" | "emerging" | "returning",
    options: ShelterOptions,
  ) {
    const wasTravelling =
      pose.phase === "visiting" ||
      pose.phase === "emerging" ||
      pose.phase === "returning";
    const wasInward =
      steps[stepIndex]?.stage === "inward" &&
      pose.position.z < front.z - 0.01 &&
      pose.phase === "visiting";
    readRoute(options);
    enter(phase);
    steps = [];
    stepIndex = 0;
    stepTime = 0;
    let cursor = pose.position.clone();
    let yaw = pose.yaw,
      pitch = pose.pitch;

    function add(
      to: THREE.Vector3,
      nextYaw: number,
      nextPitch: number,
      seconds: number,
      stage: Stage,
    ) {
      const continuousYaw = yaw + wrapAngle(nextYaw - yaw);
      steps.push({
        from: cursor.clone(),
        to: to.clone(),
        yawFrom: yaw,
        yawTo: continuousYaw,
        pitchFrom: pitch,
        pitchTo: nextPitch,
        duration: Math.max(0.03, seconds),
        stage,
      });
      cursor.copy(to);
      yaw = continuousYaw;
      pitch = nextPitch;
    }

    function turn(nextYaw: number, nextPitch: number, stage: Stage) {
      const seconds = Math.max(
        Math.abs(wrapAngle(nextYaw - yaw)) / 2.4,
        Math.abs(nextPitch - pitch) / 1.2,
      );
      if (seconds > 0.001) add(cursor, nextYaw, nextPitch, seconds, stage);
    }

    function move(to: THREE.Vector3, stage: Stage) {
      direction.copy(to).sub(cursor);
      const distance = direction.length();
      if (distance < 0.00001) return;
      direction.divideScalar(distance);
      turn(
        Math.atan2(direction.z, -direction.x),
        THREE.MathUtils.clamp(-Math.asin(direction.y), -0.4, 0.4),
        stage,
      );
      add(to, yaw, pitch, distance / 4.5, stage);
    }

    function arrive(fromPassage: boolean) {
      const distance = cursor.distanceTo(options.exit);
      // Sub-pixel drift at startup needs no U-turn around a near-zero curve.
      if (distance < 0.001) {
        turn(0, 0, "settling");
        return;
      }
      // Face out of the passage while still behind the rocks. The final arc
      // bends into the next swimming heading without a stop-and-pivot at the front.
      if (fromPassage) turn(Math.PI / 2, 0, "corridor");
      const forward = new THREE.Vector3(
        -Math.cos(yaw) * Math.cos(pitch),
        -Math.sin(pitch),
        Math.sin(yaw) * Math.cos(pitch),
      );
      const handle = Math.min(distance * 0.45, fromPassage ? 3.4 : 0.45);
      const controlA = cursor.clone().addScaledVector(forward, handle);
      const controlB = options.exit.clone();
      controlB.x += Math.min(options.mobile ? 0.55 : 0.8, distance * 0.6);
      const curve = new THREE.CubicBezierCurve3(
        cursor.clone(),
        controlA,
        controlB,
        options.exit.clone(),
      );
      curve.arcLengthDivisions = 240;
      add(options.exit, 0, 0, curve.getLength() / 4.5, "outward");
      const step = steps[steps.length - 1];
      step.curve = curve;
      // Give tight turns more time rather than letting the head lag behind
      // the path. The fish keeps pointing where it actually swims.
      const progress = [0];
      const sample = new THREE.Vector3();
      const previous = curve.getPoint(0);
      let previousYaw = yaw,
        previousPitch = pitch;
      for (let i = 1; i <= 240; i++) {
        curve.getPoint(i / 240, sample);
        curve.getTangent(i / 240, direction);
        const sampleYaw = Math.atan2(direction.z, -direction.x);
        const samplePitch = -Math.asin(
          THREE.MathUtils.clamp(direction.y, -1, 1),
        );
        progress.push(
          progress[i - 1] +
            sample.distanceTo(previous) +
            Math.abs(wrapAngle(sampleYaw - previousYaw)) * 1.3 +
            Math.abs(samplePitch - previousPitch) * 0.8,
        );
        previous.copy(sample);
        previousYaw = sampleYaw;
        previousPitch = samplePitch;
      }
      const length = progress[progress.length - 1];
      step.progress = progress.map((value) => value / length);
      step.effort = length;
      step.duration = length / 4.5;
    }

    if (phase === "visiting") {
      move(front, "approach");
      move(gate, "inward");
      move(options.shelter, "corridor");
    } else {
      const behindBank = pose.position.z <= gate.z + 0.01;
      const inLane =
        wasTravelling &&
        pose.position.z < front.z - 0.01 &&
        Math.abs(pose.position.x - gate.x) < 0.01;
      if (wasInward) {
        // Never sweep the body sideways by making a U-turn between the banks.
        move(gate, "inward");
        arrive(true);
      } else if (behindBank) {
        move(gate, "corridor");
        arrive(true);
      } else if (inLane) {
        arrive(true);
      } else {
        arrive(false);
      }
    }
    const total = steps.reduce((sum, step) => sum + step.duration, 0);
    const budget =
      phase === "visiting" ? 7.4
      : phase === "emerging" ? EMERGE_SECONDS
      : RETURN_SECONDS;
    steps.forEach((step) => {
      step.duration *= budget / total;
      if (phase === "emerging") {
        // Smoothstep peaks at 1.5 times its average speed. Preserve a calm
        // approach even when a longer rear-corridor route used more time.
        const effort = step.effort ?? step.from.distanceTo(step.to);
        step.duration = Math.max(step.duration, (effort * 1.5) / 1.8);
      }
    });
  }

  function travel(delta: number, options: ShelterOptions) {
    let remaining = delta;
    while (remaining > 1e-10 && stepIndex < steps.length) {
      const step = steps[stepIndex];
      const consumed = Math.min(
        remaining,
        Math.max(0, step.duration - stepTime),
      );
      stepTime += consumed;
      remaining -= consumed;
      const amount = ease(Math.min(1, stepTime / step.duration));
      if (step.curve) {
        const progress = step.progress!;
        let low = 0,
          high = progress.length - 1;
        while (high - low > 1) {
          const middle = (low + high) >>> 1;
          if (progress[middle] < amount) low = middle;
          else high = middle;
        }
        const blend =
          (amount - progress[low]) / (progress[high] - progress[low]);
        const parameter = (low + blend) / (progress.length - 1);
        step.curve.getPoint(parameter, pose.position);
        step.curve.getTangent(parameter, direction).normalize();
        const yaw = Math.atan2(direction.z, -direction.x);
        const turn = wrapAngle(yaw - pose.yaw);
        pose.yaw += turn;
        pose.pitch = -Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
        const bank = THREE.MathUtils.clamp(
          consumed > 0 ? (-turn / consumed) * 0.08 : 0,
          -0.09,
          0.09,
        );
        pose.roll =
          THREE.MathUtils.lerp(pose.roll, bank, 1 - Math.exp(-consumed * 3)) *
          (1 - THREE.MathUtils.smoothstep(amount, 0.85, 1));
      } else {
        // The tight passage corners are turned upright behind the rock bank.
        pose.roll *= Math.exp(-consumed * 6);
        pose.position.lerpVectors(step.from, step.to, amount);
        pose.yaw = THREE.MathUtils.lerp(step.yawFrom, step.yawTo, amount);
        pose.pitch = THREE.MathUtils.lerp(step.pitchFrom, step.pitchTo, amount);
      }
      if (stepTime >= step.duration) {
        pose.position.copy(step.to);
        stepTime = 0;
        stepIndex++;
      }
    }
    if (stepIndex >= steps.length) {
      if (pose.phase === "visiting") {
        pose.position.copy(options.shelter);
        enter("hidden");
      } else {
        const recalled = pose.phase === "returning";
        stableExit(options);
        enter(recalled ? "feeding" : "cruising");
      }
    }
  }

  function orient(delta: number, faceExit = false) {
    let yaw = 0,
      pitch = 0;
    if (!faceExit && direction.lengthSq() > 1e-10) {
      direction.normalize();
      yaw = Math.atan2(direction.z, -direction.x);
      pitch = THREE.MathUtils.clamp(-Math.asin(direction.y), -0.4, 0.4);
    }
    const turn = wrapAngle(yaw - pose.yaw);
    pose.yaw += THREE.MathUtils.clamp(turn, -2.4 * delta, 2.4 * delta);
    pose.pitch += THREE.MathUtils.clamp(
      pitch - pose.pitch,
      -1.2 * delta,
      1.2 * delta,
    );
  }

  function stableExit(options: ShelterOptions) {
    pose.position.copy(options.exit);
    pose.yaw = 0;
    pose.pitch = 0;
    pose.roll = 0;
    pose.scale = 1;
  }

  function cruise(options: ShelterOptions, delta: number) {
    // The full-size fish follows the clear central water, rising as it recedes.
    // Parameter speed follows world distance; tighter turns slow before the apex.
    const width = options.mobile ? 0.45 : 0.85;
    const bias = 0.1;
    const depth = 1.3;
    const rise = 0.3;
    const tangent = (theta: number) =>
      direction.set(
        -width * Math.cos(theta) - bias * Math.sin(theta),
        rise * Math.sin(theta),
        -depth * Math.sin(theta),
      );
    tangent(cruiseAngle);
    const length = direction.length();
    const yawPerAngle =
      (depth * width) / (direction.x * direction.x + direction.z * direction.z);
    const turnSpeed = (0.65 * length) / yawPerAngle;
    const openSpeed = options.mobile ? 0.26 : 0.32;
    // Blend the limits before the turn, leaving room for a gradual deceleration.
    const targetSpeed =
      (openSpeed * turnSpeed) / Math.hypot(openSpeed, turnSpeed);
    cruiseSpeed += THREE.MathUtils.clamp(
      targetSpeed - cruiseSpeed,
      -0.18 * delta,
      0.12 * delta,
    );
    cruiseSpeed = Math.min(cruiseSpeed, turnSpeed);
    const midpoint = cruiseAngle + (cruiseSpeed * delta) / (2 * length);
    cruiseAngle += (cruiseSpeed * delta) / tangent(midpoint).length();
    const theta = cruiseAngle;
    pose.position.set(
      options.exit.x - width * Math.sin(theta) - bias * (1 - Math.cos(theta)),
      options.exit.y + rise * (1 - Math.cos(theta)),
      options.exit.z - depth * (1 - Math.cos(theta)),
    );
    tangent(theta);
    const previousYaw = pose.yaw;
    orient(delta);
    const yawSpeed = delta > 0 ? wrapAngle(pose.yaw - previousYaw) / delta : 0;
    const bank = THREE.MathUtils.clamp(-yawSpeed * 0.12, -0.09, 0.09);
    pose.roll = THREE.MathUtils.lerp(pose.roll, bank, 1 - Math.exp(-delta * 3));
    // Only perspective changes the apparent size during open-water swimming.
    pose.scale = 1;
  }

  function advance(delta: number, options: ShelterOptions) {
    phaseTime += delta;
    if (pose.phase === "cruising") {
      cruise(options, delta);
      if (phaseTime >= VISIT_AFTER) beginTravel("visiting", options);
    } else if (pose.phase === "feeding") {
      stableExit(options);
      if (options.feeding || requestFood) phaseTime = 0;
      else if (phaseTime >= 2) enter("cruising");
    } else if (pose.phase === "hidden") {
      pose.position.copy(options.shelter);
      orient(delta, true);
      if (phaseTime >= HIDDEN_SECONDS) beginTravel("emerging", options);
    } else travel(delta, options);
  }

  function update(delta: number, options: ShelterOptions): ShelterPose {
    if (!initialized) {
      stableExit(options);
      enter("cruising");
      lastExit.copy(options.exit);
      lastShelter.copy(options.shelter);
      readRoute(options);
      lastGate.copy(gate);
      mobile = !!options.mobile;
      initialized = true;
    }
    if (options.reducedMotion) {
      stableExit(options);
      enter("feeding");
    } else {
      readRoute(options);
      const resized =
        !lastExit.equals(options.exit) ||
        !lastShelter.equals(options.shelter) ||
        !lastGate.equals(gate) ||
        mobile !== !!options.mobile;
      const recall = options.feeding || requestFood;
      if (recall && pose.phase !== "returning" && pose.phase !== "feeding") {
        if (
          pose.position.distanceToSquared(options.exit) < 1e-10 &&
          Math.abs(wrapAngle(pose.yaw)) < 1e-6
        )
          enter("feeding");
        else beginTravel("returning", options);
      } else if (resized) {
        beginTravel(recall ? "returning" : "emerging", options);
      }
      // Bounded substeps keep turns smooth even after a delayed animation frame.
      let remaining = Number.isFinite(delta)
        ? THREE.MathUtils.clamp(delta, 0, 120)
        : 0;
      while (remaining > 1e-10) {
        const step = Math.min(remaining, 1 / 60);
        advance(step, options);
        remaining -= step;
      }
    }
    lastExit.copy(options.exit);
    lastShelter.copy(options.shelter);
    readRoute(options);
    lastGate.copy(gate);
    mobile = !!options.mobile;
    requestFood = false;
    pose.canFeed = pose.phase === "feeding";
    pose.hidden = pose.phase === "hidden";
    return pose;
  }

  return { reset, reveal, update };
}
