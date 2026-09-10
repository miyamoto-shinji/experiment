import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { OBB } from "three/addons/math/OBB.js";
import { createServer } from "vite";

const gradient = { addColorStop() {} };
const context = new Proxy(
  {},
  {
    get: (_, key) =>
      key === "createLinearGradient" || key === "createRadialGradient"
        ? () => gradient
        : () => {},
  },
);
globalThis.document = {
  createElement(tag) {
    assert.equal(tag, "canvas");
    return { width: 0, height: 0, getContext: () => context };
  },
};
const server = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});

try {
  const {
    SCHOOL_MEMBERS,
    createSchoolMotion,
    getSchoolRestPosition,
    getSchoolScale,
    getSchoolViewTarget,
  } = await server.ssrLoadModule("/src/schoolMotion.ts");
  const { createFish } = await server.ssrLoadModule("/src/fish/createFish.ts");
  const { species } = await server.ssrLoadModule("/src/fish/species.ts");
  assert.equal(
    SCHOOL_MEMBERS.length,
    5,
    "Every fish in the group must use the school controller",
  );

  // Fit oriented bounds to actual skin/body geometry; fin-to-rock clearance is checked separately.
  const vertex = new THREE.Vector3();
  const bodyBounds = Object.values(species).map((spec) => {
    const fish = createFish(spec);
    const bounds = new THREE.Box3();
    fish.group.updateMatrixWorld(true);
    fish.group.traverse((object) => {
      if (!object.geometry || !object.material?.map) return;
      const positions = object.geometry.getAttribute("position");
      for (let index = 0; index < positions.count; index++) {
        vertex
          .fromBufferAttribute(positions, index)
          .applyMatrix4(object.matrixWorld);
        bounds.expandByPoint(vertex);
      }
    });
    assert.ok(!bounds.isEmpty(), `${spec.id}: no body geometry was measured`);
    const box = new OBB().fromBox3(bounds);
    box.halfSize.z += 0.12; // Tail bending also deforms the rear of the body.
    fish.dispose();
    return { id: spec.id, box, actors: SCHOOL_MEMBERS.map(() => new OBB()) };
  });
  const target = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  const scale = new THREE.Vector3();
  const matrices = SCHOOL_MEMBERS.map(() => new THREE.Matrix4());
  const snapshot = (poses) =>
    poses.map((pose) => ({ ...pose, position: pose.position.clone() }));
  const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

  function checkBodies(poses, label) {
    poses.forEach((pose, index) => {
      assert.ok(
        [...pose.position.toArray(), pose.yaw, pose.pitch, pose.scale].every(
          Number.isFinite,
        ),
      );
      quaternion.setFromEuler(euler.set(0, pose.yaw, pose.pitch));
      matrices[index].compose(
        pose.position,
        quaternion,
        scale.setScalar(pose.scale),
      );
    });
    for (const model of bodyBounds) {
      model.actors.forEach((box, index) =>
        box.copy(model.box).applyMatrix4(matrices[index]),
      );
      for (let a = 0; a < poses.length; a++)
        for (let b = a + 1; b < poses.length; b++) {
          assert.ok(
            !model.actors[a].intersectsOBB(model.actors[b]),
            `${label}/${model.id}: fish ${a} and ${b} bodies overlap`,
          );
        }
    }
  }
  function checkRest(poses, options) {
    poses.forEach((pose, index) => {
      assert.equal(
        getSchoolRestPosition(index, options.exit, options.mobile, target),
        target,
      );
      assert.ok(
        pose.position.equals(target),
        "A feeding fish left its personal slot",
      );
      assert.equal(pose.scale, getSchoolScale(index, options.mobile));
      assert.ok(Math.abs(wrap(pose.yaw)) < 1e-8);
      assert.ok(Math.abs(pose.pitch) < 1e-8);
      assert.equal(pose.canFeed, true);
    });
  }
  function advance(motion, seconds, options, label = "transition") {
    const frames = Math.ceil(seconds * 60);
    let poses = motion.update(0, options);
    let previous = snapshot(poses);
    for (let frame = 0; frame < frames; frame++) {
      poses = motion.update(seconds / frames, options);
      checkBodies(poses, `${label}/${frame}`);
      poses.forEach((pose, index) => {
        assert.ok(
          pose.position.distanceTo(previous[index].position) < 0.15,
          `${label}: position jumped`,
        );
        assert.ok(
          Math.abs(wrap(pose.yaw - previous[index].yaw)) < 0.07,
          `${label}: heading flipped`,
        );
      });
      previous = snapshot(poses);
    }
    return poses;
  }

  for (const mobile of [false, true]) {
    const options = {
      exit: new THREE.Vector3(mobile ? -0.5 : 0.2, mobile ? 1.1 : 0.25, 0),
      mobile,
      feeding: false,
      reducedMotion: false,
    };
    const untouchedExit = options.exit.clone();
    assert.equal(getSchoolViewTarget(mobile, target), target);
    assert.equal(target.z, 6);
    const motion = createSchoolMotion();
    const reused = motion.update(0, options);
    const positions = reused.map((pose) => pose.position);
    const low = positions.map(
      () => new THREE.Vector3(Infinity, Infinity, Infinity),
    );
    const high = positions.map(
      () => new THREE.Vector3(-Infinity, -Infinity, -Infinity),
    );
    const distances = new Float64Array(5);
    const moving = new Uint32Array(5);
    const aligned = new Uint32Array(5);
    const headings = Array.from({ length: 5 }, () => []);
    let previous = snapshot(reused);
    const traces = Array.from({ length: 5 }, () => []);
    for (let frame = 1; frame <= 12000; frame++) {
      const poses = motion.update(1 / 60, options);
      assert.equal(poses, reused);
      checkBodies(poses, `${mobile ? "mobile" : "desktop"}/${frame}`);
      poses.forEach((pose, index) => {
        assert.equal(pose.position, positions[index]);
        const distance = pose.position.distanceTo(previous[index].position);
        distances[index] += distance;
        assert.ok(distance < 0.06, "Swimming jumped between frames");
        assert.ok(
          Math.abs(wrap(pose.yaw - previous[index].yaw)) < 0.06,
          "A swimming turn snapped",
        );
        low[index].min(pose.position);
        high[index].max(pose.position);
        if (distance > 1e-5) {
          moving[index]++;
          velocity
            .copy(pose.position)
            .sub(previous[index].position)
            .normalize();
          forward.set(
            -Math.cos(pose.yaw) * Math.cos(pose.pitch),
            -Math.sin(pose.pitch),
            Math.sin(pose.yaw) * Math.cos(pose.pitch),
          );
          if (forward.dot(velocity) > 0.97) aligned[index]++;
        }
        if (frame % 60 === 0) {
          headings[index].push(pose.yaw);
          traces[index].push(pose.position.clone());
        }
      });
      previous = snapshot(poses);
    }
    low.forEach((value, index) => {
      const range = high[index].clone().sub(value);
      assert.ok(
        range.x > (mobile ? 2 : 4),
        `Fish ${index} stayed in a small corner`,
      );
      assert.ok(
        range.y > 0.25 && range.z > 0.5,
        `Fish ${index} did not swim through 3D water`,
      );
      assert.ok(
        distances[index] > (mobile ? 25 : 35),
        `Fish ${index} did not travel several body lengths`,
      );
      assert.ok(
        moving[index] > 11500 && aligned[index] / moving[index] > 0.98,
        `Fish ${index} stopped or slid sideways`,
      );
      const unwrappedRange =
        Math.max(...headings[index]) - Math.min(...headings[index]);
      assert.ok(
        unwrappedRange > Math.PI * 2,
        `Fish ${index} never completed natural turns`,
      );
    });
    // Recover progress from the observed broad ellipse, rather than reading controller state.
    const angularTravel = traces.map((trace, index) => {
      const radiusX = (high[index].x - low[index].x) / 2;
      const radiusZ = (high[index].z - low[index].z) / 2;
      const centerZ = (high[index].z + low[index].z) / 2;
      let previousAngle,
        distance = 0;
      for (const point of trace) {
        const angle = Math.atan2(
          point.x / radiusX,
          (point.z - centerZ) / radiusZ,
        );
        if (previousAngle !== undefined)
          distance += wrap(angle - previousAngle);
        previousAngle = angle;
      }
      return distance;
    });
    assert.ok(
      Math.max(...angularTravel) - Math.min(...angularTravel) > 1,
      "Fish rates were tied to the same shared clock",
    );
    assert.ok(options.exit.equals(untouchedExit));

    for (const start of [5, 19, 43]) {
      motion.reset();
      advance(motion, start, options, "before feeding");
      const before = snapshot(reused);
      const feeding = { ...options, feeding: true };
      let poses = motion.update(0, feeding);
      poses.forEach((pose, index) =>
        assert.ok(pose.position.equals(before[index].position)),
      );
      poses = advance(motion, 4.9, feeding, "feeding return");
      checkRest(poses, feeding);
      poses = advance(motion, 8, feeding, "eating");
      checkRest(poses, feeding);
      poses = advance(motion, 1.5, options, "feeding hold");
      checkRest(poses, options);
      poses = advance(motion, 12, options, "resume swimming");
      assert.ok(poses.every((pose) => !pose.canFeed));
    }
    let poses = advance(
      motion,
      5,
      { ...options, reducedMotion: true },
      "reduced motion",
    );
    checkRest(poses, options);
    const beforeInvalid = snapshot(poses);
    motion.update(Number.NaN, options);
    motion.update(-100, options);
    poses.forEach((pose, index) =>
      assert.ok(pose.position.equals(beforeInvalid[index].position)),
    );

    motion.reset();
    poses = motion.update(0, options);
    poses.forEach((pose, index) => {
      getSchoolRestPosition(index, options.exit, mobile, target);
      assert.ok(pose.position.equals(target));
    });
    advance(motion, 8, options);
    const resized = {
      ...options,
      mobile: !mobile,
      exit: new THREE.Vector3(mobile ? 0.2 : -0.5, mobile ? 0.25 : 1.1, 0),
    };
    poses = motion.update(0, resized);
    poses.forEach((pose, index) => {
      getSchoolRestPosition(index, resized.exit, resized.mobile, target);
      assert.ok(
        pose.position.equals(target),
        "Resize left a fish outside the new clear water",
      );
      assert.equal(pose.scale, getSchoolScale(index, resized.mobile));
    });
    checkBodies(poses, "resized");
  }
  console.log(
    "School motion: five independently swimming fish, broad 3D routes, body OBB clearance, smooth turns and personal feeding returns passed.",
  );
} finally {
  await server.close();
  delete globalThis.document;
}
