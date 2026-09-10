import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** A shared, small coral-pink crustacean: curved segments, tail fan and antennae. */
export function createKrillModel() {
  const group = new THREE.Group();
  group.name = "krill";
  const shell = new THREE.MeshBasicMaterial({ color: "#f3ac95" });
  const eyes = new THREE.MeshBasicMaterial({ color: "#412e38" });
  const feelers = new THREE.LineBasicMaterial({ color: "#ffe1c9" });
  const segments: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const segment = new THREE.SphereGeometry(1, 10, 8);
    const size = 0.16 * (1 - t * 0.65);
    segment.scale(size * 1.1, size, size * 0.7);
    segment.translate(0.33 - t * 0.8, Math.sin(t * Math.PI) * 0.13, 0);
    segments.push(segment);
  }
  const tail = new THREE.ConeGeometry(0.15, 0.22, 3);
  tail.rotateZ(-Math.PI / 2);
  tail.scale(1, 1, 0.45);
  tail.translate(-0.53, -0.02, 0);
  segments.push(tail);
  const geometry = mergeGeometries(segments)!;
  segments.forEach((segment) => segment.dispose());
  group.add(new THREE.Mesh(geometry, shell));
  const eyeParts = [-1, 1].map((side) => {
    const eye = new THREE.SphereGeometry(0.038, 8, 6);
    eye.translate(0.39, 0.075, side * 0.11);
    return eye;
  });
  const eyeGeometry = mergeGeometries(eyeParts)!;
  eyeParts.forEach((eye) => eye.dispose());
  group.add(new THREE.Mesh(eyeGeometry, eyes));
  const lines = [
    0.43, 0.07, 0.04, 0.68, 0.28, 0.05, 0.68, 0.28, 0.05, 0.83, 0.25, 0.06,
    0.43, 0.04, -0.04, 0.71, 0.13, -0.05, 0.71, 0.13, -0.05, 0.85, 0.07, -0.06,
  ];
  for (let i = 0; i < 4; i++) {
    const x = 0.2 - i * 0.14;
    lines.push(x, 0.02, 0, x - 0.11, -0.18, 0.04);
  }
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(lines, 3),
  );
  group.add(new THREE.LineSegments(lineGeometry, feelers));
  return {
    group,
    dispose() {
      geometry.dispose();
      eyeGeometry.dispose();
      lineGeometry.dispose();
      shell.dispose();
      eyes.dispose();
      feelers.dispose();
    },
  };
}
