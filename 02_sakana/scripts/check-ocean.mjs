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
  const { createOceanEnvironment } = await server.ssrLoadModule(
    "/src/oceanEnvironment.ts",
  );
  const scene = new THREE.Scene();
  const ocean = createOceanEnvironment(scene);
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  ocean.group.traverse((object) => {
    if (!object.geometry) return;
    const geometry = object.geometry;
    geometries.add(geometry);
    const position = geometry.getAttribute("position");
    assert.ok(position?.count > 0, "Ocean geometry has no vertices");
    for (const attribute of Object.values(geometry.attributes)) {
      assert.ok(
        [...attribute.array].every(Number.isFinite),
        "Ocean geometry has invalid coordinates",
      );
    }
    for (const index of geometry.index?.array ?? []) {
      assert.ok(
        Number.isInteger(index) && index >= 0 && index < position.count,
        "Ocean geometry references a missing vertex",
      );
    }
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (material) materials.add(material);
    }
  });
  assert.ok(geometries.size > 0, "The ocean must contain 3D geometry");
  assert.ok(materials.size > 0);

  const shelter = ocean.shelterPosition;
  const exit = ocean.exitPosition;
  ocean.resize(false);
  const desktopShelter = shelter.clone();
  const desktopExit = exit.clone();
  ocean.resize(true);
  assert.equal(
    ocean.shelterPosition,
    shelter,
    "Resize replaced the shelter vector",
  );
  assert.equal(ocean.exitPosition, exit, "Resize replaced the exit vector");
  assert.ok(
    !shelter.equals(desktopShelter),
    "Mobile needs its own shelter position",
  );
  assert.ok(!exit.equals(desktopExit), "Mobile needs its own exit position");
  assert.ok([...shelter.toArray(), ...exit.toArray()].every(Number.isFinite));
  ocean.resize(false);
  assert.ok(
    shelter.equals(desktopShelter),
    "Resize drifted the shelter endpoint",
  );
  assert.ok(exit.equals(desktopExit), "Resize drifted the visible endpoint");

  function waterColors() {
    const colors = [];
    function inspect(value) {
      if (value?.isColor) {
        const channels = value.toArray();
        assert.ok(
          channels.every(Number.isFinite),
          "Ocean colors became invalid",
        );
        colors.push(...channels);
      } else if (value?.isTexture) textures.add(value);
    }
    inspect(scene.background);
    if (scene.fog) {
      inspect(scene.fog.color);
      if (scene.fog.isFogExp2) {
        assert.ok(Number.isFinite(scene.fog.density) && scene.fog.density >= 0);
        colors.push(scene.fog.density);
      } else {
        assert.ok(
          Number.isFinite(scene.fog.near) && Number.isFinite(scene.fog.far),
        );
        assert.ok(scene.fog.far > scene.fog.near);
      }
    }
    for (const material of materials) {
      for (const value of Object.values(material)) inspect(value);
      for (const uniform of Object.values(material.uniforms ?? {})) {
        inspect(uniform.value);
      }
    }
    assert.ok(colors.length > 0, "The ocean has no inspectable water colors");
    return colors;
  }

  const depthColors = [];
  let elapsed = 0;
  for (const depth of [50, 100, 150]) {
    ocean.setDepth(depth);
    for (let frame = 0; frame < 180; frame++) {
      elapsed += 1 / 60;
      ocean.update(elapsed, 1 / 60);
    }
    depthColors.push(waterColors());
    ocean.group.traverse((object) => {
      assert.ok(
        [
          ...object.position.toArray(),
          ...object.scale.toArray(),
          object.rotation.x,
          object.rotation.y,
          object.rotation.z,
        ].every(Number.isFinite),
        "Ocean animation produced an invalid transform",
      );
    });
  }
  assert.notDeepEqual(
    depthColors[0],
    depthColors[1],
    "50 m and 100 m look identical",
  );
  assert.notDeepEqual(
    depthColors[1],
    depthColors[2],
    "100 m and 150 m look identical",
  );

  const disposalCounts = new Map();
  for (const resource of [...geometries, ...materials, ...textures]) {
    disposalCounts.set(resource, 0);
    resource.addEventListener("dispose", () => {
      disposalCounts.set(resource, disposalCounts.get(resource) + 1);
    });
  }
  ocean.dispose();
  for (const count of disposalCounts.values()) {
    assert.equal(
      count,
      1,
      "Ocean resource was leaked or disposed more than once",
    );
  }
  assert.equal(ocean.group.parent, null, "Disposed ocean remains in the scene");
  console.log(
    "Ocean environment: geometry, mobile endpoints, three depths and disposal passed.",
  );
} finally {
  await server.close();
}
