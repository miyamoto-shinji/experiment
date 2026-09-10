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
  createElement(tag) {
    assert.equal(tag, "canvas");
    return { width: 0, height: 0, getContext: () => context };
  },
};
const originalRandom = Math.random;
let seed = 40921;
Math.random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const server = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});

try {
  const { createAquariumFish } = await server.ssrLoadModule(
    "/src/aquariumFish.ts",
  );
  const { species } = await server.ssrLoadModule("/src/fish/species.ts");
  const { getSchoolRestPosition, getSchoolScale, getSchoolViewTarget } =
    await server.ssrLoadModule("/src/schoolMotion.ts");
  const scene = new THREE.Scene();
  const unrelated = new THREE.Group();
  unrelated.name = "unrelated scene content";
  scene.add(unrelated);
  const environment = {
    exitPosition: new THREE.Vector3(0.2, 0.25, 0),
    shelterPosition: new THREE.Vector3(7, -0.15, -5.8),
    shelterRoute: {
      approach: new THREE.Vector3(0.2, 0.25, 0),
      gate: new THREE.Vector3(0.2, 0.25, -5.8),
    },
  };
  const aquarium = createAquariumFish(scene, environment, species.aji);
  let mobile = false;
  let elapsed = 0;
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 120);
  const viewTarget = new THREE.Vector3();
  const target = new THREE.Vector3();
  const fishGroups = () =>
    scene.children.filter(
      (child) => child.name === aquarium.selectedSpecies.id,
    );
  const visibleFish = () => fishGroups().filter((group) => group.visible);
  const foods = () => scene.children.filter((child) => child.name === "krill");

  function layout(nextMobile) {
    mobile = nextMobile;
    environment.exitPosition.set(mobile ? -0.5 : 0.2, mobile ? 1.1 : 0.25, 0);
    environment.shelterPosition.set(
      mobile ? 5.6 : 7,
      mobile ? 0.65 : -0.15,
      -5.8,
    );
    environment.shelterRoute.approach.copy(environment.exitPosition);
    environment.shelterRoute.gate.set(
      environment.exitPosition.x,
      environment.exitPosition.y,
      -5.8,
    );
    aquarium.setLayout(mobile);
    camera.aspect = mobile ? 390 / 844 : 16 / 9;
    const distance =
      (mobile ? 5.8 : 10.8) /
      (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    if (aquarium.schoolActive) getSchoolViewTarget(mobile, viewTarget);
    else viewTarget.set(0, 0, 0);
    camera.position.copy(viewTarget).add(new THREE.Vector3(0, 0.32, distance));
    camera.lookAt(viewTarget);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }

  function advance(seconds, reducedMotion = false) {
    const frames = Math.ceil(seconds * 60);
    const open = new Set();
    for (let frame = 0; frame < frames; frame++) {
      const delta = seconds / frames;
      if (!reducedMotion) elapsed += delta;
      aquarium.update(delta, elapsed, reducedMotion);
      for (const group of visibleFish()) {
        assert.ok(
          [
            ...group.position.toArray(),
            ...group.quaternion.toArray(),
            ...group.scale.toArray(),
          ].every(Number.isFinite),
        );
        if (group.getObjectByName("fish-lower-jaw").rotation.z > 0.1)
          open.add(group);
      }
    }
    return open;
  }

  function watchResources(groups) {
    const resources = new Set();
    groups.forEach((group) =>
      group.traverse((object) => {
        if (object.geometry) resources.add(object.geometry);
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.filter(Boolean).forEach((material) => {
          resources.add(material);
          Object.values(material).forEach((value) => {
            if (value?.isTexture) resources.add(value);
          });
        });
      }),
    );
    const counts = new Map([...resources].map((resource) => [resource, 0]));
    resources.forEach((resource) =>
      resource.addEventListener("dispose", () => {
        assert.ok(
          groups.every((group) => group.parent === null),
          "Shared model resources were released while a fish was still in the scene",
        );
        counts.set(resource, counts.get(resource) + 1);
      }),
    );
    return () =>
      counts.forEach((count) =>
        assert.equal(
          count,
          1,
          "A shared resource was leaked or disposed more than once",
        ),
      );
  }

  assert.equal(aquarium.selectedSpecies, species.aji);
  assert.equal(aquarium.schoolActive, false);
  assert.equal(fishGroups().length, 5);
  assert.equal(visibleFish().length, 1);
  const ajiScale = visibleFish()[0].scale.clone();
  layout(false);
  aquarium.update(0, elapsed, true);
  assert.ok(visibleFish()[0].position.equals(environment.exitPosition));
  assert.ok(
    visibleFish()[0].scale.equals(ajiScale.clone().multiplyScalar(1.14)),
  );
  assert.equal(aquarium.feed(camera), true);
  assert.equal(foods().length, 3);
  assert.equal(advance(16).size, 1, "The visible solo fish did not eat");
  assert.equal(
    foods().length,
    0,
    "Solo feeding did not finish before the food lifetime",
  );

  assert.equal(aquarium.toggleSchool(), true);
  layout(false);
  aquarium.update(0, elapsed, false);
  assert.equal(visibleFish().length, 5);
  const beforeSwimming = visibleFish().map((group) => group.position.clone());
  advance(6);
  visibleFish().forEach((group, index) => {
    assert.ok(
      group.position.distanceTo(beforeSwimming[index]) > 0.2,
      "A group fish was not connected to the swimming controller",
    );
  });
  assert.equal(aquarium.feed(camera), true);
  assert.equal(foods().length, 7);
  aquarium.setLayout(false);
  assert.equal(
    foods().length,
    7,
    "An ordinary resize discarded food without changing layout",
  );
  layout(true);
  assert.equal(
    foods().length,
    0,
    "A breakpoint retained food in the old layout",
  );
  aquarium.update(0, elapsed, true);
  for (let index = 0; index < 5; index++) {
    getSchoolRestPosition(index, environment.exitPosition, true, target);
    const occupant = visibleFish().find((group) =>
      group.position.equals(target),
    );
    assert.ok(occupant, "A mobile group feeding slot was missing");
    assert.ok(
      occupant.scale.equals(
        ajiScale.clone().multiplyScalar(getSchoolScale(index, true)),
      ),
    );
  }
  assert.equal(aquarium.feed(camera), true);
  assert.equal(
    advance(16).size,
    5,
    "Some visible group fish never opened their mouths",
  );
  assert.equal(
    foods().length,
    0,
    "Group feeding did not finish before the food lifetime",
  );

  aquarium.feed(camera);
  const oldGroups = fishGroups();
  const verifyOldResources = watchResources(oldGroups);
  assert.equal(aquarium.selectSpecies(species.kasago), true);
  assert.equal(aquarium.selectedSpecies, species.kasago);
  assert.equal(aquarium.schoolActive, true);
  assert.equal(foods().length, 0);
  assert.equal(visibleFish().length, 5);
  assert.ok(oldGroups.every((group) => group.parent === null));
  verifyOldResources();
  const kasagoScale = fishGroups().reduce(
    (largest, group) =>
      group.scale.x > largest.x ? group.scale.clone() : largest,
    new THREE.Vector3(),
  );
  elapsed = 0;
  layout(true);
  aquarium.update(0, elapsed, true);
  aquarium.feed(camera);
  const unchangedGroups = fishGroups();
  const retainedFood = foods().length;
  assert.equal(aquarium.selectSpecies(species.kasago), false);
  assert.deepEqual(fishGroups(), unchangedGroups);
  assert.equal(
    foods().length,
    retainedFood,
    "Selecting the current fish changed feeding state",
  );

  assert.equal(aquarium.toggleSchool(), false);
  layout(true);
  aquarium.update(0, elapsed, true);
  assert.equal(foods().length, 0);
  assert.equal(visibleFish().length, 1);
  assert.ok(
    visibleFish()[0].scale.equals(kasagoScale.clone().multiplyScalar(0.8)),
  );
  assert.ok(visibleFish()[0].position.equals(environment.exitPosition));
  aquarium.feed(camera);
  assert.ok(advance(4).size > 0);
  aquarium.resetFeeding();
  assert.equal(foods().length, 0);
  assert.ok(
    fishGroups().every(
      (group) => group.getObjectByName("fish-lower-jaw").rotation.z === 0,
    ),
  );
  assert.equal(aquarium.canFeed, true);
  for (let attempt = 0; attempt < 20 && aquarium.canFeed; attempt++)
    aquarium.feed(camera);
  assert.equal(aquarium.canFeed, false);
  assert.equal(aquarium.feed(camera), false);
  aquarium.resetFeeding();

  aquarium.toggleSchool();
  layout(true);
  aquarium.update(0, elapsed, true);
  aquarium.feed(camera);
  const finalGroups = fishGroups();
  const verifyFinalResources = watchResources(finalGroups);
  const verifyFoodResources = watchResources(foods());
  aquarium.dispose();
  assert.deepEqual(scene.children, [unrelated]);
  verifyFinalResources();
  verifyFoodResources();
  assert.equal(aquarium.canFeed, false);
  const disposedScales = finalGroups.map((group) => group.scale.clone());
  const previousMode = aquarium.schoolActive;
  assert.equal(aquarium.selectSpecies(species.iwashi), false);
  assert.equal(aquarium.toggleSchool(), previousMode);
  aquarium.setLayout(false);
  aquarium.update(1, elapsed + 1, false);
  aquarium.resetFeeding();
  assert.equal(aquarium.feed(camera), false);
  aquarium.dispose();
  assert.deepEqual(
    scene.children,
    [unrelated],
    "A callback resurrected disposed fish",
  );
  finalGroups.forEach((group, index) =>
    assert.ok(group.scale.equals(disposedScales[index])),
  );
  verifyFinalResources();
  verifyFoodResources();
  console.log(
    "Aquarium fish: real single/group feeding, species replacement, breakpoint behavior and shared-resource lifecycle passed.",
  );
} finally {
  await server.close();
  Math.random = originalRandom;
  delete globalThis.document;
}
