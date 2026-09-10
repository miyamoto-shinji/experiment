import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
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
  createElement: () => ({ width: 0, height: 0, getContext: () => context }),
};
const server = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
const ray = new THREE.Ray(
  new THREE.Vector3(),
  new THREE.Vector3(0.913, 0.337, 0.221).normalize(),
);
const hit = new THREE.Vector3();
const nearest = new THREE.Vector3();
const point = new THREE.Vector3();
const margin = process.argv.includes("--penetration-only") ? 0 : 0.035;
const diagnose = process.argv.includes("--diagnose");

// Merged scenery contains disconnected, closed rock surfaces. Recover their connected
// components, so overlapping rocks cannot cancel one another in an inside/outside test.
function rockSolids(root) {
  const solids = [];
  root.updateMatrixWorld(true);
  root.traverse((mesh) => {
    if (!/^ocean-(canyon|left-bank|right-shelter)$/.test(mesh.name)) return;
    const position = mesh.geometry.getAttribute("position");
    const indices =
      mesh.geometry.index?.array ??
      Array.from({ length: position.count }, (_, i) => i);
    const parents = Array.from({ length: indices.length / 3 }, (_, i) => i);
    const find = (i) =>
      parents[i] === i ? i : (parents[i] = find(parents[i]));
    const owners = new Map();
    const triangles = [];
    for (let i = 0; i < indices.length; i += 3) {
      const vertices = Array.from(indices.slice(i, i + 3), (index) =>
        new THREE.Vector3()
          .fromBufferAttribute(position, index)
          .applyMatrix4(mesh.matrixWorld),
      );
      triangles.push(new THREE.Triangle(...vertices));
      for (const vertex of vertices) {
        const key = vertex
          .toArray()
          .map((value) => value.toFixed(5))
          .join(",");
        if (owners.has(key)) parents[find(i / 3)] = find(owners.get(key));
        else owners.set(key, i / 3);
      }
    }
    const components = new Map();
    triangles.forEach((triangle, i) => {
      const id = find(i);
      if (!components.has(id)) components.set(id, []);
      components.get(id).push(triangle);
    });
    for (const [id, triangles] of components) {
      const box = new THREE.Box3();
      triangles.forEach(({ a, b, c }) => {
        box.expandByPoint(a);
        box.expandByPoint(b);
        box.expandByPoint(c);
      });
      solids.push({ name: `${mesh.name}/${id}`, triangles, box });
    }
  });
  assert.ok(solids.length > 5, "The actual rock surfaces were not collected");
  return solids;
}

function surfaceSamples(fish) {
  const samples = new Map();
  fish.group.updateMatrixWorld(true);
  const inverse = fish.group.matrixWorld.clone().invert();
  fish.group.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const relative = inverse.clone().multiply(mesh.matrixWorld);
    const position = mesh.geometry.getAttribute("position");
    const indices =
      mesh.geometry.index?.array ??
      Array.from({ length: position.count }, (_, i) => i);
    const add = (p) => {
      p.applyMatrix4(relative);
      // Thin fins remain represented; this only deduplicates nearby surface points.
      const key = p
        .toArray()
        .map((value) => Math.round(value / 0.12))
        .join(",");
      if (!samples.has(key)) samples.set(key, p);
    };
    for (let i = 0; i < position.count; i++)
      add(new THREE.Vector3().fromBufferAttribute(position, i));
    for (let i = 0; i < indices.length; i += 3) {
      const center = new THREE.Vector3();
      for (let j = 0; j < 3; j++)
        center.add(
          new THREE.Vector3().fromBufferAttribute(position, indices[i + j]),
        );
      add(center.multiplyScalar(1 / 3));
    }
  });
  assert.ok(samples.size > 300, "Body and fin surface coverage is missing");
  const points = [...samples.values()];
  return { points, box: new THREE.Box3().setFromPoints(points) };
}

function intersectingRock(p, solids) {
  for (const solid of solids) {
    if (solid.box.distanceToPoint(p) > margin) continue;
    const distances = [];
    ray.origin.copy(p);
    for (const triangle of solid.triangles) {
      triangle.closestPointToPoint(p, nearest);
      if (nearest.distanceToSquared(p) < margin * margin)
        return {
          solid: solid.name,
          kind: "surface contact",
          point: p.toArray(),
        };
      if (
        ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit)
      ) {
        const distance = p.distanceToSquared(hit);
        if (!distances.some((existing) => Math.abs(existing - distance) < 1e-7))
          distances.push(distance);
      }
    }
    if (distances.length % 2)
      return {
        solid: solid.name,
        kind: "surface inside solid rock",
        point: p.toArray(),
      };
  }
}

function collision(samples, matrix, spec, time, solids, fullTailSweep = false) {
  const rockfish = spec.body === "rockfish";
  const progressAtTail = Math.max(
    0,
    (samples.box.max.x + (rockfish ? 0.8 : 1.05)) / (rockfish ? 3.5 : 3.6),
  );
  const tailReach = progressAtTail * progressAtTail * spec.motion.amplitude * 3;
  const bounds = samples.box.clone();
  bounds.min.z -= tailReach;
  bounds.max.z += tailReach;
  bounds.applyMatrix4(matrix).expandByScalar(margin);
  const nearby = solids.filter((solid) => solid.box.intersectsBox(bounds));
  if (!nearby.length) return;
  const phaseOffset =
    matrix.elements[12] * 0.41 +
    matrix.elements[13] * 0.73 +
    matrix.elements[14] * 0.29;
  for (const sample of samples.points) {
    // The rendered tail deformation is applied in the vertex shader, not geometry.
    const progress = Math.max(
      0,
      (sample.x + (rockfish ? 0.8 : 1.05)) / (rockfish ? 3.5 : 3.6),
    );
    const offsets = fullTailSweep
      ? [-1, 0, 1]
      : [
          Math.sin(
            time * spec.motion.frequency +
              phaseOffset -
              sample.x * (rockfish ? 1.5 : 1.8),
          ),
        ];
    for (const offset of offsets) {
      point.copy(sample);
      point.z += offset * progress * progress * spec.motion.amplitude * 3;
      point.applyMatrix4(matrix);
      const contact = intersectingRock(point, nearby);
      if (contact) return { ...contact, fishLocal: sample.toArray() };
    }
  }
}

try {
  const { createOceanEnvironment } = await server.ssrLoadModule(
    "/src/oceanEnvironment.ts",
  );
  const { createShelterMotion } = await server.ssrLoadModule(
    "/src/shelterMotion.ts",
  );
  const { createFish } = await server.ssrLoadModule("/src/fish/createFish.ts");
  const { species } = await server.ssrLoadModule("/src/fish/species.ts");
  const { createSchoolMotion, SCHOOL_MEMBERS } = await server.ssrLoadModule(
    "/src/schoolMotion.ts",
  );
  const scene = new THREE.Scene();
  const ocean = createOceanEnvironment(scene);
  assert.equal(
    SCHOOL_MEMBERS.length,
    5,
    "The freely swimming group must contain five fish",
  );
  const actor = new THREE.Object3D();
  const contacts = [];
  for (const mobile of [false, true]) {
    ocean.resize(mobile);
    const solids = rockSolids(ocean.group);
    for (const spec of Object.values(species)) {
      const fish = createFish(spec);
      const samples = surfaceSamples(fish);
      const speciesScale = fish.group.scale.clone();
      // Positive control: the previous hidden center cut through the front bank.
      actor.position.set(mobile ? 5.6 : 7, mobile ? 0.65 : -0.15, -1.6);
      actor.rotation.set(0, 0, 0);
      actor.scale
        .copy(speciesScale)
        .multiplyScalar((mobile ? 0.8 : 1.14) * 0.65);
      actor.updateMatrix();
      assert.ok(
        collision(samples, actor.matrix, spec, 0, solids),
        "Regression detector missed the old rock penetration",
      );
      for (const recall of ["none", "inward-lane", "corridor"]) {
        const motion = createShelterMotion();
        const options = {
          shelter: ocean.shelterPosition,
          exit: ocean.exitPosition,
          route: ocean.shelterRoute,
          feeding: false,
          reducedMotion: false,
          mobile,
        };
        let visited = false,
          recalled = false,
          finished = false;
        for (let frame = 0; frame < 95 * 60; frame++) {
          const time = frame / 60;
          const pose = motion.update(1 / 60, options);
          visited ||= pose.phase === "visiting";
          const triggerRecall =
            recall === "inward-lane"
              ? pose.position.z <
                  (options.route.approach.z + options.route.gate.z) / 2 &&
                Math.abs(pose.position.x - options.route.gate.x) < 0.1
              : pose.position.x > (options.shelter.x + options.exit.x) / 2;
          if (
            recall !== "none" &&
            !recalled &&
            pose.phase === "visiting" &&
            triggerRecall
          ) {
            motion.reveal();
            options.feeding = true;
            recalled = true;
          }
          // Single-fish mode keeps the original full-size shelter feature.
          if (frame % 6 === 0) {
            actor.scale
              .copy(speciesScale)
              .multiplyScalar((mobile ? 0.8 : 1.14) * pose.scale);
            actor.position.copy(pose.position);
            actor.rotation.set(0, pose.yaw, pose.pitch, "YXZ");
            actor.rotateX(Math.sin(time * 0.65) * 0.018);
            actor.updateMatrix();
            const contact = collision(
              samples,
              actor.matrix,
              spec,
              time,
              solids,
            );
            if (contact) {
              contacts.push({
                fish: spec.id,
                mobile,
                recall,
                mode: "single",
                time,
                phase: pose.phase,
                ...contact,
              });
            }
          }
          if (contacts.length) break;
          if (
            visited &&
            (recall !== "none"
              ? pose.phase === "feeding"
              : pose.phase === "cruising")
          ) {
            finished = true;
            break;
          }
        }
        if (contacts.length) break;
        assert.equal(
          finished,
          true,
          `${spec.id}: rock visit or recall did not finish`,
        );
      }
      function checkGroup(poses, time, scenario) {
        assert.equal(poses.length, 5, "A group update dropped a fish");
        poses.forEach((pose, index) => {
          actor.position.copy(pose.position);
          actor.scale.copy(speciesScale).multiplyScalar(pose.scale);
          actor.rotation.set(0, pose.yaw, pose.pitch, "YXZ");
          actor.rotateX(Math.sin(time * 0.6 + index) * 0.022);
          actor.updateMatrix();
          assert.ok(
            actor.matrix.elements.every(Number.isFinite),
            "Invalid group transform",
          );
          const contact = collision(
            samples,
            actor.matrix,
            spec,
            time,
            solids,
            true,
          );
          if (contact)
            contacts.push({
              fish: spec.id,
              mobile,
              mode: "group",
              scenario,
              actor: index,
              time,
              ...contact,
            });
        });
      }
      // Five comparable fish use the shared open-water controller, never the
      // single fish's shelter pose. Sweep long paths and several feeding returns.
      for (const withFeeding of [false, true]) {
        if (contacts.length) break;
        const motion = createSchoolMotion();
        const starts = withFeeding ? [11, 47, 103, 167] : [];
        const reachedFood = new Set();
        for (let frame = 0; frame <= 200 * 30; frame++) {
          const time = frame / 30;
          const feedingStart = starts.find(
            (start) => time >= start && time < start + 12,
          );
          const poses = motion.update(1 / 30, {
            exit: ocean.exitPosition,
            mobile,
            feeding: feedingStart !== undefined,
            reducedMotion: false,
          });
          if (feedingStart !== undefined && poses.every((pose) => pose.canFeed))
            reachedFood.add(feedingStart);
          if (frame % 6 === 0)
            checkGroup(
              poses,
              time,
              withFeeding ? "feeding returns" : "200-second swim",
            );
          if (contacts.length) break;
        }
        if (!contacts.length)
          assert.equal(
            reachedFood.size,
            starts.length,
            `${spec.id}: not all five fish reached their feeding positions`,
          );
      }
      // Layout changes must not interpolate through the instantly shifted banks.
      if (!contacts.length) {
        ocean.resize(!mobile);
        const oldExit = ocean.exitPosition.clone();
        ocean.resize(mobile);
        const resizeMotion = createSchoolMotion();
        resizeMotion.update(4, {
          exit: oldExit,
          mobile: !mobile,
          feeding: false,
          reducedMotion: false,
        });
        const resized = resizeMotion.update(1 / 60, {
          exit: ocean.exitPosition,
          mobile,
          feeding: false,
          reducedMotion: false,
        });
        checkGroup(resized, 4 + 1 / 60, "first frame after breakpoint");
      }
      fish.dispose();
      if (contacts.length) break;
    }
    if (contacts.length) break;
  }
  ocean.dispose();
  if (contacts.length && diagnose)
    console.log(JSON.stringify(contacts, null, 2));
  else
    assert.deepEqual(
      contacts,
      [],
      "Fish body or fins intersect actual rock geometry",
    );
  if (!contacts.length)
    console.log(
      "Rock clearance: single-fish visits/recalls and all five fish during 200-second swims, feeding returns and layout changes clear actual rocks, desktop/mobile.",
    );
} finally {
  await server.close();
  delete globalThis.document;
}
