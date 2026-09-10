import * as THREE from "three";
import {
  hinge,
  lipHeight,
  mouthTip,
  snout,
  surface,
  type JawRootPoint,
} from "./rockfishShape";

interface MouthMaterials {
  skin: THREE.Material;
  lip: THREE.Material;
  inside: THREE.Material;
}

/** Surface-following lips, upper/lower palate, and a flexible join under the jaw. */
export function createRockfishMouth(
  jawGeometry: THREE.BufferGeometry,
  jawRoot: JawRootPoint[],
  materials: MouthMaterials,
) {
  const mouth = new THREE.Group();
  mouth.name = "rockfish-mouth";
  const jaw = new THREE.Group();
  jaw.name = "fish-lower-jaw";
  jaw.userData.hinge = hinge;
  jaw.userData.maxAngle = 0.4;
  jaw.userData.mouthTip = mouthTip;
  jaw.add(new THREE.Mesh(jawGeometry, materials.skin));
  mouth.add(jaw);
  const segments = 36;
  const contours = [-1, 1].map((side) => [
    mouthTip,
    ...Array.from({ length: segments + 1 }, (_, i) => {
      const x = THREE.MathUtils.lerp(snout, hinge[0], i / segments);
      return surface(x, lipHeight(x), side, 0);
    }),
  ]);

  function geometry(positions: number[], indices: number[]) {
    const result = new THREE.BufferGeometry();
    result.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    result.setIndex(indices);
    result.computeVertexNormals();
    return result;
  }

  for (const lower of [false, true]) {
    const parent = lower ? jaw : mouth;
    // The lip is a narrow patch on the head, rather than a floating pale tube.
    for (const side of [-1, 1]) {
      const positions: number[] = [],
        indices: number[] = [];
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = THREE.MathUtils.lerp(snout, hinge[0], t);
        const width = (lower ? -0.034 : 0.032) * Math.sqrt(1 - t);
        for (const v of [0, 1])
          positions.push(...surface(x, lipHeight(x) + width * v, side, 0.003));
        if (i < segments) {
          const a = i * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      parent.add(new THREE.Mesh(geometry(positions, indices), materials.lip));
    }
    // Curved palate and floor make a cavity; neither is a flat board across the gape.
    const positions: number[] = [],
      indices: number[] = [];
    const across = 12;
    for (let i = 0; i < contours[0].length; i++) {
      const [x, y, z] = contours[1][i];
      const recess =
        Math.sin((Math.PI * i) / (contours[0].length - 1)) *
        (lower ? -0.06 : 0.065);
      for (let j = 0; j <= across; j++) {
        const v = j / across;
        positions.push(x, y + Math.sin(Math.PI * v) * recess, z * (2 * v - 1));
        if (i < contours[0].length - 1 && j < across) {
          const a = i * (across + 1) + j,
            b = a + across + 1;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    parent.add(new THREE.Mesh(geometry(positions, indices), materials.inside));
  }

  const lipSeam = new THREE.CatmullRomCurve3(
    [...contours[0].slice().reverse(), ...contours[1].slice(1)].map(
      (p) => new THREE.Vector3(...p),
    ),
  );
  mouth.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(lipSeam, 80, 0.005, 5, false),
      materials.inside,
    ),
  );

  // As with Aji and Iwashi, the open mouth has a roof and lower palate,
  // without an opaque side panel painted across the opening.

  // Seal the rear cut under the chin too: it lifts away from the fixed body when
  // the jaw opens, even though the two mouth corners remain at their hinges.
  const rootPositions: number[] = [],
    rootNormals: number[] = [],
    rootUv: number[] = [];
  const rootIndices: number[] = [],
    rootCosine: number[] = [],
    rootSine: number[] = [];
  jawRoot.forEach((point, i) => {
    const [x, y, z] = point.position;
    rootPositions.push(x, y, z, x, y, z);
    rootNormals.push(...point.normal, ...point.normal);
    rootUv.push(...point.uv, ...point.uv);
    rootCosine.push(0, 0, 0, x - hinge[0], y - hinge[1], 0);
    rootSine.push(0, 0, 0, -(y - hinge[1]), x - hinge[0], 0);
    if (i < jawRoot.length - 1) {
      const a = i * 2;
      rootIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const throatGeometry = geometry(rootPositions, rootIndices);
  throatGeometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(rootNormals, 3),
  );
  throatGeometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(rootUv, 2),
  );
  throatGeometry.morphTargetsRelative = true;
  throatGeometry.morphAttributes.position = [
    new THREE.Float32BufferAttribute(rootCosine, 3),
    new THREE.Float32BufferAttribute(rootSine, 3),
  ];
  const throat = new THREE.Mesh(throatGeometry, materials.skin);
  throat.name = "fish-jaw-throat";
  mouth.add(throat);
  return mouth;
}
