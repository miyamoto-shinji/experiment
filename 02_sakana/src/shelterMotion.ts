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
  "cruising" | "visiting" | "hidden" | "emerging" | "returning" | "feeding";

export interface ShelterPose {
  position: THREE.Vector3;
  scale: number;
  yaw: number;
  pitch: number;
  canFeed: boolean;
  hidden: boolean;
  phase: SwimPhase;
}

const HIDDEN_SCALE = 0.65;
const VISIT_AFTER = 42;
const HIDDEN_SECONDS = 0.8;
const RETURN_SECONDS = 5.4;
const ease = (value: number) => value * value * (3 - 2 * value);
const wrapAngle = (angle: number) =>
  Math.atan2(Math.sin(angle), Math.cos(angle));

/** Continuous swimming with brief rock visits and an interruptible feeding rendezvous. */
export function createShelterMotion() {
  const pose: ShelterPose = {
    position: new THREE.Vector3(),
    scale: 1,
    yaw: 0,
    pitch: 0,
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
    scaleFrom: number;
    scaleTo: number;
    duration: number;
    stage: Stage;
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

  function enter(phase: SwimPhase) {
    pose.phase = phase;
    phaseTime = 0;
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
    let scale = pose.scale;

    function add(
      to: THREE.Vector3,
      nextYaw: number,
      nextPitch: number,
      nextScale: number,
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
        scaleFrom: scale,
        scaleTo: nextScale,
        duration: Math.max(0.03, seconds),
        stage,
      });
      cursor.copy(to);
      yaw = continuousYaw;
      pitch = nextPitch;
      scale = nextScale;
    }

    function turn(nextYaw: number, nextPitch: number, stage: Stage) {
      const seconds = Math.max(
        Math.abs(wrapAngle(nextYaw - yaw)) / 2.4,
        Math.abs(nextPitch - pitch) / 1.2,
      );
      if (seconds > 0.001)
        add(cursor, nextYaw, nextPitch, scale, seconds, stage);
    }

    function move(to: THREE.Vector3, stage: Stage, faceTravel = true) {
      direction.copy(to).sub(cursor);
      const distance = direction.length();
      if (distance < 0.00001) return;
      direction.divideScalar(distance);
      if (faceTravel)
        turn(
          Math.atan2(direction.z, -direction.x),
          THREE.MathUtils.clamp(-Math.asin(direction.y), -0.4, 0.4),
          stage,
        );
      add(to, yaw, pitch, scale, distance / 4.5, stage);
    }

    if (phase === "visiting") {
      // Shrink the visiting fish before it enters the narrow passage.
      add(cursor, yaw, pitch, HIDDEN_SCALE, 0.65, "approach");
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
        move(front, "outward");
      } else if (behindBank) {
        move(gate, "corridor");
        move(front, "outward");
      } else if (inLane) {
        move(front, "outward");
      } else {
        // Open-water recalls prepare before reaching the front staging point.
        add(cursor, yaw, pitch, HIDDEN_SCALE, 0.4, "approach");
        move(front, "approach");
      }
      turn(0, 0, "settling");
      move(options.exit, "settling", false);
      add(cursor, 0, 0, 1, 0.55, "settling");
    }
    const total = steps.reduce((sum, step) => sum + step.duration, 0);
    const budget = phase === "visiting" ? 7.4 : RETURN_SECONDS;
    steps.forEach((step) => {
      step.duration *= budget / total;
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
      pose.position.lerpVectors(step.from, step.to, amount);
      pose.yaw = THREE.MathUtils.lerp(step.yawFrom, step.yawTo, amount);
      pose.pitch = THREE.MathUtils.lerp(step.pitchFrom, step.pitchTo, amount);
      pose.scale = THREE.MathUtils.lerp(step.scaleFrom, step.scaleTo, amount);
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
    pose.scale = 1;
  }

  function cruise(options: ShelterOptions, delta: number) {
    // A slow oval in depth avoids abrupt direction changes at the screen edges.
    const time = Math.max(0, phaseTime - 3);
    const ramp = Math.min(time / 3, 1);
    const theta = (time - (time < 3 ? time * (1 - ramp / 2) : 1.5)) * 0.2;
    const width = options.mobile ? 0.58 : 1.35;
    const bias = options.mobile ? 0.04 : 0.25;
    const depth = options.mobile ? 0.62 : 0.82;
    const rise = options.mobile ? 0.15 : 0.3;
    pose.position.set(
      options.exit.x - width * Math.sin(theta) - bias * (1 - Math.cos(theta)),
      options.exit.y +
        rise * Math.sin(theta * 2) +
        rise * 0.45 * Math.sin(theta),
      options.exit.z - depth * (1 - Math.cos(theta)),
    );
    direction.set(
      -width * Math.cos(theta) - bias * Math.sin(theta),
      2 * rise * Math.cos(theta * 2) + rise * 0.45 * Math.cos(theta),
      -depth * Math.sin(theta),
    );
    if (time === 0) direction.set(-1, 0, 0);
    orient(delta);
    pose.scale = 1 - (0.1 * (1 - Math.cos(theta))) / 2;
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
