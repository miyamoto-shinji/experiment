import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

function validateGeometry(mesh, requireNormals = true) {
  const { geometry } = mesh;
  const positions = geometry.getAttribute("position");
  assert.ok(positions?.count > 0, `${mesh.name}: missing surface geometry`);
  for (const attribute of Object.values(geometry.attributes))
    assert.ok(
      attribute.array.every(Number.isFinite),
      `${mesh.name}: non-finite geometry`,
    );
  for (const index of geometry.index?.array ?? [])
    assert.ok(
      Number.isInteger(index) && index >= 0 && index < positions.count,
      `${mesh.name}: triangle references a missing vertex`,
    );
  const normals = geometry.getAttribute("normal");
  if (requireNormals)
    assert.equal(
      normals?.count,
      positions.count,
      `${mesh.name}: missing surface normals`,
    );
  for (let i = 0; i < (normals?.count ?? 0); i++) {
    const length = Math.hypot(
      normals.getX(i),
      normals.getY(i),
      normals.getZ(i),
    );
    assert.ok(
      Math.abs(length - 1) < 0.005,
      `${mesh.name}: invalid surface normal`,
    );
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  assert.ok(Number.isFinite(geometry.boundingSphere.radius));
}

// This independent lookup reads rendered triangles, not the analytic height
// function used to construct them. The spatial buckets keep route checks cheap.
function terrainSurface(mesh) {
  mesh.updateWorldMatrix(true, false);
  const positions = mesh.geometry.getAttribute("position");
  const indices = mesh.geometry.index.array;
  const vertices = Array.from({ length: positions.count }, (_, index) =>
    new THREE.Vector3()
      .fromBufferAttribute(positions, index)
      .applyMatrix4(mesh.matrixWorld),
  );
  const triangles = [];
  const buckets = new Map();
  const cell = 1;
  let highest = -Infinity;
  for (let i = 0; i < indices.length; i += 3) {
    const points = [
      vertices[indices[i]],
      vertices[indices[i + 1]],
      vertices[indices[i + 2]],
    ];
    const triangle = { points, bounds: new THREE.Box3().setFromPoints(points) };
    const { min, max } = triangle.bounds;
    highest = Math.max(highest, max.y);
    triangles.push(triangle);
    for (let x = Math.floor(min.x / cell); x <= Math.floor(max.x / cell); x++)
      for (
        let z = Math.floor(min.z / cell);
        z <= Math.floor(max.z / cell);
        z++
      ) {
        const key = `${x},${z}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(triangle);
      }
  }
  function height(x, z) {
    for (const {
      points: [a, b, c],
    } of buckets.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`) ?? []) {
      const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(denominator) < 1e-12) continue;
      const u =
        ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / denominator;
      const v =
        ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / denominator;
      if (u >= -1e-7 && v >= -1e-7 && u + v <= 1 + 1e-7)
        return u * a.y + v * b.y + (1 - u - v) * c.y;
    }
    return undefined;
  }
  function maximumUnder(bounds) {
    let maximum = -Infinity;
    const candidates = new Set();
    for (
      let x = Math.floor(bounds.min.x / cell);
      x <= Math.floor(bounds.max.x / cell);
      x++
    )
      for (
        let z = Math.floor(bounds.min.z / cell);
        z <= Math.floor(bounds.max.z / cell);
        z++
      )
        for (const triangle of buckets.get(`${x},${z}`) ?? [])
          candidates.add(triangle);
    for (const { bounds: box } of candidates)
      if (
        box.max.x >= bounds.min.x &&
        box.min.x <= bounds.max.x &&
        box.max.z >= bounds.min.z &&
        box.min.z <= bounds.max.z
      )
        maximum = Math.max(maximum, box.max.y);
    // Including whole triangles at the footprint edge is conservative: their
    // vertices bound every possible height on the intersecting triangle.
    return maximum;
  }
  return { height, maximumUnder, highest, vertices };
}

function fingerprint(root) {
  const hash = createHash("sha256");
  root.updateMatrixWorld(true);
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    hash.update(mesh.name);
    hash.update(JSON.stringify(mesh.matrixWorld.elements));
    for (const name of Object.keys(mesh.geometry.attributes).sort()) {
      const array = mesh.geometry.attributes[name].array;
      hash
        .update(name)
        .update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
    }
    for (const attribute of [
      mesh.geometry.index,
      mesh.instanceMatrix,
      mesh.instanceColor,
    ])
      if (attribute) {
        const array = attribute.array;
        hash.update(
          Buffer.from(array.buffer, array.byteOffset, array.byteLength),
        );
      }
  });
  return hash.digest("hex");
}

function normalizedFishBounds(fish, spec) {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const mouth of [0, 1]) {
    fish.update(0, mouth);
    fish.group.updateMatrixWorld(true);
    const inverse = fish.group.matrixWorld.clone().invert();
    fish.group.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const relative = inverse.clone().multiply(mesh.matrixWorld);
      for (let i = 0; i < mesh.geometry.getAttribute("position").count; i++)
        box.expandByPoint(
          mesh.getVertexPosition(i, point).applyMatrix4(relative),
        );
    });
  }
  // Account for all shader tail phases, including fin sweep during banking.
  const rockfish = spec.body === "rockfish";
  const progress = Math.max(
    0,
    (box.max.x + (rockfish ? 0.8 : 1.05)) / (rockfish ? 3.5 : 3.6),
  );
  const sweep = progress ** 2 * spec.motion.amplitude * 3;
  box.min.z -= sweep;
  box.max.z += sweep;
  return box;
}

const actor = new THREE.Object3D();
const worldBounds = new THREE.Box3();
let minimumClearance = Infinity;
let checkedPoses = 0;
function checkPose(bounds, scale, pose, terrain, label) {
  actor.position.copy(pose.position);
  actor.rotation.set(0, pose.yaw, pose.pitch, "YXZ");
  actor.rotateX(pose.roll);
  actor.scale.copy(scale).multiplyScalar(pose.scale);
  actor.updateMatrix();
  worldBounds.copy(bounds).applyMatrix4(actor.matrix);
  const sample = terrain.height(pose.position.x, pose.position.z);
  assert.ok(Number.isFinite(sample), `${label}: fish left the modeled seabed`);
  // Most fish clear the highest point of the entire terrain. Near the sand,
  // inspect every triangle under the complete rotated body/fin footprint.
  const floor =
    worldBounds.min.y > terrain.highest + 0.04
      ? terrain.highest
      : terrain.maximumUnder(worldBounds);
  const clearance = worldBounds.min.y - floor;
  minimumClearance = Math.min(minimumClearance, clearance);
  assert.ok(
    clearance > 0.035,
    `${label}: full fish bounds touch the seabed (clearance ${clearance.toFixed(4)})`,
  );
  checkedPoses++;
}

try {
  const { createOceanEnvironment } = await server.ssrLoadModule(
    "/src/oceanEnvironment.ts",
  );
  const { sampleSeabedHeight, sampleSeabedSurfaceHeight, seabedBurrows } =
    await server.ssrLoadModule("/src/oceanSeabed.ts");
  const { createFish } = await server.ssrLoadModule(
    "/src/sakana/createFish.ts",
  );
  const { species } = await server.ssrLoadModule("/src/sakana/species.ts");
  const { createShelterMotion } = await server.ssrLoadModule(
    "/src/shelterMotion.ts",
  );
  const { createSchoolMotion } = await server.ssrLoadModule(
    "/src/schoolMotion.ts",
  );
  const { createOceanLifeMotion } = await server.ssrLoadModule(
    "/src/oceanLifeMotion.ts",
  );
  const { createBackgroundFish } = await server.ssrLoadModule(
    "/src/sakana/backgroundFish.ts",
  );
  const ocean = createOceanEnvironment(new THREE.Scene());
  const seabed = ocean.group.getObjectByName("ocean-seabed");
  const gravel = ocean.group.getObjectByName("ocean-gravel");
  assert.ok(seabed?.isMesh, "The ocean does not contain the terrain mesh");
  assert.ok(gravel?.isGroup, "The ocean does not contain gravel");
  validateGeometry(seabed);
  const positions = seabed.geometry.getAttribute("position");
  assert.ok(positions.count <= 35000, "Seabed exceeded its vertex budget");
  assert.ok(seabed.geometry.index, "Seabed should share its grid vertices");
  const size = seabed.geometry.boundingBox.getSize(new THREE.Vector3());
  assert.ok(
    size.x >= 80 && size.z >= 80,
    "Terrain no longer covers distant water",
  );
  assert.ok(
    size.y > 0.5,
    "Seabed has no substantial geometric slopes or hollows",
  );
  assert.ok(
    seabed.geometry.boundingBox.min.y >= -4.15 &&
      seabed.geometry.boundingBox.max.y <= -2.6,
    "Terrain left its planned clearance envelope",
  );
  let slopes = 0;
  const normals = seabed.geometry.getAttribute("normal");
  for (let i = 0; i < positions.count; i++) {
    assert.ok(
      Math.abs(
        positions.getY(i) -
          sampleSeabedHeight(positions.getX(i), positions.getZ(i)),
      ) < 0.00001,
      "Terrain helper and mesh vertices disagree",
    );
    if (normals.getY(i) < 0.98) slopes++;
  }
  assert.ok(slopes > 100, "Seabed is still geometrically flat");
  const terrain = terrainSurface(seabed);
  for (let i = 0; i < 1200; i++) {
    const x = -49.9 + ((i * 0.61803398875) % 1) * 99.8;
    const z = -59.9 + ((i * 0.41421356237) % 1) * 109.8;
    assert.ok(
      Math.abs(terrain.height(x, z) - sampleSeabedSurfaceHeight(x, z)) <
        0.000001,
      "Object seating height disagrees with the rendered triangles",
    );
  }
  let broadHollows = 0;
  for (let x = -7; x <= 7; x++)
    for (let z = -18; z <= -2; z++) {
      const center = terrain.height(x, z);
      const surrounding = Array.from({ length: 12 }, (_, index) =>
        terrain.height(
          x + Math.cos((index * Math.PI) / 6) * 2,
          z + Math.sin((index * Math.PI) / 6) * 2,
        ),
      );
      if (
        surrounding.reduce((sum, y) => sum + y, 0) / surrounding.length -
          center >
        0.09
      )
        broadHollows++;
    }
  assert.ok(
    broadHollows >= 5,
    "Seabed lacks broad concave bowls between its slopes",
  );
  assert.ok(
    Array.isArray(seabedBurrows) && seabedBurrows.length >= 3,
    "The seabed needs several geometric burrows",
  );
  for (const burrow of seabedBurrows) {
    const center = terrain.height(burrow.x, burrow.z);
    const rim = Array.from({ length: 12 }, (_, i) => {
      const angle = (i / 12) * Math.PI * 2;
      const x = Math.cos(angle) * burrow.rx;
      const z = Math.sin(angle) * burrow.rz;
      return terrain.height(
        burrow.x + x * Math.cos(burrow.angle) - z * Math.sin(burrow.angle),
        burrow.z + x * Math.sin(burrow.angle) + z * Math.cos(burrow.angle),
      );
    });
    assert.ok(rim.every(Number.isFinite) && Number.isFinite(center));
    assert.ok(
      rim.reduce((sum, y) => sum + y, 0) / rim.length - center > 0.055,
      `Burrow ${burrow.x},${burrow.z} is painted on rather than recessed into the actual surface`,
    );
  }

  const meshes = [];
  gravel.traverse((mesh) => {
    if (mesh.isMesh) {
      validateGeometry(mesh, !!mesh.isInstancedMesh);
      meshes.push(mesh);
    }
  });
  assert.ok(
    meshes.length > 0 && meshes.length <= 4,
    "Gravel draw-call budget changed",
  );
  assert.ok(
    meshes.reduce(
      (sum, mesh) => sum + mesh.geometry.getAttribute("position").count,
      0,
    ) <= 60000,
    "Gravel geometry exceeded its budget",
  );
  const gravelTriangles = meshes.reduce(
    (sum, mesh) =>
      sum +
      ((mesh.geometry.index?.count ??
        mesh.geometry.getAttribute("position").count) /
        3) *
        (mesh.isInstancedMesh ? mesh.count : 1),
    0,
  );
  assert.ok(
    gravelTriangles <= 80000,
    "Instanced gravel exceeded its rendered-triangle budget",
  );
  let stoneCount = 0;
  const instanceMatrix = new THREE.Matrix4();
  const stonePoint = new THREE.Vector3();
  const stoneHeights = [];
  for (const mesh of meshes) {
    if (mesh.name === "ocean-gravel-contact") {
      const vertices = mesh.geometry.getAttribute("position");
      assert.ok(
        mesh.material.transparent && !mesh.material.depthWrite,
        "Contact shading must not hide the surrounding terrain",
      );
      for (let i = 0; i < vertices.count; i++) {
        const gap =
          vertices.getY(i) - terrain.height(vertices.getX(i), vertices.getZ(i));
        assert.ok(
          gap > 0 && gap < 0.008,
          "A gravel contact shadow floats above or penetrates the terrain",
        );
      }
      continue;
    }
    assert.ok(
      mesh.isInstancedMesh,
      "Gravel must batch repeated stones into instanced draws",
    );
    assert.ok(
      mesh.instanceMatrix.array.every(Number.isFinite),
      "A gravel instance has an invalid transform",
    );
    mesh.updateWorldMatrix(true, false);
    const vertices = mesh.geometry.getAttribute("position");
    for (let instance = 0; instance < mesh.count; instance++) {
      mesh.getMatrixAt(instance, instanceMatrix);
      instanceMatrix.premultiply(mesh.matrixWorld);
      let lowest = Infinity;
      let highest = -Infinity;
      for (let vertex = 0; vertex < vertices.count; vertex++) {
        stonePoint
          .fromBufferAttribute(vertices, vertex)
          .applyMatrix4(instanceMatrix);
        const surface = terrain.height(stonePoint.x, stonePoint.z);
        assert.ok(
          Number.isFinite(surface),
          "A gravel stone is outside the seabed",
        );
        const gap = stonePoint.y - surface;
        lowest = Math.min(lowest, gap);
        highest = Math.max(highest, gap);
      }
      assert.ok(
        lowest <= 0.006,
        `${mesh.name}/${instance}: a stone floats above actual terrain (${lowest.toFixed(4)})`,
      );
      assert.ok(
        highest > 0.008,
        `${mesh.name}/${instance}: a stone is completely buried (${highest.toFixed(4)})`,
      );
      assert.ok(
        lowest > -0.35 && highest < 0.4,
        "Gravel no longer stays low on the sand",
      );
      stoneHeights.push(instanceMatrix.elements[13]);
      stoneCount++;
    }
  }
  assert.ok(
    stoneCount >= 100 && stoneCount <= 600,
    "Gravel density left its bounded scatter budget",
  );
  assert.ok(
    Math.max(...stoneHeights) - Math.min(...stoneHeights) > 0.3,
    "Gravel follows a flat plane rather than the varied seabed",
  );

  // A second environment must reproduce the terrain and stone placement exactly.
  const duplicate = createOceanEnvironment(new THREE.Scene());
  assert.equal(
    fingerprint(seabed),
    fingerprint(duplicate.group.getObjectByName("ocean-seabed")),
  );
  assert.equal(
    fingerprint(gravel),
    fingerprint(duplicate.group.getObjectByName("ocean-gravel")),
  );
  duplicate.dispose();

  const primary = Object.values(species).map((spec) => {
    const fish = createFish(spec);
    return {
      spec,
      fish,
      bounds: normalizedFishBounds(fish, spec),
      scale: fish.group.scale.clone(),
    };
  });
  const ambient = Object.fromEntries(
    ["small", "large"].map((kind) => {
      const fish = createBackgroundFish(kind);
      fish.geometry.computeBoundingBox();
      const bounds = fish.geometry.boundingBox.clone();
      bounds.min.z -= kind === "small" ? 0.1 : 0.07;
      bounds.max.z += kind === "small" ? 0.1 : 0.07;
      return [kind, { fish, bounds }];
    }),
  );
  const unitScale = new THREE.Vector3(1, 1, 1);
  // Positive control: the bounds/triangle lookup must detect a submerged fish.
  assert.throws(
    () =>
      checkPose(
        new THREE.Box3(
          new THREE.Vector3(-0.2, -0.2, -0.2),
          new THREE.Vector3(0.2, 0.2, 0.2),
        ),
        unitScale,
        {
          position: new THREE.Vector3(0, terrain.height(0, 0), 0),
          scale: 1,
          yaw: 0,
          pitch: 0,
          roll: 0,
        },
        terrain,
        "positive control",
      ),
    /touch the seabed/,
  );
  minimumClearance = Infinity;

  for (const mobile of [false, true]) {
    ocean.resize(mobile);
    const solo = createShelterMotion();
    const school = createSchoolMotion();
    const life = createOceanLifeMotion();
    const phases = new Set();
    const options = {
      shelter: ocean.shelterPosition,
      exit: ocean.exitPosition,
      route: ocean.shelterRoute,
      mobile,
      reducedMotion: false,
      feeding: false,
    };
    for (let frame = 0; frame <= 200 * 30; frame++) {
      const time = frame / 30;
      const pose = solo.update(1 / 30, options);
      phases.add(pose.phase);
      const schoolPoses = school.update(1 / 30, {
        ...options,
        feeding: [11, 47, 103, 167].some(
          (start) => time >= start && time < start + 12,
        ),
      });
      const state = life.update(1 / 30, mobile, false);
      if (frame % 6) continue;
      const label = `${mobile ? "mobile" : "desktop"}/${time.toFixed(1)}`;
      for (const model of primary) {
        checkPose(
          model.bounds,
          model.scale,
          { ...pose, scale: pose.scale * (mobile ? 0.8 : 1.14) },
          terrain,
          `${label}/${model.spec.id}/solo/${pose.phase}`,
        );
        schoolPoses.forEach((member, index) =>
          checkPose(
            model.bounds,
            model.scale,
            member,
            terrain,
            `${label}/${model.spec.id}/school${index}`,
          ),
        );
      }
      for (const [index, small] of state.small.entries())
        checkPose(
          ambient.small.bounds,
          unitScale,
          small,
          terrain,
          `${label}/ambient${index}`,
        );
      if (state.large.visible)
        checkPose(
          ambient.large.bounds,
          unitScale,
          state.large,
          terrain,
          `${label}/distant`,
        );
    }
    assert.ok(
      phases.has("visiting") && phases.has("hidden") && phases.has("emerging"),
      "The terrain clearance sweep missed the shelter route",
    );
  }
  for (const { fish } of primary) fish.dispose();
  for (const { fish } of Object.values(ambient)) fish.dispose();

  const initial = [fingerprint(seabed), fingerprint(gravel)];
  const resources = new Set();
  const geometryReferences = new Map();
  for (const mesh of [seabed, ...meshes]) {
    resources.add(mesh.geometry);
    resources.add(mesh.material);
    if (mesh.isInstancedMesh) resources.add(mesh);
    geometryReferences.set(mesh, {
      geometry: mesh.geometry,
      material: mesh.material,
      positions: mesh.geometry.getAttribute("position").array,
      instances: mesh.instanceMatrix?.array,
    });
  }
  const disposed = new Map([...resources].map((resource) => [resource, 0]));
  for (const resource of resources)
    resource.addEventListener("dispose", () =>
      disposed.set(resource, disposed.get(resource) + 1),
    );
  for (let frame = 0; frame < 300; frame++) {
    ocean.resize(frame % 2 === 0);
    ocean.setDepth([50, 100, 150][Math.floor(frame / 100)]);
    ocean.update(frame / 30, 1 / 30);
  }
  assert.deepEqual(
    [fingerprint(seabed), fingerprint(gravel)],
    initial,
    "Depth or layout changes recreated/moved the seabed and gravel",
  );
  for (const [mesh, before] of geometryReferences) {
    assert.equal(
      mesh.geometry,
      before.geometry,
      "Terrain updates recreated a geometry",
    );
    assert.equal(
      mesh.material,
      before.material,
      "Terrain updates recreated a material",
    );
    assert.equal(
      mesh.geometry.getAttribute("position").array,
      before.positions,
      "Terrain updates replaced a vertex buffer",
    );
    assert.equal(
      mesh.instanceMatrix?.array,
      before.instances,
      "Terrain updates replaced an instance buffer",
    );
  }
  ocean.dispose();
  for (const count of disposed.values())
    assert.equal(
      count,
      1,
      "Seabed or gravel resource leaked or was disposed twice",
    );
  console.log(
    `Seabed: geometric slopes/bowls/burrows, ${stoneCount} seated stones, deterministic budgets and disposal; ${checkedPoses} full fish poses clear actual terrain over 200 seconds on desktop/mobile (minimum ${minimumClearance.toFixed(3)}).`,
  );
} finally {
  await server.close();
  delete globalThis.document;
}
