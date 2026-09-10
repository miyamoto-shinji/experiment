import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { createServer } from "vite";

const originalRandom = Math.random;
let randomState = 0x715eaf;
Math.random = () => {
  randomState = (randomState * 1664525 + 1013904223) >>> 0;
  return randomState / 4294967296;
};

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
  const { getFishMouthPosition } = await server.ssrLoadModule(
    "/src/fish/fishModel.ts",
  );
  const { species } = await server.ssrLoadModule("/src/fish/species.ts");
  const { createFeeding } = await server.ssrLoadModule("/src/feeding.ts");
  const { createShelterMotion } = await server.ssrLoadModule(
    "/src/shelterMotion.ts",
  );
  const {
    createSchoolMotion,
    SCHOOL_MEMBERS,
    getSchoolRestPosition,
    getSchoolScale,
    getSchoolViewTarget,
  } = await server.ssrLoadModule("/src/schoolMotion.ts");
  assert.equal(
    SCHOOL_MEMBERS.length,
    5,
    "A school must contain five fish in total",
  );
  const schoolSizes = SCHOOL_MEMBERS.map((_, index) =>
    getSchoolScale(index, false),
  );
  assert.ok(
    Math.max(...schoolSizes) / Math.min(...schoolSizes) < 1.5,
    "All five freely swimming fish should have comparable sizes",
  );
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 70);
  camera.position.set(0, 0.32, 9);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);

  const modelTimes = new Set();
  for (const spec of Object.values(species)) {
    const fish = createFish(spec);
    const speciesScale = fish.group.scale.clone();
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
    let modelTime;
    let staticMaterials = 0;
    for (const material of materials) {
      const shader = {
        uniforms: { diffuse: { value: material.color } },
        vertexShader: THREE.ShaderLib.standard.vertexShader,
        fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      };
      const diffuse = shader.uniforms.diffuse;
      material.onBeforeCompile(shader);
      if (!shader.uniforms.uFishTime) {
        assert.equal(
          material.onBeforeCompile,
          THREE.Material.prototype.onBeforeCompile,
        );
        staticMaterials++;
        continue;
      }
      modelTime ??= shader.uniforms.uFishTime;
      assert.equal(
        shader.uniforms.uFishTime,
        modelTime,
        `${spec.id}: materials must share one clock`,
      );
      assert.equal(shader.uniforms.diffuse, diffuse);
      assert.equal(
        shader.fragmentShader,
        THREE.ShaderLib.standard.fragmentShader,
      );
      assert.equal(
        material.customProgramCacheKey(),
        `${spec.body === "rockfish" ? "rockfish" : "fish"}-${spec.id}`,
      );
      const vertex = shader.vertexShader.replace(/\s/g, "");
      const envelope = vertex.match(/\(x\+([\d.]+)\)\/([\d.]+)/);
      assert.ok(envelope, `${spec.id}: missing tail envelope`);
      assert.deepEqual(
        envelope.slice(1).map(Number),
        spec.body === "rockfish" ? [0.8, 3.5] : [1.05, 3.6],
      );
      assert.equal(
        Number(vertex.match(/uFishTime\*([\d.]+)/)?.[1]),
        Number(spec.motion.frequency.toFixed(3)),
      );
      assert.equal(
        Number(vertex.match(/-x\*([\d.]+)/)?.[1]),
        spec.body === "rockfish" ? 1.5 : 1.8,
      );
      assert.equal(
        Number(vertex.match(/\*s\*s\*([\d.]+)\*3\.0/)?.[1]),
        Number(spec.motion.amplitude.toFixed(3)),
      );
      assert.ok(
        vertex.includes("dot(modelMatrix[3].xyz,vec3(0.41,0.73,0.29))"),
        `${spec.id}: clones lost their swimming phase`,
      );
      assert.ok(
        vertex.includes(
          "objectNormal.x-=((bend(position.x+0.01)-bend(position.x-0.01))/0.02)*objectNormal.z;",
        ),
        `${spec.id}: tail normals must follow bending`,
      );
      assert.ok(vertex.includes("transformed.z+=bend(position.x);"));
    }
    assert.equal(
      staticMaterials,
      spec.body === "rockfish" ? 0 : 1,
      `${spec.id}: keep only the unbent mouth interior static`,
    );
    assert.ok(
      modelTime && !modelTimes.has(modelTime),
      `${spec.id}: species must have independent clocks`,
    );
    modelTimes.add(modelTime);
    fish.update(12.5);
    assert.equal(
      modelTime.value,
      12.5,
      `${spec.id}: compiled materials lost their live clock`,
    );
    fish.update(0);
    const clone = fish.group.clone(true);
    const originalJaw = fish.group.getObjectByName("fish-lower-jaw");
    const cloneJaw = clone.getObjectByName("fish-lower-jaw");
    const hinge = new THREE.Vector3(
      ...(cloneJaw.userData.hinge ?? [-1.69, -0.112]),
      0,
    );
    cloneJaw.updateMatrix();
    const closedHinge = hinge.clone().applyMatrix4(cloneJaw.matrix);
    const closedMouth = getFishMouthPosition(
      clone,
      fish.mouthPosition,
      new THREE.Vector3(),
    );
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
    for (const name of ["fish-jaw-throat"]) {
      const original = fish.group.getObjectByName(name);
      const surface = clone.getObjectByName(name);
      if (!original) continue;
      const position = surface.geometry.getAttribute("position");
      const normal = surface.geometry.getAttribute("normal");
      const morphs = surface.geometry.morphAttributes.position;
      for (const openness of [0.25, 0.65, 1]) {
        setFishMouthOpen(clone, openness);
        cloneJaw.updateMatrix();
        assert.deepEqual(original.morphTargetInfluences, [0, 0]);
        const vertices = [];
        for (let i = 0; i < position.count; i++) {
          const base = new THREE.Vector3().fromBufferAttribute(position, i);
          const deformed = base.clone();
          morphs.forEach((attribute, index) => {
            deformed.addScaledVector(
              new THREE.Vector3().fromBufferAttribute(attribute, i),
              surface.morphTargetInfluences[index],
            );
          });
          vertices.push(deformed);
          assert.ok(
            deformed.distanceTo(
              i % 2 ? base.applyMatrix4(cloneJaw.matrix) : base,
            ) < 1e-6,
            `${spec.id}/${name}: flexible seam detached`,
          );
        }
        const indices = surface.geometry.index.array;
        for (let i = 0; i < indices.length; i += 3) {
          const [a, b, c] = Array.from(indices.slice(i, i + 3));
          const face = vertices[b]
            .clone()
            .sub(vertices[a])
            .cross(vertices[c].clone().sub(vertices[a]));
          assert.ok(
            face.dot(new THREE.Vector3().fromBufferAttribute(normal, a)) >=
              -1e-7,
            `${name}: inward-facing seam`,
          );
        }
      }
      setFishMouthOpen(clone, 0);
      assert.deepEqual(surface.morphTargetInfluences, [0, 0]);
    }
    if (spec.body === "rockfish") {
      setFishMouthOpen(clone, 1);
      const openMouth = getFishMouthPosition(
        clone,
        fish.mouthPosition,
        new THREE.Vector3(),
      );
      assert.ok(
        openMouth.y < closedMouth.y - 0.08,
        "feeding point must follow the open jaw",
      );
      assert.ok(
        getFishMouthPosition(
          fish.group,
          fish.mouthPosition,
          new THREE.Vector3(),
        ).distanceTo(closedMouth) < 1e-8,
      );
    }
    setFishMouthOpen(clone, 0);
    assert.ok(
      cloneJaw.position.length() < 1e-8,
      `${spec.id}: jaw did not close`,
    );

    fish.group.updateMatrixWorld(true);
    const localBounds = new THREE.Box3()
      .setFromObject(fish.group)
      .applyMatrix4(fish.group.matrixWorld.clone().invert());
    const feedingCases = [
      { count: 1, mobile: false },
      { count: 5, mobile: false },
      { count: 5, mobile: true },
    ];
    for (const { count, mobile } of feedingCases) {
      const isSchool = count > 1;
      const scene = new THREE.Scene();
      const feeding = createFeeding(scene);
      const feedingCamera = mobile || isSchool ? camera.clone() : camera;
      if (mobile || isSchool) {
        feedingCamera.aspect = mobile ? 390 / 844 : 16 / 9;
        const distance =
          (mobile ? 5.8 : 10.8) /
          (2 *
            Math.tan(THREE.MathUtils.degToRad(36 / 2)) *
            feedingCamera.aspect);
        const target = isSchool
          ? getSchoolViewTarget(mobile, new THREE.Vector3())
          : new THREE.Vector3();
        feedingCamera.position
          .copy(target)
          .add(new THREE.Vector3(0, 0.32, distance));
        feedingCamera.lookAt(target);
        feedingCamera.updateProjectionMatrix();
        feedingCamera.updateMatrixWorld(true);
      }
      const exit = new THREE.Vector3(
        mobile ? -0.5 : 0.2,
        mobile ? 1.1 : 0.25,
        0,
      );
      const options = {
        shelter: new THREE.Vector3(
          mobile ? 5.6 : 7,
          mobile ? 0.65 : -0.15,
          -5.8,
        ),
        exit,
        feeding: false,
        reducedMotion: false,
        mobile,
        route: {
          approach: exit.clone(),
          gate: new THREE.Vector3(exit.x, exit.y, -5.8),
        },
      };
      const displayScale = mobile ? 0.8 : 1.14;
      const opened = Array(count).fill(0);
      const originRequests = new Set();
      const resting = new THREE.Vector3();
      const actors = Array.from({ length: count }, (_, index) => {
        const group = index === 0 ? fish.group : fish.group.clone(true);
        scene.add(group);
        return {
          group,
          mouthPosition: fish.mouthPosition,
          getMouthPosition: (destination) =>
            getFishMouthPosition(group, fish.mouthPosition, destination),
          getFeedingOrigin(destination) {
            originRequests.add(index);
            if (!isSchool) resting.copy(exit);
            else getSchoolRestPosition(index, exit, mobile, resting);
            const scale = !isSchool
              ? displayScale
              : getSchoolScale(index, mobile);
            return destination
              .copy(fish.mouthPosition)
              .multiply(speciesScale)
              .multiplyScalar(scale)
              .add(resting);
          },
          setMouthOpen(amount) {
            opened[index] = Math.max(opened[index], amount);
            setFishMouthOpen(group, amount);
          },
        };
      });
      const actorGroups = new Set(actors.map((actor) => actor.group));
      const actorBounds = actors.map(() => new THREE.Box3());
      const coreRadius = localBounds.getSize(new THREE.Vector3()).y * 0.4;
      let previousPositions;
      function rest(primary, schoolPoses) {
        fish.update(0);
        actors.forEach((actor, index) => {
          const pose = isSchool ? schoolPoses[index] : primary;
          const scale = isSchool ? pose.scale : displayScale * pose.scale;
          actor.group.scale.copy(speciesScale).multiplyScalar(scale);
          actor.group.position.copy(pose.position);
          actor.group.rotation.set(0, pose.yaw, pose.pitch, "YXZ");
        });
      }
      function checkSpacing(label, ready = actors) {
        actors.forEach((actor, i) => {
          if (previousPositions)
            assert.ok(
              actor.group.position.distanceTo(previousPositions[i]) < 0.2,
              `${label}: fish ${i} jumped while settling or resuming`,
            );
          actor.group.updateMatrixWorld(true);
          actorBounds[i]
            .copy(localBounds)
            .applyMatrix4(actor.group.matrixWorld);
          assert.ok(
            [
              ...actor.group.position.toArray(),
              ...actor.group.quaternion.toArray(),
              ...actor.group.scale.toArray(),
            ].every(Number.isFinite),
            `${label}: invalid animation transform`,
          );
        });
        for (let i = 0; i < count; i++)
          for (let j = i + 1; j < count; j++) {
            const personalSpace =
              coreRadius * (actors[i].group.scale.y + actors[j].group.scale.y);
            assert.ok(
              actors[i].group.position.distanceTo(actors[j].group.position) >
                personalSpace,
              `${label}: fish ${i} and ${j} lost their personal space`,
            );
            // While returning, rotated model AABBs contain large empty corners. Once
            // feeding at their own slots, even the full body/fin bounds must stay apart.
            if (ready.includes(actors[i]) && ready.includes(actors[j]))
              assert.ok(
                !actorBounds[i].intersectsBox(actorBounds[j]),
                `${label}: fish ${i} and ${j} overlapped while eating`,
              );
          }
        previousPositions = actors.map((actor) => actor.group.position.clone());
      }
      const starts = isSchool
        ? mobile
          ? [11, 37]
          : [5, 19, 43]
        : ["cruising", "visiting", "hidden", "returning"];
      for (const start of starts) {
        const label = `${spec.id}/${count}/${start}/${mobile ? "mobile" : "desktop"}`;
        const motion = isSchool ? undefined : createShelterMotion();
        const school = createSchoolMotion();
        let primary = motion?.update(0, options);
        let schoolPoses = school.update(0, options);
        if (isSchool) {
          for (let frame = 0; frame < start * 60; frame++)
            schoolPoses = school.update(1 / 60, options);
          assert.ok(
            schoolPoses.every((pose) => !pose.canFeed),
            `${label}: school must be freely swimming`,
          );
        } else {
          const initialPhase = start === "returning" ? "cruising" : start;
          for (let frame = 0; frame < 100 * 60; frame++) {
            primary = motion.update(1 / 60, options);
            if (
              primary.phase === initialPhase &&
              (initialPhase !== "cruising" || frame > 8 * 60)
            )
              break;
          }
          assert.equal(
            primary.phase,
            initialPhase,
            `${label}: could not reach setup phase`,
          );
          if (start === "returning") motion.reveal();
          for (let frame = 0; frame < 12; frame++)
            primary = motion.update(1 / 60, {
              ...options,
              feeding: start === "returning",
            });
          assert.equal(primary.phase, start, `${label}: wrong starting state`);
          assert.equal(
            primary.canFeed,
            false,
            `${label}: setup must still be moving`,
          );
        }
        opened.fill(0);
        rest(primary, schoolPoses);
        previousPositions = actors.map((actor) => actor.group.position.clone());
        originRequests.clear();
        assert.equal(feeding.feed(actors, feedingCamera), true);
        assert.equal(
          originRequests.size,
          count,
          `${label}: a fish's own food origin was skipped`,
        );
        const foods = new Set(
          scene.children.filter((object) => !actorGroups.has(object)),
        );
        if (count > 1) {
          const positions = new THREE.Box3().setFromPoints(
            [...foods].map((food) => food.position),
          );
          assert.ok(
            positions.getSize(new THREE.Vector3()).length() > 1,
            `${label}: food fell into a shared pile`,
          );
          const origins = actors.map((actor) =>
            actor.getFeedingOrigin(new THREE.Vector3()),
          );
          for (let i = 0; i < count; i++)
            for (let j = i + 1; j < count; j++)
              assert.ok(
                origins[i].distanceTo(origins[j]) > 0.6,
                `${label}: two fish share a feeding position`,
              );
        }
        const eatenBy = Array(count).fill(0);
        motion?.reveal();
        let waitedForExit = false;
        const becameReady = Array(count).fill(false);
        // Every fish keeps its own portion while returning from its swimming path.
        // Finish before the 18 s lifespan so disappearing food proves ingestion, not expiry.
        for (let frame = 0; frame < 16 * 60; frame++) {
          const current = { ...options, feeding: feeding.count > 0 };
          primary = motion?.update(1 / 60, current);
          schoolPoses = school.update(1 / 60, current);
          rest(primary, schoolPoses);
          const ready = actors.filter((_, index) =>
            isSchool ? schoolPoses[index].canFeed : primary.canFeed,
          );
          feeding.update(1 / 60, ready);
          actors.forEach((actor, index) => {
            becameReady[index] ||= ready.includes(actor);
            if (!becameReady[index]) {
              waitedForExit = true;
              assert.equal(
                opened[index],
                0,
                `${label}: fish ${index} ate before reaching its feeding position`,
              );
            }
          });
          checkSpacing(`${label}/${(frame / 60).toFixed(2)}s`, ready);
          for (const food of foods) {
            if (food.parent === scene) {
              assert.ok(
                [...food.position.toArray(), ...food.scale.toArray()].every(
                  Number.isFinite,
                ),
              );
              continue;
            }
            const mouthDistances = actors.map((actor) => {
              const mouth = actor
                .getMouthPosition(new THREE.Vector3())
                .applyMatrix4(actor.group.matrixWorld);
              return mouth.distanceTo(food.position);
            });
            const eater = mouthDistances.indexOf(Math.min(...mouthDistances));
            assert.ok(
              mouthDistances[eater] < actors[eater].group.scale.x * 0.6,
              `${label}: food vanished outside a fish's mouth`,
            );
            eatenBy[eater]++;
            foods.delete(food);
          }
        }
        assert.ok(
          becameReady.every(Boolean),
          `${label}: a fish never reached its food`,
        );
        assert.equal(waitedForExit, true, `${label}: recall was skipped`);
        assert.equal(feeding.count, 0, `${label}: food was not eaten`);
        for (let i = 0; i < count; i++) {
          assert.ok(
            opened[i] > 0.9 && eatenBy[i] > 0,
            `${label}: fish ${i} did not get a portion`,
          );
          assert.ok(
            actors[i].group.getObjectByName("fish-lower-jaw").rotation.z <
              0.001,
            `${label}: mouth did not close`,
          );
        }
        if (isSchool && spec.id === "kasago" && start === starts[0]) {
          const travel = actors.map((actor) => ({
            previous: actor.group.position.clone(),
            minimum: actor.group.position.clone(),
            maximum: actor.group.position.clone(),
            distance: 0,
            moving: 0,
            aligned: 0,
          }));
          const direction = new THREE.Vector3();
          const facing = new THREE.Vector3();
          // Feeding must finish with every member swimming substantial paths again,
          // facing its actual travel direction rather than wobbling at a fixed slot.
          for (let frame = 0; frame < 60 * 60; frame++) {
            schoolPoses = school.update(1 / 60, options);
            rest(undefined, schoolPoses);
            const ready = actors.filter(
              (_, index) => schoolPoses[index].canFeed,
            );
            feeding.update(1 / 60, ready);
            checkSpacing(`${label}/resumed school`, ready);
            actors.forEach((actor, index) => {
              const record = travel[index];
              const pose = schoolPoses[index];
              record.minimum.min(actor.group.position);
              record.maximum.max(actor.group.position);
              direction.copy(actor.group.position).sub(record.previous);
              const distance = direction.length();
              record.distance += distance;
              if (distance > 1e-4 && frame > 2 * 60) {
                facing.set(
                  -Math.cos(pose.yaw) * Math.cos(pose.pitch),
                  -Math.sin(pose.pitch),
                  Math.sin(pose.yaw) * Math.cos(pose.pitch),
                );
                record.moving++;
                if (facing.dot(direction.divideScalar(distance)) > 0.6)
                  record.aligned++;
              }
              record.previous.copy(actor.group.position);
            });
          }
          travel.forEach((record, index) => {
            const range = record.maximum.sub(record.minimum);
            assert.ok(
              range.x > (mobile ? 0.8 : 1.2),
              `${label}: fish ${index} stayed beside its food slot`,
            );
            assert.ok(
              range.y > 0.15 && range.z > 0.3,
              `${label}: fish ${index} did not explore the water volume`,
            );
            assert.ok(
              record.distance > 5 && record.moving > 40 * 60,
              `${label}: fish ${index} did not resume sustained swimming`,
            );
            assert.ok(
              record.aligned / record.moving > 0.85,
              `${label}: fish ${index} swam sideways or backwards`,
            );
          });
        }
        feeding.feed(actors, feedingCamera);
        feeding.reset();
        assert.equal(feeding.count, 0, `${label}: reset left food behind`);
      }
      if (mobile && spec.id === "kasago") {
        // Omitted actors are still visible: their reservations survive a long recall.
        // Formation clearance is checked above using the real controller's ready states.
        const schoolPoses = createSchoolMotion().update(0, {
          ...options,
          reducedMotion: true,
          feeding: true,
        });
        opened.fill(0);
        rest(undefined, schoolPoses);
        feeding.feed(actors, feedingCamera);
        for (let frame = 0; frame < 10 * 60; frame++) {
          rest(undefined, schoolPoses);
          feeding.update(1 / 60, [actors[0]]);
        }
        assert.ok(
          feeding.count >= count - 1,
          "The ready fish stole food reserved for returning fish",
        );
        assert.ok(opened.slice(1).every((amount) => amount === 0));
        for (let frame = 0; frame < 6 * 60; frame++) {
          rest(undefined, schoolPoses);
          feeding.update(1 / 60, actors);
        }
        assert.equal(
          feeding.count,
          0,
          "Reserved food was not eaten before expiry after recall",
        );
        assert.ok(opened.every((amount) => amount > 0.9));
        for (let i = 0; i < 10; i++) feeding.feed(actors, feedingCamera);
        assert.equal(feeding.count, 24, "Repeated feeding exceeded its limit");
        assert.equal(feeding.feed(actors, feedingCamera), false);
        actors.slice(1).forEach((actor) => {
          actor.group.visible = false;
        });
        feeding.update(0, [actors[0]]);
        assert.ok(
          feeding.count > 0 && feeding.count < 24,
          "Hidden companions left their food behind",
        );
        actors[0].group.visible = false;
        feeding.update(0, []);
        assert.equal(feeding.count, 0, "Hidden owner's food was not removed");
        actors.forEach((actor) => {
          actor.group.visible = true;
        });
        console.log(
          `${spec.name}: separate mobile portions, delayed owners, toggle cleanup and feed cap passed`,
        );
      }
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
      `${spec.name}: geometry, independent jaws, single-fish shelter feeding, five-fish roaming/feeding, reset and disposal passed`,
    );
  }
} finally {
  Math.random = originalRandom;
  await server.close();
  delete globalThis.document;
}
