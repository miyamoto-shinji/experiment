import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { createServer } from "vite";

// These checks exercise real geometry and feeding. Texture appearance is checked in-browser.
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
  const { createFish, setFishMouthOpen } = await server.ssrLoadModule(
    "/src/fish/createFish.ts",
  );
  const { species } = await server.ssrLoadModule("/src/fish/species.ts");
  const { createFeeding } = await server.ssrLoadModule("/src/feeding.ts");
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 70);
  camera.position.set(0, 0.32, 9);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);

  for (const spec of Object.values(species)) {
    const fish = createFish(spec);
    const geometries = new Set(),
      materials = new Set();
    fish.group.traverse((object) => {
      if (!object.isMesh) return;
      const geometry = object.geometry;
      geometries.add(geometry);
      materials.add(object.material);
      for (const name of ["position", "normal"]) {
        const values = geometry.getAttribute(name).array;
        for (const value of values)
          assert.ok(Number.isFinite(value), `${spec.id}: ${name}`);
      }
      for (const index of geometry.index?.array ?? []) {
        assert.ok(
          index < geometry.getAttribute("position").count,
          `${spec.id}: invalid vertex index`,
        );
      }
    });
    const clone = fish.group.clone(true);
    const originalJaw = fish.group.getObjectByName("fish-lower-jaw");
    const cloneJaw = clone.getObjectByName("fish-lower-jaw");
    const hinge = new THREE.Vector3(
      ...(cloneJaw.userData.hinge ?? [-1.69, -0.112]),
      0,
    );
    cloneJaw.updateMatrix();
    const closedHinge = hinge.clone().applyMatrix4(cloneJaw.matrix);
    setFishMouthOpen(clone, 1);
    cloneJaw.updateMatrix();
    assert.ok(
      closedHinge.distanceTo(hinge.clone().applyMatrix4(cloneJaw.matrix)) <
        1e-8,
      `${spec.id}: jaw hinge moved`,
    );
    assert.equal(
      originalJaw.rotation.z,
      0,
      `${spec.id}: clone changed the original jaw`,
    );
    const lining = fish.group.getObjectByName("fish-mouth-lining");
    const cloneLining = clone.getObjectByName("fish-mouth-lining");
    if (lining) {
      assert.deepEqual(lining.morphTargetInfluences, [0, 0]);
      assert.ok(cloneLining.morphTargetInfluences[1] > 0);
      const position = cloneLining.geometry.getAttribute("position");
      const morphs = cloneLining.geometry.morphAttributes.position;
      for (let i = 1; i < position.count; i += 2) {
        const base = new THREE.Vector3().fromBufferAttribute(position, i);
        const deformed = base.clone();
        morphs.forEach((attribute, index) => {
          deformed.addScaledVector(
            new THREE.Vector3().fromBufferAttribute(attribute, i),
            cloneLining.morphTargetInfluences[index],
          );
        });
        assert.ok(
          deformed.distanceTo(base.applyMatrix4(cloneJaw.matrix)) < 1e-6,
          `${spec.id}: mouth lining separated from the jaw`,
        );
      }
    }
    setFishMouthOpen(clone, 0);
    if (cloneLining)
      assert.deepEqual(cloneLining.morphTargetInfluences, [0, 0]);
    assert.ok(
      cloneJaw.position.length() < 1e-8,
      `${spec.id}: jaw did not close`,
    );

    for (const count of [1, 7]) {
      const scene = new THREE.Scene();
      const feeding = createFeeding(scene);
      let opened = 0;
      const actors = Array.from({ length: count }, (_, index) => {
        const group = index === 0 ? fish.group : fish.group.clone(true);
        if (index > 0) group.scale.multiplyScalar(0.5);
        scene.add(group);
        return {
          group,
          mouthPosition: fish.mouthPosition,
          setMouthOpen(amount) {
            opened = Math.max(opened, amount);
            setFishMouthOpen(group, amount);
          },
        };
      });
      function rest() {
        actors.forEach((actor, i) => {
          actor.group.position.set(
            0.8 + (i ? ((i % 3) - 1) * 2 : 0),
            i ? (i % 2 ? 1.4 : -1.2) : 0.05,
            -i * 0.65,
          );
          actor.group.rotation.set(0, -0.13, 0);
        });
      }
      rest();
      assert.equal(feeding.feed(actors, camera), true);
      // End before the 18 s lifetime: removal must be eating, not expiry.
      for (let frame = 0; frame < 16 * 60; frame++) {
        rest();
        feeding.update(1 / 60, actors);
      }
      assert.equal(feeding.count, 0, `${spec.id}/${count}: food was not eaten`);
      assert.ok(opened > 0.9, `${spec.id}/${count}: mouth never opened`);
      for (const actor of actors)
        assert.ok(
          actor.group.getObjectByName("fish-lower-jaw").rotation.z < 0.001,
        );
      feeding.feed(actors, camera);
      feeding.reset();
      assert.equal(feeding.count, 0, `${spec.id}: reset left food behind`);
      feeding.dispose();
      actors.forEach((actor) => scene.remove(actor.group));
    }
    let disposedGeometry = 0,
      disposedMaterials = 0;
    geometries.forEach((geometry) =>
      geometry.addEventListener("dispose", () => disposedGeometry++),
    );
    materials.forEach((material) =>
      material.addEventListener("dispose", () => disposedMaterials++),
    );
    fish.dispose();
    assert.equal(disposedGeometry, geometries.size);
    assert.equal(disposedMaterials, materials.size);
    console.log(
      `${spec.name}: geometry, independent jaws, single/school feeding, reset and disposal passed`,
    );
  }
} finally {
  await server.close();
  delete globalThis.document;
}
