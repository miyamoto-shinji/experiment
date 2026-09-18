import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { sampleSeabedSurfaceHeight } from "./oceanSeabed";

type Surface = "hull" | "timber" | "cabin" | "shadow" | "rust" | "growth";
type Point = readonly [number, number, number];

const surfacePalettes: Record<Surface, readonly [string, string, string]> = {
  hull: ["#4c7b82", "#305770", "#203a54"],
  timber: ["#617b7c", "#3b596e", "#283c51"],
  cabin: ["#88a6a4", "#547b92", "#334e68"],
  shadow: ["#274c5b", "#203d55", "#162b41"],
  rust: ["#807968", "#4e6065", "#34434e"],
  growth: ["#4f7774", "#365c6c", "#263e52"],
};

/** A large, distant fishing wreck built as six static material batches. */
export function createOceanShipwreck() {
  const group = new THREE.Group();
  group.name = "ocean-shipwreck";
  group.position.set(1, sampleSeabedSurfaceHeight(1, -50) - 0.4, -50);
  group.rotation.set(0.14, -0.2, -0.055);
  group.scale.setScalar(4);

  const pieces: Record<Surface, THREE.BufferGeometry[]> = {
    hull: [],
    timber: [],
    cabin: [],
    shadow: [],
    rust: [],
    growth: [],
  };
  const light = new THREE.Vector3(-0.35, 0.86, 0.38).normalize();
  const normal = new THREE.Vector3();
  let seed = 947251;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  function add(surface: Surface, source: THREE.BufferGeometry, weather = 1) {
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    geometry.deleteAttribute("uv");
    geometry.computeVertexNormals();
    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    const colors = new Float32Array(positions.count * 3);
    // A single shade per triangle keeps this quiet at a distance, while still
    // describing the curved hull under the scene's uniform ambient light.
    for (let i = 0; i < positions.count; i += 3) {
      normal.fromBufferAttribute(normals, i);
      const shade = (0.52 + Math.max(0, normal.dot(light)) * 0.43) * weather;
      colors.fill(shade, i * 3, (i + 3) * 3);
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    pieces[surface].push(geometry);
  }

  function panel(surface: Surface, points: readonly Point[], weather = 1) {
    const vertices: number[] = [];
    for (let i = 1; i < points.length - 1; i++) {
      vertices.push(...points[0], ...points[i], ...points[i + 1]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    add(surface, geometry, weather);
  }

  function box(surface: Surface, size: Point, position: Point, roll = 0) {
    const geometry = new THREE.BoxGeometry(...size);
    geometry.rotateZ(roll);
    geometry.translate(...position);
    add(surface, geometry);
  }

  function strut(surface: Surface, start: Point, end: Point, radius: number) {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const axis = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(
      radius * 0.88,
      radius,
      axis.length(),
      5,
    );
    geometry.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        axis.normalize(),
      ),
    );
    geometry.translate(...a.add(b).multiplyScalar(0.5).toArray());
    add(surface, geometry);
  }

  // The open-topped hull has a broad stern, a shallow V underneath and a raised,
  // tapered bow. Two missing near-side plates expose actual ribs and an interior.
  const stations = [
    { x: -3.65, width: 0.68, keel: 0.32, deck: 1.12 },
    { x: -3.05, width: 1.04, keel: 0.07, deck: 1.09 },
    { x: -2.05, width: 1.18, keel: 0, deck: 1.08 },
    { x: -0.7, width: 1.2, keel: 0, deck: 1.1 },
    { x: 0.8, width: 1.05, keel: 0.03, deck: 1.19 },
    { x: 2.2, width: 0.75, keel: 0.21, deck: 1.35 },
    { x: 3.3, width: 0.3, keel: 0.68, deck: 1.62 },
    { x: 3.95, width: 0.025, keel: 1.11, deck: 1.76 },
  ];
  const sections: Point[][] = stations.map(({ x, width, keel, deck }) => [
    [x, keel, 0],
    [x, keel + (deck - keel) * 0.3, width * 0.66],
    [x, deck - 0.17, width * 0.985],
    [x, deck, width],
    [x, deck, -width],
    [x, deck - 0.17, -width * 0.985],
    [x, keel + (deck - keel) * 0.3, -width * 0.66],
  ]);
  for (let i = 0; i < sections.length - 1; i++) {
    for (let edge = 0; edge < 7; edge++) {
      if (edge === 3 || (edge === 1 && (i === 1 || i === 2))) continue;
      const next = (edge + 1) % 7;
      panel(
        "hull",
        [
          sections[i][edge],
          sections[i + 1][edge],
          sections[i + 1][next],
          sections[i][next],
        ],
        0.93 + random() * 0.07,
      );
    }
    // Pale, worn upper rubbing strakes follow the sheer line instead of a flat box.
    for (const side of [-1, 1]) {
      const a = stations[i],
        b = stations[i + 1];
      panel("timber", [
        [a.x, a.deck - 0.075, side * (a.width + 0.012)],
        [b.x, b.deck - 0.075, side * (b.width + 0.012)],
        [b.x, b.deck, side * (b.width + 0.012)],
        [a.x, a.deck, side * (a.width + 0.012)],
      ]);
    }
  }
  panel("hull", [...sections[0]].reverse());
  panel("shadow", [
    [-3.48, 0.37, -0.55],
    [-3.48, 0.37, 0.55],
    [1.1, 0.37, 0.7],
    [2.4, 0.79, 0],
    [1.1, 0.37, -0.7],
  ]);

  // Remaining deck planks stop irregularly over the broken aft cargo well.
  for (let i = 0; i < 10; i++) {
    const z = -0.9 + i * 0.2;
    const left = i % 3 === 0 ? -2.18 : -1.92 + random() * 0.18;
    const requiredWidth = Math.abs(z) + 0.12;
    const section = stations.findIndex(
      (_station, index) =>
        index >= 4 && stations[index + 1]?.width < requiredWidth,
    );
    const a = stations[section],
      b = stations[section + 1];
    const right = Math.min(
      2.7,
      THREE.MathUtils.lerp(
        a.x,
        b.x,
        (a.width - requiredWidth) / (a.width - b.width),
      ),
    );
    box("timber", [right - left, 0.065, 0.18], [(right + left) / 2, 1.035, z]);
  }
  // The narrow bow deck is clipped to the tapered hull rather than overhanging it.
  panel("timber", [
    [2.32, 1.25, 0.66],
    [3.8, 1.7, 0],
    [2.32, 1.25, -0.66],
  ]);
  for (let i = 0; i < 5; i++) {
    const x = -3.12 + i * 0.28;
    const y = 0.31 + i * 0.006;
    strut("rust", [x, y, 0], [x, 0.73, 0.91], 0.037);
    strut("rust", [x, 0.73, 0.91], [x, 1.07, 1.07], 0.036);
    strut("timber", [x, y, 0], [x, 0.98, -1.03], 0.038);
  }
  box("timber", [0.93, 0.1, 0.19], [-2.66, 0.83, -0.58], -0.27);
  box("rust", [0.62, 0.07, 0.22], [-2.25, 0.56, 0.29], 0.34);

  // The wheelhouse windows are recessed openings framed by solid wall sections.
  box("cabin", [1.69, 0.55, 1.3], [-0.79, 1.39, 0]);
  for (const side of [-1, 1]) {
    const z = side * 0.665;
    box("cabin", [1.78, 0.1, 0.105], [-0.79, 2.2, z]);
    for (const x of [-1.63, -1.08, -0.45, 0.06]) {
      box("cabin", [0.075, 0.55, 0.12], [x, 1.93, z]);
    }
    box("shadow", [1.55, 0.45, 0.018], [-0.8, 1.93, side * 0.43]);
    box("rust", [0.035, 0.36, 0.012], [-1.55, 1.44, side * 0.657], -0.07);
    box("rust", [0.044, 0.25, 0.012], [-0.47, 1.52, side * 0.657], 0.04);
  }
  for (const x of [-1.64, 0.06]) {
    box("cabin", [0.095, 0.1, 1.39], [x, 2.2, 0]);
    box("cabin", [0.095, 0.54, 0.08], [x, 1.92, 0]);
    box("shadow", [0.016, 0.43, 1.08], [x === 0.06 ? -0.11 : -1.49, 1.94, 0]);
  }
  // A chipped, uneven roof and a collapsed aft corner break the otherwise tidy cabin.
  panel("cabin", [
    [-1.79, 2.27, 0.53],
    [-1.61, 2.27, 0.47],
    [-1.46, 2.27, 0.8],
    [0.22, 2.27, 0.8],
    [0.22, 2.27, -0.79],
    [-1.79, 2.27, -0.79],
  ]);
  box("cabin", [1.93, 0.07, 0.075], [-0.77, 2.245, -0.79]);
  box("rust", [0.42, 0.055, 0.6], [-1.55, 2.18, 0.52], -0.37);

  // Bent mast, snapped derrick and sagging stays retain a fishing-boat silhouette.
  strut("rust", [0.63, 1.14, -0.26], [0.6, 2.62, -0.25], 0.049);
  strut("rust", [0.6, 2.62, -0.25], [0.22, 3.2, -0.14], 0.038);
  strut("timber", [0.42, 2.92, -0.16], [1.38, 2.81, -0.18], 0.034);
  strut("shadow", [0.58, 2.58, -0.27], [1.65, 1.6, -0.53], 0.011);
  strut("shadow", [1.65, 1.6, -0.53], [2.68, 1.4, -0.38], 0.011);
  strut("rust", [-2.71, 1.07, -0.92], [-2.12, 1.78, -0.87], 0.033);
  strut("rust", [-2.12, 1.78, -0.87], [-1.78, 1.49, -0.83], 0.029);

  // A few remaining bow-rail posts; the missing sections make the wreck feel old.
  for (const side of [-1, 1]) {
    const rail: Point[] = [
      [1.34, 1.53, side * 0.88],
      [2.22, 1.7, side * 0.74],
      [3.22, 1.93, side * 0.31],
    ];
    rail.forEach((point, i) => {
      strut("rust", [point[0], point[1] - 0.3, point[2]], point, 0.024);
      if (i > 0) strut("rust", rail[i - 1], point, 0.021);
    });
    // Thin stains sit on the upper hull, not in front of the genuine breach.
    for (let i = 3; i < 6; i++) {
      const a = stations[i],
        b = stations[i + 1];
      const t = 0.32 + random() * 0.37;
      const x = THREE.MathUtils.lerp(a.x, b.x, t);
      const deck = THREE.MathUtils.lerp(a.deck, b.deck, t);
      const width = THREE.MathUtils.lerp(a.width, b.width, t);
      panel("rust", [
        [x, deck - 0.08, side * (width + 0.015)],
        [x + 0.06, deck - 0.09, side * (width + 0.015)],
        [x + 0.04, deck - 0.25, side * (width * 0.96 + 0.015)],
      ]);
    }
  }

  // Sparse colonies accumulate along ledges, with little tufts in the open hold.
  for (let i = 0; i < 27; i++) {
    const index = Math.floor(random() * (stations.length - 2));
    const a = stations[index],
      b = stations[index + 1];
    const t = random();
    const x = THREE.MathUtils.lerp(a.x, b.x, t);
    const z = THREE.MathUtils.lerp(a.width, b.width, t) * (i % 2 ? -1 : 1);
    const y = THREE.MathUtils.lerp(a.deck, b.deck, t);
    const geometry = new THREE.IcosahedronGeometry(0.05 + random() * 0.058, 0);
    geometry.scale(1.6, 0.55, 1);
    geometry.translate(x, y + 0.018, z);
    add(i % 4 ? "growth" : "cabin", geometry, 0.8 + random() * 0.17);
    if (i % 5 === 0) {
      const height = 0.18 + random() * 0.2;
      panel("growth", [
        [x - 0.035, y, z],
        [x + 0.026, y + height * 0.5, z],
        [x - 0.03, y + height, z - 0.04],
        [x - 0.004, y + height * 0.48, z - 0.014],
      ]);
    }
  }

  const materials: {
    material: THREE.MeshBasicMaterial;
    colors: THREE.Color[];
  }[] = [];
  for (const surface of Object.keys(pieces) as Surface[]) {
    const geometry = mergeGeometries(pieces[surface]);
    pieces[surface].forEach((piece) => piece.dispose());
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const colors = surfacePalettes[surface].map(
      (color) => new THREE.Color(color),
    );
    const material = new THREE.MeshBasicMaterial({
      color: colors[0],
      vertexColors: true,
      side: THREE.DoubleSide,
      fog: true,
      toneMapped: false,
    });
    materials.push({ material, colors });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `ocean-shipwreck-${surface}`;
    group.add(mesh);
  }

  function setDepth(depth: number) {
    const value = THREE.MathUtils.clamp(depth, 0, 1) * 2;
    const index = Math.min(1, Math.floor(value));
    const blend = value - index;
    for (const { material, colors } of materials) {
      material.color.copy(colors[index]).lerp(colors[index + 1], blend);
    }
  }

  return { group, setDepth };
}
