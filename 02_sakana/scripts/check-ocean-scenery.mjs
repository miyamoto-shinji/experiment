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
  const { createOceanEnvironment } = await server.ssrLoadModule("/src/oceanEnvironment.ts");
  const { createOceanBubbles } = await server.ssrLoadModule("/src/oceanBubbles.ts");
  const { seabedBurrows, sampleSeabedSurfaceHeight } =
    await server.ssrLoadModule("/src/oceanSeabed.ts");
  const scene = new THREE.Scene();
  const ocean = createOceanEnvironment(scene);
  const props = ["ocean-shipwreck"].map((name) => {
    const prop = ocean.group.getObjectByName(name);
    assert.ok(prop, `${name}: missing background scenery`);
    const bounds = new THREE.Box3().setFromObject(prop);
    assert.ok(bounds.max.z < -9, `${name}: blocks the reserved fish passage`);
    assert.ok(bounds.max.y - bounds.min.y > 0.7, `${name}: scenery is flat`);
    let drawCalls = 0, vertices = 0, buried = 0, exposed = 0;
    const point = new THREE.Vector3();
    prop.traverse((object) => {
      if (!object.isMesh) return;
      drawCalls++;
      assert.equal(object.material.depthTest, true);
      const positions = object.geometry.getAttribute("position");
      vertices += positions.count;
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
        const height = point.y - sampleSeabedSurfaceHeight(point.x, point.z);
        if (height < 0) buried++;
        if (height > 0.2) exposed++;
      }
    });
    assert.ok(drawCalls <= 8, `${name}: excessive drawing overhead`);
    assert.ok(vertices < 30000, `${name}: excessive geometry`);
    assert.ok(buried > 0 && exposed > 0, `${name}: not embedded in the sand`);
    return prop;
  });

  const left = new THREE.Box3().setFromObject(ocean.group.getObjectByName("ocean-left-bank"));
  assert.ok(left.max.y > 1.5, "The left bank still has a uniformly low silhouette");
  const before = props.map((prop) => new THREE.Box3().setFromObject(prop));
  for (const mobile of [true, false, true, false]) {
    ocean.resize(mobile);
    props.forEach((prop, index) => assert.ok(
      new THREE.Box3().setFromObject(prop).equals(before[index]),
      "Background scenery shifted into the fish lane on resize",
    ));
  }

  const bubbles = createOceanBubbles();
  const mesh = bubbles.group.getObjectByName("ocean-bubble-trails");
  assert.ok(mesh.isInstancedMesh && mesh.count > 0 && mesh.count <= 48);
  assert.equal(mesh.material.depthTest, true);
  assert.equal(mesh.material.depthWrite, false);
  const matrixBuffer = mesh.instanceMatrix.array;
  const alpha = mesh.geometry.getAttribute("aOpacity");
  const alphaBuffer = alpha.array;
  const initial = matrixBuffer.slice();
  const matrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const previous = Array.from({ length: mesh.count }, () => new THREE.Vector3());
  const wasVisible = new Uint8Array(mesh.count);
  const seen = new Set();
  let invisible = 0, rising = 0;
  for (let frame = 0; frame < 600; frame++) {
    bubbles.update(frame / 20, 0.5);
    assert.equal(mesh.instanceMatrix.array, matrixBuffer, "Bubble buffers were recreated");
    assert.equal(alpha.array, alphaBuffer, "Bubble opacity buffers were recreated");
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      assert.ok(matrix.elements.every(Number.isFinite));
      point.setFromMatrixPosition(matrix);
      assert.ok(alpha.getX(i) >= 0 && alpha.getX(i) <= 1);
      const visible = alpha.getX(i) > 0.01;
      if (visible) {
        const vent = seabedBurrows.reduce((nearest, candidate) =>
          Math.hypot(point.x - candidate.x, point.z - candidate.z) <
            Math.hypot(point.x - nearest.x, point.z - nearest.z)
            ? candidate : nearest);
        assert.ok(Math.hypot(point.x - vent.x, point.z - vent.z) < 0.35,
          "A bubble did not come from a real seabed hole");
        assert.ok(point.y > sampleSeabedSurfaceHeight(vent.x, vent.z),
          "A visible bubble is under the sand");
        if (wasVisible[i]) {
          assert.ok(point.y > previous[i].y, "A visible bubble jumped or sank");
          assert.ok(point.distanceTo(previous[i]) < 0.05, "A bubble moved abruptly");
          rising++;
        }
        seen.add(i);
      } else invisible++;
      previous[i].copy(point);
      wasVisible[i] = visible ? 1 : 0;
    }
  }
  assert.equal(seen.size, mesh.count, "Some bubble instances never appeared");
  assert.ok(invisible > 100 && rising > 100, "Bubble bursts did not pause and rise");
  bubbles.update(3, 1);
  const frozen = matrixBuffer.slice();
  bubbles.update(3, 1);
  assert.deepEqual(matrixBuffer, frozen, "A paused scene changed the bubbles");
  bubbles.update(Number.NaN, Infinity);
  assert.ok(matrixBuffer.every(Number.isFinite));
  bubbles.update(0, 0);
  assert.deepEqual(matrixBuffer, initial, "Bubble placement is not deterministic");

  const liveBubbles = ocean.group.getObjectByName("ocean-bubble-trails");
  let disposed = 0;
  liveBubbles.addEventListener("dispose", () => disposed++);
  ocean.dispose();
  assert.equal(disposed, 1, "Bubble instance buffers were not released");
  mesh.dispose();
  mesh.geometry.dispose();
  mesh.material.dispose();
  console.log("Ocean scenery: seated wreck, clear fish corridor, bounded geometry, real-hole bubble bursts, smooth rise, pause and resource reuse passed.");
} finally {
  await server.close();
}
