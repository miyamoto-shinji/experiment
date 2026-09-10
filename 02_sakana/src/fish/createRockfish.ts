import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { FishSpecies } from "./species";
import { setFishMouthOpen, type FishInstance } from "./fishModel";

import {
  headAndBody,
  section,
  surface,
  mouthTip,
  type Point,
} from "./rockfishShape";
import { mottledTexture } from "./rockfishTexture";
import { createRockfishMouth } from "./rockfishMouth";
import { fishVisualStyle as style } from "./visualStyle";
import { applyFishSwimming } from "./swimMaterial";

export function createRockfish(spec: FishSpecies): FishInstance {
  const group = new THREE.Group();
  group.name = spec.id;
  const time = { value: 0 };
  const materials = new Set<THREE.Material>();
  const texture = mottledTexture(spec);
  function material(
    color: string,
    extra: THREE.MeshStandardMaterialParameters = {},
  ) {
    const result = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.62,
      metalness: 0.06,
      ...extra,
    });
    applyFishSwimming(result, {
      time,
      frequency: spec.motion.frequency,
      amplitude: spec.motion.amplitude,
      origin: 0.8,
      span: 3.5,
      wavelength: 1.5,
      cacheKey: `rockfish-${spec.id}`,
    });
    materials.add(result);
    return result;
  }
  const skin = material("#edc6a8", { map: texture });
  const finMaterial = material("#ffffff", {
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const finRay = material(spec.palette.finRay);
  const ridge = material("#8a5039");
  const lipMaterial = material("#ebbb97");
  const eyeRim = material("#71503c");
  const iris = material("#dcb975", { vertexColors: true, roughness: 0.35 });
  const pupil = material("#101c23", { roughness: 0.2 });
  const highlight = material("#fff8e7", {
    emissive: "#fff8e7",
    emissiveIntensity: 0.45,
  });
  const inside = material(style.details.mouthInterior, {
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0,
  });
  const mouthLip = material("#c88761", { side: THREE.DoubleSide });
  function mesh(
    geometry: THREE.BufferGeometry,
    mat: THREE.Material,
    parent: THREE.Group = group,
  ) {
    // All opaque meshes sharing a material can be merged, including flat details.
    if (!geometry.getAttribute("uv"))
      geometry.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(
          new Float32Array(geometry.getAttribute("position").count * 2),
          2,
        ),
      );
    const object = new THREE.Mesh(geometry, mat);
    parent.add(object);
    return object;
  }
  function tube(
    points: Point[],
    radius: number,
    mat: THREE.Material,
    parent = group,
  ) {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...p)),
    );
    return mesh(
      new THREE.TubeGeometry(
        curve,
        Math.max(24, points.length * 4),
        radius,
        6,
        false,
      ),
      mat,
      parent,
    );
  }
  const parts = headAndBody();
  mesh(parts.body, skin);
  group.add(
    createRockfishMouth(parts.jaw, parts.jawRoot, {
      skin,
      lip: mouthLip,
      inside,
    }),
  );

  function finSurface(
    point: (t: number, v: number) => THREE.Vector3,
    rays: number,
    along = rays * 8,
  ) {
    const positions: number[] = [],
      colors: number[] = [],
      uv: number[] = [],
      indices: number[] = [];
    const base = new THREE.Color(spec.palette.fin),
      dark = new THREE.Color(spec.palette.finRay),
      edge = new THREE.Color(spec.palette.finEdge);
    const across = 8;
    for (let i = 0; i <= along; i++)
      for (let j = 0; j <= across; j++) {
        const t = i / along,
          v = j / across,
          p = point(t, v);
        positions.push(p.x, p.y, p.z);
        uv.push(t, v);
        const rib = (0.5 + 0.5 * Math.cos(t * rays * Math.PI * 2)) ** 3;
        const color = base
          .clone()
          .lerp(dark, rib * 0.66)
          .lerp(edge, THREE.MathUtils.smoothstep(v, 0.84, 1) * 0.8);
        color.multiplyScalar(0.83 + 0.17 * v);
        colors.push(color.r, color.g, color.b);
        if (i < along && j < across) {
          const a = i * (across + 1) + j,
            b = a + across + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    mesh(geometry, finMaterial);
  }
  function ribbon(base: Point[], edge: Point[], rays: number) {
    const rootCurve = new THREE.CatmullRomCurve3(
      base.map((p) => new THREE.Vector3(...p)),
    );
    const edgeCurve = new THREE.CatmullRomCurve3(
      edge.map((p) => new THREE.Vector3(...p)),
    );
    finSurface((t, v) => {
      const root = rootCurve.getPoint(t),
        tip = edgeCurve.getPoint(t);
      tip.lerp(
        root,
        Math.sin(Math.PI * t) * Math.sin(t * rays * Math.PI) ** 2 * 0.014,
      );
      const p = root.lerp(tip, v);
      p.z += Math.sin(Math.PI * v) * Math.sin(Math.PI * t) * 0.025;
      return p;
    }, rays);
  }

  // A single connected membrane carries the row of erect dorsal spines.
  const spineHeights = [
    0.26, 0.43, 0.61, 0.72, 0.72, 0.65, 0.57, 0.48, 0.4, 0.31, 0.25, 0.18,
  ];
  const dorsal = (t: number, v: number) => {
    const x = THREE.MathUtils.lerp(-1.18, 1.1, t),
      [h, , cy] = section(x);
    const part = Math.min(
      spineHeights.length - 0.00001,
      t * spineHeights.length,
    );
    const peak = Math.sin(Math.PI * (part % 1));
    const height = THREE.MathUtils.lerp(
      spineHeights[Math.floor(part)],
      spineHeights[Math.min(spineHeights.length - 1, Math.floor(part) + 1)],
      part % 1,
    );
    const taper =
      THREE.MathUtils.smoothstep(t, 0, 0.045) *
      (1 - THREE.MathUtils.smoothstep(t, 0.95, 1));
    return new THREE.Vector3(
      x + peak * v * 0.09,
      cy + h - 0.012 + (0.05 + height * (0.5 + 0.5 * peak ** 1.3)) * taper * v,
      Math.sin(Math.PI * v) * 0.015,
    );
  };
  finSurface(dorsal, spineHeights.length, spineHeights.length * 12);
  for (let i = 0; i < spineHeights.length; i++) {
    const t = (i + 0.5) / spineHeights.length;
    tube(
      [
        dorsal(t, 0).toArray() as Point,
        dorsal(t, 0.6).toArray() as Point,
        dorsal(t, 1).toArray() as Point,
      ],
      0.007,
      finRay,
    );
  }
  ribbon(
    [
      [1.02, 0.3, 0],
      [1.32, 0.15, 0],
      [1.68, 0.13, 0],
    ],
    [
      [1.02, 0.3, 0],
      [1.32, 0.76, 0],
      [1.52, 0.81, 0],
      [1.75, 0.52, 0],
      [1.68, 0.13, 0],
    ],
    10,
  );
  // The caudal fin is a rounded fan, with no mackerel-like fork.
  finSurface(
    (t, v) =>
      new THREE.Vector3(
        THREE.MathUtils.lerp(1.73, 2.58 + Math.sin(Math.PI * t) * 0.1, v),
        0.065 + THREE.MathUtils.lerp(0.085, 0.63, v) * Math.cos(Math.PI * t),
        Math.sin(Math.PI * v) * Math.sin(Math.PI * t) * 0.025,
      ),
    12,
  );
  ribbon(
    [
      [0.5, -0.55, 0],
      [0.81, -0.35, 0],
      [1.16, -0.2, 0],
    ],
    [
      [0.5, -0.55, 0],
      [0.86, -0.91, 0],
      [1.17, -0.85, 0],
      [1.37, -0.49, 0],
      [1.16, -0.2, 0],
    ],
    9,
  );

  function surfaceDisc(
    ex: number,
    ey: number,
    rx: number,
    ry: number,
    lift: number,
    side: number,
    mat: THREE.Material,
  ) {
    const positions: number[] = [...surface(ex, ey, side, lift)],
      colors: number[] = [1, 1, 1],
      indices: number[] = [];
    const rings = 8,
      segments = 48;
    for (let ring = 1; ring <= rings; ring++)
      for (let i = 0; i < segments; i++) {
        const r = ring / rings,
          angle = (i / segments) * Math.PI * 2;
        positions.push(
          ...surface(
            ex + Math.cos(angle) * rx * r,
            ey + Math.sin(angle) * ry * r,
            side,
            lift,
          ),
        );
        const light =
          0.78 + Math.sin(Math.PI * r) * 0.2 + Math.sin(angle) * 0.07;
        colors.push(light, light, light);
      }
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      indices.push(0, i + 1, next + 1);
      for (let r = 0; r < rings - 1; r++) {
        const a = 1 + r * segments + i,
          b = 1 + r * segments + next;
        indices.push(a, a + segments, b, b, a + segments, b + segments);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    if (mat === iris)
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(colors, 3),
      );
    geometry.setIndex(side === 1 ? indices : indices.reverse());
    geometry.computeVertexNormals();
    mesh(geometry, mat);
  }
  for (const side of [-1, 1]) {
    const root1 = surface(-0.68, -0.1, side, 0.006),
      root2 = surface(-0.62, -0.38, side, 0.006);
    ribbon(
      [root1, surface(-0.67, -0.25, side, 0.006), root2],
      [
        root1,
        [-0.2, 0.02, 0.77 * side],
        [0.26, -0.19, 0.91 * side],
        [0.32, -0.5, 0.91 * side],
        [-0.06, -0.8, 0.73 * side],
        [-0.46, -0.64, 0.56 * side],
        root2,
      ],
      12,
    );
    ribbon(
      [
        [-0.7, -0.64, 0.25 * side],
        [-0.49, -0.71, 0.24 * side],
        [-0.3, -0.67, 0.22 * side],
      ],
      [
        [-0.7, -0.64, 0.25 * side],
        [-0.25, -1.12, 0.52 * side],
        [0.04, -1.14, 0.48 * side],
        [-0.06, -0.96, 0.34 * side],
        [-0.3, -0.67, 0.22 * side],
      ],
      7,
    );
    const gill: Point[] = [
      [-1.15, 0.53],
      [-0.86, 0.4],
      [-0.72, 0.02],
      [-0.8, -0.41],
      [-1.08, -0.56],
      [-1.52, -0.4],
    ].map(([x, y]) => surface(x, y, side, 0.008));
    tube(gill, 0.019, ridge);
    tube(
      gill.map(([x, y, z]) => [x - 0.024, y - 0.018, z + 0.005 * side]),
      0.009,
      lipMaterial,
    );
    surfaceDisc(-1.47, 0.28, 0.211, 0.215, 0.006, side, eyeRim);
    surfaceDisc(-1.475, 0.286, 0.171, 0.178, 0.01, side, iris);
    surfaceDisc(-1.485, 0.293, 0.123, 0.132, 0.015, side, pupil);
    surfaceDisc(-1.521, 0.351, 0.031, 0.03, 0.02, side, highlight);
    surfaceDisc(-1.82, 0.12, 0.024, 0.019, 0.006, side, ridge);
    // Low cheek ridges and small head spines are rooted in the head surface.
    for (const [x, y, length] of [
      [-1.91, 0.2, 0.09],
      [-1.69, 0.4, 0.11],
      [-1.27, 0.57, 0.15],
      [-0.95, 0.55, 0.12],
    ]) {
      const root = new THREE.Vector3(...surface(x, y, side, 0));
      const direction = new THREE.Vector3(-0.25, 0.96, side * 0.16).normalize();
      const cone = new THREE.ConeGeometry(length * 0.3, length, 5);
      cone.applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction,
        ),
      );
      cone.translate(
        ...root.addScaledVector(direction, length * 0.28).toArray(),
      );
      mesh(cone, finRay);
    }
  }
  for (const mat of materials) {
    const parts = group.children.filter(
      (child): child is THREE.Mesh =>
        child instanceof THREE.Mesh && child.material === mat,
    );
    if (parts.length < 2) continue;
    const combined = mergeGeometries(parts.map((part) => part.geometry));
    if (!combined) throw new Error("カサゴの形状を結合できませんでした。");
    for (const part of parts) {
      group.remove(part);
      part.geometry.dispose();
    }
    mesh(combined, mat);
  }
  group.scale.set(spec.shape.length, spec.shape.height, spec.shape.width);
  return {
    group,
    mouthPosition: new THREE.Vector3(...mouthTip),
    update(t, open = 0) {
      time.value = t;
      setFishMouthOpen(group, open);
    },
    dispose() {
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      materials.forEach((mat) => mat.dispose());
      texture.dispose();
    },
  };
}
