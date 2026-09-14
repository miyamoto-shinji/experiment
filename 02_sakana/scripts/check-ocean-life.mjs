import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { createServer } from "vite";

const server = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
const actor = new THREE.Object3D();
const inverse = new THREE.Matrix4();
const triangleLocal = new THREE.Triangle();
const point = new THREE.Vector3();
const hit = new THREE.Vector3();
const ray = new THREE.Ray();
const insideDirection = new THREE.Vector3(0.913, 0.337, 0.221).normalize();
const clearance = 0.025;

// Test disconnected rock solids independently: overlapping merged rocks must not
// cancel one another when determining whether a fish is inside solid scenery.
function rockSolids(root) {
  const solids = [];
  root.updateMatrixWorld(true);
  root.traverse((mesh) => {
    if (!/^ocean-(canyon|left-bank|right-shelter)$/.test(mesh.name)) return;
    const positions = mesh.geometry.getAttribute("position");
    const indices =
      mesh.geometry.index?.array ??
      Array.from({ length: positions.count }, (_, index) => index);
    const parents = Array.from(
      { length: indices.length / 3 },
      (_, index) => index,
    );
    const find = (index) =>
      parents[index] === index
        ? index
        : (parents[index] = find(parents[index]));
    const owners = new Map();
    const triangles = [];
    for (let index = 0; index < indices.length; index += 3) {
      const vertices = Array.from(indices.slice(index, index + 3), (vertex) =>
        new THREE.Vector3()
          .fromBufferAttribute(positions, vertex)
          .applyMatrix4(mesh.matrixWorld),
      );
      triangles.push(new THREE.Triangle(...vertices));
      for (const vertex of vertices) {
        const key = vertex
          .toArray()
          .map((value) => value.toFixed(5))
          .join(",");
        if (owners.has(key)) parents[find(index / 3)] = find(owners.get(key));
        else owners.set(key, index / 3);
      }
    }
    const components = new Map();
    triangles.forEach((triangle, index) => {
      const id = find(index);
      if (!components.has(id)) components.set(id, []);
      components.get(id).push(triangle);
    });
    for (const [id, triangles] of components) {
      const box = new THREE.Box3();
      for (const { a, b, c } of triangles) {
        box.expandByPoint(a).expandByPoint(b).expandByPoint(c);
      }
      solids.push({ name: `${mesh.name}/${id}`, triangles, box });
    }
  });
  assert.ok(solids.length > 5, "Actual rock surfaces are missing");
  return solids;
}

function poseMatrix(pose) {
  actor.position.copy(pose.position);
  actor.rotation.set(0, pose.yaw, pose.pitch, "YXZ");
  actor.rotateX(pose.roll);
  actor.scale.setScalar(pose.scale);
  actor.updateMatrix();
  return actor.matrix;
}

function collision(bounds, matrix, solids) {
  const worldBounds = bounds.clone().applyMatrix4(matrix);
  inverse.copy(matrix).invert();
  const center = bounds.getCenter(new THREE.Vector3()).applyMatrix4(matrix);
  for (const solid of solids) {
    if (!solid.box.intersectsBox(worldBounds)) continue;
    const distances = [];
    ray.set(center, insideDirection);
    for (const triangle of solid.triangles) {
      triangleLocal.copy(triangle);
      triangleLocal.a.applyMatrix4(inverse);
      triangleLocal.b.applyMatrix4(inverse);
      triangleLocal.c.applyMatrix4(inverse);
      if (bounds.intersectsTriangle(triangleLocal)) return solid.name;
      if (
        ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit)
      ) {
        const distance = center.distanceToSquared(hit);
        if (!distances.some((other) => Math.abs(other - distance) < 1e-7))
          distances.push(distance);
      }
    }
    if (distances.length % 2) return solid.name;
  }
}

function cameras(mobile) {
  const result = [];
  for (const [width, height] of mobile
    ? [
        [390, 844],
        [680, 844],
      ]
    : [[1440, 810]]) {
    for (const school of [false, true]) {
      const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 120);
      const target = new THREE.Vector3(
        0,
        school ? (mobile ? 1 : 0.4) : 0,
        school ? 6 : 0,
      );
      if (school && mobile)
        target.y = THREE.MathUtils.lerp(
          1,
          2.8,
          THREE.MathUtils.smoothstep(camera.aspect, 0.58, 0.82),
        );
      const worldWidth = Math.max(
        mobile ? 5.8 : 10.8,
        school ? camera.aspect * 6.4 : 0,
      );
      const distance =
        worldWidth /
        (2 *
          Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
          camera.aspect);
      camera.position.copy(target).add(new THREE.Vector3(0, 0.32, distance));
      camera.lookAt(target);
      camera.updateMatrixWorld(true);
      result.push({
        camera,
        label: `${width}x${height}/${school ? "school" : "solo"}`,
      });
    }
  }
  return result;
}

function boxCorners(bounds) {
  const points = [];
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z])
        points.push(new THREE.Vector3(x, y, z));
  return points;
}

function screenBounds(corners, matrix, camera) {
  const box = new THREE.Box3();
  for (const corner of corners)
    box.expandByPoint(point.copy(corner).applyMatrix4(matrix).project(camera));
  return box;
}

function onScreen(box) {
  return box.max.x >= -1 && box.min.x <= 1 && box.max.y >= -1 && box.min.y <= 1;
}

function occluded(location, camera, solids) {
  const direction = location.clone().sub(camera.position);
  const distance = direction.length();
  ray.set(camera.position, direction.multiplyScalar(1 / distance));
  for (const solid of solids) {
    if (!ray.intersectsBox(solid.box)) continue;
    for (const triangle of solid.triangles) {
      if (
        ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit) &&
        camera.position.distanceTo(hit) < distance - 0.01
      )
        return true;
    }
  }
  return false;
}

function surfaceVisibility(samples, matrix, camera, solids) {
  let exposed = 0,
    visible = 0;
  const world = new THREE.Vector3();
  const projected = new THREE.Vector3();
  for (const sample of samples) {
    world.copy(sample).applyMatrix4(matrix);
    if (occluded(world, camera, solids)) continue;
    exposed++;
    projected.copy(world).project(camera);
    if (Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1) visible++;
  }
  return {
    exposed: exposed / samples.length,
    visible: visible / samples.length,
  };
}

function snapshot(state) {
  return {
    time: state.time,
    encounter: state.encounter,
    small: state.small.map((pose) => ({
      ...pose,
      position: pose.position.toArray(),
    })),
    large: { ...state.large, position: state.large.position.toArray() },
  };
}

function finiteState(state) {
  assert.equal(state.small.length, 3, "Background rockfish count changed");
  assert.ok(
    Number.isFinite(state.time) && state.time >= 0,
    "Invalid independent animation clock",
  );
  for (const pose of [...state.small, state.large]) {
    assert.ok(
      [
        ...pose.position.toArray(),
        pose.yaw,
        pose.pitch,
        pose.roll,
        pose.scale,
      ].every(Number.isFinite),
      "Background pose contains NaN or infinity",
    );
    assert.ok(pose.scale > 0, "Invalid background fish scale");
    assert.equal(typeof pose.visible, "boolean");
  }
}

function resources(root) {
  const objects = new Set();
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    objects.add(object);
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material])
      if (material) materials.add(material);
  });
  return { objects, geometries, materials };
}

try {
  const { createOceanEnvironment } = await server.ssrLoadModule(
    "/src/oceanEnvironment.ts",
  );
  const { createOceanLifeMotion } = await server.ssrLoadModule(
    "/src/oceanLifeMotion.ts",
  );
  const { createBackgroundFish } = await server.ssrLoadModule(
    "/src/sakana/backgroundFish.ts",
  );
  const { createOceanLife } = await server.ssrLoadModule("/src/oceanLife.ts");
  const models = Object.fromEntries(
    ["small", "large"].map((kind) => [kind, createBackgroundFish(kind)]),
  );
  const bounds = {},
    corners = {},
    surfaces = {};
  for (const [kind, model] of Object.entries(models)) {
    const { geometry, material } = model;
    const positions = geometry.getAttribute("position");
    assert.ok(
      positions?.count > 100,
      `${kind}: fish silhouette has no useful geometry`,
    );
    for (const attribute of Object.values(geometry.attributes))
      assert.ok(
        [...attribute.array].every(Number.isFinite),
        `${kind}: invalid geometry attribute`,
      );
    for (const index of geometry.index?.array ?? [])
      assert.ok(
        Number.isInteger(index) && index >= 0 && index < positions.count,
        `${kind}: invalid triangle index`,
      );
    geometry.computeBoundingBox();
    surfaces[kind] = [];
    for (let index = 0; index < positions.count; index += 19)
      surfaces[kind].push(
        new THREE.Vector3().fromBufferAttribute(positions, index),
      );
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    assert.ok(
      size.x >= 2 && size.x <= 2.6 && size.y < 0.72 && size.z < 0.52,
      `${kind}: normalized body bounds changed: ${size.toArray()}`,
    );
    assert.ok(
      material.depthTest && material.depthWrite && !material.transparent,
      "Rock hiding must use opaque fish geometry and the real depth buffer",
    );
    bounds[kind] = geometry.boundingBox.clone();
    // The material bends the tail in Z. Cover the entire possible sweep plus a
    // clearance margin, including the fins, throughout every tested route.
    bounds[kind].min.z -= kind === "small" ? 0.1 : 0.07;
    bounds[kind].max.z += kind === "small" ? 0.1 : 0.07;
    bounds[kind].expandByScalar(clearance);
    corners[kind] = boxCorners(bounds[kind]);
    const shader = {
      uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.basic.uniforms),
      vertexShader: THREE.ShaderLib.basic.vertexShader,
      fragmentShader: THREE.ShaderLib.basic.fragmentShader,
    };
    material.onBeforeCompile(shader, null);
    const attributes = Object.values(geometry.attributes).map(
      (attribute) => attribute.array,
    );
    const colors = [];
    for (const depth of [0, 0.5, 1]) {
      for (let frame = 0; frame < 180; frame++) model.update(frame / 60, depth);
      assert.equal(model.geometry, geometry, "Animation recreated geometry");
      assert.equal(model.material, material, "Animation recreated a material");
      Object.values(geometry.attributes).forEach((attribute, index) => {
        assert.equal(
          attribute.array,
          attributes[index],
          "Animation replaced a geometry buffer",
        );
      });
      colors.push([
        ...shader.uniforms.uBackgroundFishTint.value.toArray(),
        shader.uniforms.uBackgroundFishContrast.value,
      ]);
      assert.equal(
        shader.uniforms.uBackgroundFishTime.value,
        179 / 60,
        "Material tail animation did not follow its supplied clock",
      );
    }
    assert.notDeepEqual(
      colors[0],
      colors[2],
      "Background fish ignore water depth",
    );
    const validUniforms = [
      shader.uniforms.uBackgroundFishTime.value,
      shader.uniforms.uBackgroundFishContrast.value,
      ...shader.uniforms.uBackgroundFishTint.value.toArray(),
    ];
    model.update(Number.NaN, Number.POSITIVE_INFINITY);
    assert.deepEqual(
      [
        shader.uniforms.uBackgroundFishTime.value,
        shader.uniforms.uBackgroundFishContrast.value,
        ...shader.uniforms.uBackgroundFishTint.value.toArray(),
      ],
      validUniforms,
      "Invalid material input damaged a valid fish shader state",
    );
  }

  const scene = new THREE.Scene();
  const ocean = createOceanEnvironment(scene);
  for (const mobile of [false, true]) {
    ocean.resize(mobile);
    const solids = rockSolids(ocean.group);
    const views = cameras(mobile);
    const motion = createOceanLifeMotion();
    const state = motion.update(0, mobile, false);
    finiteState(state);
    const smallArray = state.small;
    const poses = [...state.small, state.large];
    const positions = poses.map((pose) => pose.position);
    const initial = snapshot(state);
    const surfaced = views.map(() => new Set());
    const submerged = views.map(() => new Set());
    const largeOnScreen = views.map(() => 0);
    const quiet = { frames: 0, total: 0 };
    let entries = 0,
      exits = 0;
    let previous = snapshot(state);

    // Positive control proves that the conservative fish-volume test detects a
    // real rock surface, rather than passing because the scenery was missed.
    const control = {
      ...state.small[0],
      position: solids[0].triangles[0].getMidpoint(new THREE.Vector3()),
    };
    assert.ok(
      collision(bounds.small, poseMatrix(control), solids),
      "Rock collision positive control failed",
    );

    state.small.forEach((pose, index) => {
      assert.ok(
        pose.visible,
        "A resting small fish was hidden by a visibility flag",
      );
      views.forEach(({ camera, label }) => {
        assert.ok(
          occluded(pose.position, camera, solids),
          `${label}: small fish ${index} is not behind a real rock at rest`,
        );
        const surface = surfaceVisibility(
          surfaces.small,
          poseMatrix(pose),
          camera,
          solids,
        );
        assert.ok(
          surface.exposed < 0.05,
          `${label}: small fish ${index}'s surface protrudes from its resting bank (${surface.exposed})`,
        );
      });
    });

    for (let frame = 1; frame <= 300 * 30; frame++) {
      const next = motion.update(1 / 30, mobile, false);
      assert.equal(
        next.small,
        smallArray,
        "Motion recreated the small fish array",
      );
      [...next.small, next.large].forEach((pose, index) => {
        assert.equal(pose, poses[index], "Motion recreated a fish pose");
        assert.equal(
          pose.position,
          positions[index],
          "Motion recreated a position vector",
        );
      });
      finiteState(next);
      quiet.total++;
      if (!next.large.visible) quiet.frames++;
      if (next.large.visible && !previous.large.visible) entries++;
      if (!next.large.visible && previous.large.visible) exits++;
      for (const [index, pose] of [...next.small, next.large].entries()) {
        const kind = index < 3 ? "small" : "large";
        const before = index < 3 ? previous.small[index] : previous.large;
        const matrix = poseMatrix(pose);
        // Visible fish must clear complete rock triangles with their full body,
        // fins and all phases of the shader's tail sweep.
        if (pose.visible)
          assert.equal(
            collision(bounds[kind], matrix, solids),
            undefined,
            `${mobile ? "mobile" : "desktop"}/${next.time.toFixed(3)}/${kind}${index}: fish touches a rock`,
          );
        if (pose.visible && before.visible)
          assert.ok(
            pose.position.distanceTo(new THREE.Vector3(...before.position)) <
              0.15,
            `${kind}: swimming teleported between visible frames`,
          );
        views.forEach(({ camera, label }, viewIndex) => {
          const projected = screenBounds(corners[kind], matrix, camera);
          if (kind === "small" && frame % 15 === 0 && onScreen(projected)) {
            if (occluded(pose.position, camera, solids))
              submerged[viewIndex].add(index);
            else if (pose.visible && !surfaced[viewIndex].has(index)) {
              const surface = surfaceVisibility(
                surfaces.small,
                matrix,
                camera,
                solids,
              );
              if (surface.visible > 0.8) surfaced[viewIndex].add(index);
            }
          }
          if (kind === "large") {
            assert.ok(
              pose.position.z < -9,
              "The large fish left the distant water",
            );
            if (pose.visible && onScreen(projected)) largeOnScreen[viewIndex]++;
            if (pose.visible !== before.visible) {
              const boundaryPose = pose.visible
                ? pose
                : {
                    ...before,
                    position: new THREE.Vector3(...before.position),
                  };
              const boundary = screenBounds(
                corners.large,
                poseMatrix(boundaryPose),
                camera,
              );
              assert.ok(
                !onScreen(boundary),
                `${label}: large fish appeared/disappeared inside the frame`,
              );
            }
          }
        });
      }
      previous = snapshot(next);
    }
    views.forEach(({ label }, index) => {
      assert.equal(
        surfaced[index].size,
        3,
        `${label}: not every small fish emerges into open view`,
      );
      assert.equal(
        submerged[index].size,
        3,
        `${label}: not every small fish returns behind a rock`,
      );
      assert.ok(
        largeOnScreen[index] > 30,
        `${label}: distant fish never crosses the visible water`,
      );
    });
    assert.ok(
      entries >= 2 && exits >= 2,
      "The distant encounter did not recur and finish",
    );
    assert.ok(
      quiet.frames / quiet.total > 0.4,
      "The rare large fish dominates the scene continuously",
    );

    const beforePause = snapshot(state);
    for (const delta of [0, Number.NaN, Number.POSITIVE_INFINITY, -10])
      assert.deepEqual(
        snapshot(motion.update(delta, mobile, false)),
        beforePause,
        "Invalid or zero frame time advanced background life",
      );
    for (let frame = 0; frame < 300; frame++)
      motion.update(1 / 30, mobile, true);
    assert.deepEqual(
      snapshot(state),
      beforePause,
      "Reduced motion did not freeze background life and its own clock",
    );
    motion.update(1 / 30, mobile, false);
    assert.ok(
      state.time > beforePause.time,
      "Motion did not resume after reduced motion",
    );
    for (const layout of [!mobile, mobile, !mobile, mobile]) {
      ocean.resize(layout);
      finiteState(motion.update(0, layout, false));
      for (const pose of state.small)
        assert.equal(
          collision(bounds.small, poseMatrix(pose), rockSolids(ocean.group)),
          undefined,
          "Layout change moved a small fish into a rock",
        );
    }
    assert.deepEqual(
      snapshot(createOceanLifeMotion().update(0, mobile, false)),
      initial,
      "Reinitialization did not restore the deterministic starting scene",
    );
  }

  // The renderer owns a constant set of resources across depth/layout changes,
  // then releases those resources once even if teardown is requested twice.
  const prior = resources(scene);
  const life = createOceanLife(scene, ocean);
  const initialResources = resources(scene);
  const owned = [
    ...initialResources.geometries,
    ...initialResources.materials,
  ].filter(
    (resource) =>
      !prior.geometries.has(resource) && !prior.materials.has(resource),
  );
  assert.ok(owned.length > 0, "Background life did not add renderable fish");
  const addedMeshes = [...initialResources.objects].filter(
    (object) => object.isMesh && !prior.objects.has(object),
  );
  assert.equal(
    addedMeshes.length,
    4,
    "Renderer must add three small fish and one large fish",
  );
  const disposed = new Map(owned.map((resource) => [resource, 0]));
  for (const resource of owned)
    resource.addEventListener("dispose", () =>
      disposed.set(resource, disposed.get(resource) + 1),
    );
  for (let frame = 0; frame < 600; frame++) {
    ocean.setDepth([50, 100, 150][Math.floor(frame / 100) % 3]);
    ocean.resize(frame % 100 < 50);
    ocean.update(frame / 30, 1 / 30);
    life.update(1 / 30, frame % 100 < 50, false);
  }
  const finalResources = resources(scene);
  for (const key of ["objects", "geometries", "materials"])
    assert.deepEqual(
      finalResources[key],
      initialResources[key],
      `Background animation changed its ${key}`,
    );
  life.dispose();
  life.dispose();
  life.update(1, false, false);
  for (const count of disposed.values())
    assert.equal(count, 1, "Background resource leaked or was disposed twice");
  assert.deepEqual(
    resources(scene).objects,
    prior.objects,
    "Disposed background life remains in the scene",
  );
  for (const model of Object.values(models)) {
    const counts = [0, 0];
    model.geometry.addEventListener("dispose", () => counts[0]++);
    model.material.addEventListener("dispose", () => counts[1]++);
    model.dispose();
    model.dispose();
    assert.deepEqual(
      counts,
      [1, 1],
      "Model teardown leaked or disposed a resource twice",
    );
  }
  ocean.dispose();
  console.log(
    "Ocean life: real-rock body/tail clearance, small-fish hiding and emergence, distant recurring crossings, clocks, layouts and constant resource disposal passed.",
  );
} finally {
  await server.close();
}
