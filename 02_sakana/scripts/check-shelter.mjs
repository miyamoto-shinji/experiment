import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { createServer } from "vite";

const server = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});

try {
  const { createShelterMotion } = await server.ssrLoadModule(
    "/src/shelterMotion.ts",
  );
  const phases = new Set([
    "cruising",
    "visiting",
    "hidden",
    "emerging",
    "returning",
    "feeding",
  ]);
  const step = 1 / 60;
  const angleDistance = (a, b) =>
    Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const snapshot = (pose) => ({ ...pose, position: pose.position.clone() });
  const near = (actual, expected, message) =>
    assert.ok(Math.abs(actual - expected) < 1e-8, message);

  function checkPose(pose, options) {
    assert.ok(phases.has(pose.phase), "Unknown swimming phase");
    assert.ok(
      [...pose.position.toArray(), pose.yaw, pose.pitch, pose.scale].every(
        Number.isFinite,
      ),
      "Invalid swimming pose",
    );
    assert.ok(pose.scale >= 0.6 && pose.scale <= 1.1, "Unexpected fish size");
    assert.ok(
      pose.position.x >= options.exit.x - 2 &&
        pose.position.x <= options.shelter.x + 0.3,
    );
    assert.ok(pose.position.y >= -1 && pose.position.y <= 2.5);
    assert.ok(pose.position.z >= -6.5 && pose.position.z <= 0.5);
    if (pose.phase === "cruising") {
      assert.ok(
        Math.abs(pose.position.x - options.exit.x) <=
          (options.mobile ? 0.9 : 2),
      );
      assert.ok(
        Math.abs(pose.position.y - options.exit.y) <=
          (options.mobile ? 0.5 : 0.8),
      );
      assert.equal(pose.hidden, false);
    }
    if (pose.canFeed) {
      assert.ok(
        pose.position.distanceTo(options.exit) < 1e-8,
        "Feeding began away from the exit",
      );
      near(pose.yaw, 0, "Feeding heading did not settle");
      assert.equal(pose.hidden, false);
    }
  }

  function checkContinuity(before, after) {
    assert.ok(
      before.position.distanceTo(after.position) < 0.16,
      "Fish position jumped",
    );
    assert.ok(
      angleDistance(before.yaw, after.yaw) < 0.16,
      "Fish heading snapped",
    );
    assert.ok(Math.abs(before.pitch - after.pitch) < 0.1, "Fish pitch snapped");
    assert.ok(Math.abs(before.scale - after.scale) < 0.025, "Fish size jumped");
  }

  function advance(motion, seconds, options) {
    let pose = motion.update(0, options);
    for (let frame = 0; frame < Math.ceil(seconds / step); frame++) {
      const before = snapshot(pose);
      pose = motion.update(step, options);
      checkPose(pose, options);
      checkContinuity(before, pose);
    }
    return pose;
  }

  function startInPhase(motion, phase, options) {
    motion.reset();
    if (phase === "returning") {
      advance(motion, 8, options);
      motion.reveal();
      const pose = advance(motion, 0.35, { ...options, feeding: true });
      assert.equal(pose.phase, phase);
      return pose;
    }
    let pose = motion.update(0, options);
    for (let frame = 0; frame < 100 * 60; frame++) {
      pose = motion.update(step, options);
      if (pose.phase === phase && (phase !== "cruising" || frame > 8 * 60))
        return advance(motion, 0.2, options);
    }
    assert.fail(`Never reached ${phase}`);
  }

  for (const mobile of [false, true]) {
    const options = {
      shelter: new THREE.Vector3(mobile ? 5.6 : 7, mobile ? 0.65 : -0.15, -5.8),
      exit: new THREE.Vector3(mobile ? -0.5 : 0.2, mobile ? 1.1 : 0.25, 0),
      feeding: false,
      reducedMotion: false,
      mobile,
    };
    options.route = {
      approach: options.exit.clone(),
      gate: new THREE.Vector3(options.exit.x, options.exit.y, -5.8),
    };
    const initialShelter = options.shelter.clone();
    const initialExit = options.exit.clone();
    const motion = createShelterMotion();
    let pose = motion.update(0, options);
    assert.ok(pose.position.equals(options.exit), "Fish must start in view");
    assert.equal(pose.hidden, false);
    assert.equal(pose.phase, "cruising");

    const minimum = new THREE.Vector3(Infinity, Infinity, Infinity);
    const maximum = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    let hiddenRun = 0;
    let visits = 0;
    let exits = 0;
    let cruiseDuration = 0;
    let headingChange = 0;
    let stillRun = 0;
    const initialHeading = pose.yaw;
    // More than three minutes catches repeated visits and permanent hiding regressions.
    for (let frame = 0; frame < 200 * 60; frame++) {
      const before = snapshot(pose);
      pose = motion.update(step, options);
      checkPose(pose, options);
      checkContinuity(before, pose);
      if (frame < 20 * 60)
        assert.equal(pose.phase, "cruising", "Fish hid soon after loading");
      if (pose.phase === "cruising") {
        cruiseDuration += step;
        stillRun =
          before.position.distanceTo(pose.position) < 1e-5
            ? stillRun + step
            : 0;
        assert.ok(stillRun < 5, "Fish stopped swimming for too long");
        minimum.min(pose.position);
        maximum.max(pose.position);
        headingChange = Math.max(
          headingChange,
          angleDistance(initialHeading, pose.yaw),
        );
      }
      if (pose.phase === "visiting" && before.phase === "cruising") {
        assert.ok(
          cruiseDuration >= 30 && cruiseDuration <= 60,
          "Rock visits are too frequent or absent",
        );
        cruiseDuration = 0;
        stillRun = 0;
        visits++;
      }
      if (pose.hidden) hiddenRun += step;
      else {
        if (before.hidden) exits++;
        hiddenRun = 0;
      }
      assert.ok(
        hiddenRun <= 2,
        "Fish remained hidden instead of returning to view",
      );
    }
    const range = maximum.sub(minimum);
    assert.ok(range.x > (mobile ? 0.5 : 1), "Fish did not travel horizontally");
    assert.ok(range.y > 0.15, "Fish stayed at one height");
    assert.ok(range.z > 0.25, "Fish stayed at one depth");
    assert.ok(headingChange > 0.7, "Swimming direction did not change");
    assert.ok(
      visits >= 3 && exits >= visits - 1,
      "Rock visits did not resume swimming",
    );

    for (const phase of [
      "cruising",
      "visiting",
      "hidden",
      "emerging",
      "returning",
    ]) {
      pose = startInPhase(motion, phase, options);
      const before = snapshot(pose);
      motion.reveal();
      pose = motion.update(0, { ...options, feeding: true });
      assert.ok(
        pose.position.equals(before.position),
        `${phase}: recall teleported the fish`,
      );
      near(
        angleDistance(pose.yaw, before.yaw),
        0,
        `${phase}: recall changed heading instantly`,
      );
      pose = advance(motion, 6, { ...options, feeding: true });
      assert.equal(pose.phase, "feeding", `${phase}: recall took too long`);
      assert.equal(pose.canFeed, true);
      pose = advance(motion, 30, { ...options, feeding: true });
      assert.ok(
        pose.position.equals(options.exit),
        "Fish left while food was present",
      );
      assert.equal(pose.canFeed, true);
      pose = advance(motion, 8, options);
      assert.equal(
        pose.phase,
        "cruising",
        "Fish did not resume swimming after feeding",
      );
      assert.ok(pose.position.distanceTo(options.exit) > 0.1);
    }

    pose = motion.update(0, { ...options, reducedMotion: true });
    assert.ok(pose.position.equals(options.exit));
    assert.equal(pose.hidden, false);
    near(pose.yaw, 0);
    near(pose.pitch, 0);
    pose = advance(motion, 60, { ...options, reducedMotion: true });
    assert.ok(pose.position.equals(options.exit));
    const unchanged = snapshot(pose);
    for (const delta of [Number.NaN, -1, Infinity]) {
      pose = motion.update(delta, options);
      assert.ok(
        pose.position.equals(unchanged.position),
        "Invalid delta moved the fish",
      );
    }
    assert.ok(options.shelter.equals(initialShelter));
    assert.ok(options.exit.equals(initialExit));
  }
  console.log(
    "Shelter motion: continuous desktop/mobile swimming, brief rock visits, smooth feeding recall and reduced motion passed.",
  );
} finally {
  await server.close();
}
