import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { FishSpecies } from "./species";
import { fishVisualStyle as style } from "./visualStyle";

export interface FishInstance {
  group: THREE.Group;
  readonly mouthPosition: THREE.Vector3;
  update: (time: number, mouthOpen?: number) => void;
  dispose: () => void;
}
type Point = [number, number, number];

const mouthHinge = new THREE.Vector2(-1.69, -0.112);
const jawName = "fish-lower-jaw";

/** The jaw transform is per group, so cloned school members can feed independently. */
export function setFishMouthOpen(group: THREE.Group, openness: number) {
  const jaw = group.getObjectByName(jawName);
  if (!jaw) return;
  const angle = THREE.MathUtils.clamp(Number.isFinite(openness) ? openness : 0, 0, 1) * 0.67;
  const c = Math.cos(angle), s = Math.sin(angle);
  jaw.rotation.z = angle;
  // Keep vertices in fish coordinates for the shared swimming shader, while
  // rotating the jaw around its mouth corner instead of the fish's origin.
  jaw.position.set(
    mouthHinge.x * (1 - c) + mouthHinge.y * s,
    mouthHinge.y * (1 - c) - mouthHinge.x * s,
    0,
  );
}

function mouthHeight(x: number) {
  const t = THREE.MathUtils.clamp((x + 1.98) / (mouthHinge.x + 1.98), 0, 1);
  return 0.055 - 0.167 * t ** 1.15;
}

// Full, rounded shoulder and belly, tapering continuously into a narrow tail wrist.
const profile = [
  [-1.98, 0.012, 0.012, 0.055],
  [-1.84, 0.16, 0.12, 0.055],
  [-1.52, 0.37, 0.245, 0.035],
  [-1.13, 0.53, 0.33, 0.015],
  [-0.63, 0.625, 0.355, 0],
  [-0.1, 0.595, 0.325, -0.025],
  [0.43, 0.465, 0.255, -0.028],
  [0.94, 0.285, 0.17, -0.012],
  [1.37, 0.13, 0.085, 0],
  [1.65, 0.068, 0.046, 0.01],
  [1.9, 0.03, 0.022, 0.01],
];

function section(x: number) {
  let i = 0;
  while (i < profile.length - 2 && x > profile[i + 1][0]) i++;
  const a = profile[i],
    b = profile[i + 1];
  const t = THREE.MathUtils.clamp((x - a[0]) / (b[0] - a[0]), 0, 1);
  return [1, 2, 3].map((k) => {
    const prev = profile[Math.max(0, i - 1)];
    const next = profile[Math.min(profile.length - 1, i + 2)];
    const m0 = ((b[k] - prev[k]) / (b[0] - prev[0])) * (b[0] - a[0]);
    const m1 = ((next[k] - a[k]) / (next[0] - a[0])) * (b[0] - a[0]);
    return (
      (2 * t * t * t - 3 * t * t + 1) * a[k] +
      (t * t * t - 2 * t * t + t) * m0 +
      (-2 * t * t * t + 3 * t * t) * b[k] +
      (t * t * t - t * t) * m1
    );
  });
}

function surface(x: number, y: number, side: number, offset = 0.008): Point {
  const [h, w, cy] = section(x);
  return [
    x,
    y,
    (w * Math.sqrt(Math.max(0, 1 - ((y - cy) / h) ** 2)) + offset) * side,
  ];
}

function skinTexture(spec: FishSpecies) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  // Mirrored bands wrap around the entire fish, including the far side.
  const stops: [number, string][] = [
    [0, spec.palette.back],
    [0.09, spec.palette.back],
    [0.19, spec.palette.flank],
    [0.245, "#cbd2bf"],
    [0.28, "#e6e7db"],
    [0.34, spec.palette.belly],
    [0.5, "#bac8cf"],
    [0.66, spec.palette.belly],
    [0.72, "#e6e7db"],
    [0.755, "#cbd2bf"],
    [0.81, spec.palette.flank],
    [0.91, spec.palette.back],
    [1, spec.palette.back],
  ];
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 512);
  // Painted silver reflections stay part of the skin under the fixed aquarium light.
  // Mirroring the brushwork keeps both sides consistent when the fish turns.
  function reflection(
    x: number,
    y: number,
    rx: number,
    ry: number,
    opacity: number,
  ) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    glow.addColorStop(0, `rgba(235,249,255,${opacity})`);
    glow.addColorStop(0.45, `rgba(216,239,248,${opacity * 0.6})`);
    glow.addColorStop(1, "rgba(216,239,248,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  for (const side of [1, -1]) {
    const y = (v: number) => (side === 1 ? v : 512 - v);
    reflection(400, y(63), 240, 13, 0.8);
    reflection(400, y(62), 205, 3, 0.45);
    reflection(610, y(69), 210, 9, 0.35);
    reflection(215, y(140), 105, 35, 0.55);
    reflection(510, y(177), 300, 23, 0.5);
  }
  // Broad, barely visible scale facets instead of a realistic fine-scale grid.
  for (const center of [169, 343]) {
    for (let i = 0; i < 29; i++) {
      const x = 330 + i * 23;
      const sheen = ctx.createLinearGradient(
        x,
        center - 18,
        x + 13,
        center + 20,
      );
      sheen.addColorStop(0, "rgba(255,255,255,0)");
      sheen.addColorStop(0.48, "rgba(255,255,255,.22)");
      sheen.addColorStop(1, "rgba(122,147,160,.035)");
      ctx.fillStyle = sheen;
      ctx.beginPath();
      ctx.moveTo(x, center - 19);
      ctx.quadraticCurveTo(x + 22, center, x + 9, center + 24);
      ctx.quadraticCurveTo(x + 2, center + 9, x, center - 19);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function bodyGeometry() {
  const vertices: number[] = [], uvs: number[] = [];
  const bodyIndices: number[] = [], jawIndices: number[] = [];
  const rings = 112, headRings = 10, sides = 64;
  const [hingeHeight, , hingeCenter] = section(mouthHinge.x);
  const hingeAngle = Math.acos((mouthHinge.y - hingeCenter) / hingeHeight);
  for (let i = 0; i <= rings; i++) {
    const x = i <= headRings
      ? THREE.MathUtils.lerp(-1.98, mouthHinge.x, i / headRings)
      : THREE.MathUtils.lerp(mouthHinge.x, 1.9, (i - headRings) / (rings - headRings));
    const [h, w, cy] = section(x);
    const lipAngle = i <= headRings
      ? Math.acos(THREE.MathUtils.clamp((mouthHeight(x) - cy) / h, -1, 1))
      : THREE.MathUtils.lerp(hingeAngle, Math.PI / 2, THREE.MathUtils.smoothstep(x, mouthHinge.x, -1.4));
    for (let j = 0; j <= sides; j++) {
      // Include the lip boundaries in every head ring. Both halves therefore
      // share exactly the same seam instead of overlapping floating lip pieces.
      const angle = j <= 16
        ? lipAngle * j / 16
        : j <= 48
          ? lipAngle + (Math.PI * 2 - lipAngle * 2) * (j - 16) / 32
          : Math.PI * 2 - lipAngle + lipAngle * (j - 48) / 16;
      vertices.push(x, cy + Math.cos(angle) * h, Math.sin(angle) * w);
      uvs.push((x + 1.98) / 3.88, 1 - angle / (Math.PI * 2));
    }
  }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < sides; j++) {
      const indices = i < headRings && j >= 16 && j < 48 ? jawIndices : bodyIndices;
      const a = i * (sides + 1) + j, b = a + sides + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const nose = vertices.length / 3;
  vertices.push(-1.99, profile[0][3], 0);
  uvs.push(0, 0.5);
  for (let j = 0; j < sides; j++)
    (j >= 16 && j < 48 ? jawIndices : bodyIndices).push(nose, j + 1, j);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  // Compute normals before separating the surfaces, preserving a smooth closed snout.
  geometry.setIndex([...bodyIndices, ...jawIndices]);
  geometry.computeVertexNormals();
  const jaw = geometry.clone();
  geometry.setIndex(bodyIndices);
  jaw.setIndex(jawIndices);
  return { body: geometry, jaw };
}

/** Inner surfaces meet the lip seam and extend back to the mouth corner. */
function mouthInteriorGeometry() {
  const positions: number[] = [], indices: number[] = [];
  const segments = 32;
  for (let i = 0; i <= segments; i++) {
    const x = THREE.MathUtils.lerp(-1.98, mouthHinge.x, i / segments);
    const y = mouthHeight(x);
    positions.push(...surface(x, y, -1, 0), ...surface(x, y, 1, 0));
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const nose = positions.length / 3;
  positions.push(-1.99, 0.055, 0);
  indices.push(nose, 1, 0);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createFish(spec: FishSpecies): FishInstance {
  if (spec.body !== "carangid" && spec.body !== "clupeid")
    throw new Error(`Unsupported fish body: ${spec.body}`);
  const isSardine = spec.body === "clupeid";
  const group = new THREE.Group();
  group.name = spec.id;
  const time = { value: 0 };
  const materials = new Set<THREE.Material>();
  function animated<T extends THREE.MeshStandardMaterial>(material: T): T {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uFishTime = time;
      shader.vertexShader =
        `uniform float uFishTime;
        float bend(float x) { float s=max(0.0,(x+1.05)/3.6); return sin(uFishTime*${spec.motion.frequency.toFixed(3)}-x*1.8)*s*s*${spec.motion.amplitude.toFixed(3)}*3.0; }
      ` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <beginnormal_vertex>",
        "#include <beginnormal_vertex>\n objectNormal.x -= ((bend(position.x+0.01)-bend(position.x-0.01))/0.02)*objectNormal.z;",
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n transformed.z += bend(position.x);",
      );
    };
    material.customProgramCacheKey = () => `fish-${spec.id}`;
    materials.add(material);
    return material;
  }
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material) {
    const object = new THREE.Mesh(geometry, material);
    group.add(object);
    return object;
  }
  const texture = skinTexture(spec);
  const skin = animated(
    new THREE.MeshPhysicalMaterial({ map: texture, ...style.surface }),
  );
  const fin = animated(
    new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      vertexColors: true,
      ...style.fin,
      side: THREE.DoubleSide,
    }),
  );
  const ray = animated(
    new THREE.MeshStandardMaterial({
      color: spec.palette.finRay,
      roughness: 0.55,
      metalness: 0.15,
    }),
  );
  const outline = animated(
    new THREE.MeshStandardMaterial({
      color: style.details.outline,
      roughness: 0.4,
      metalness: 0.2,
    }),
  );
  const silver = animated(
    new THREE.MeshPhysicalMaterial({ color: "#d8e2e5", ...style.surface }),
  );
  const gillEdge = animated(
    new THREE.MeshStandardMaterial({
      color: "#566d7a",
      metalness: 0.38,
      roughness: 0.4,
    }),
  );
  const eyeRim = animated(
    new THREE.MeshStandardMaterial({
      color: style.details.eyeRim,
      roughness: 0.32,
    }),
  );
  const iris = animated(
    new THREE.MeshPhysicalMaterial({
      color: style.details.iris,
      vertexColors: true,
      roughness: 0.27,
      clearcoat: 0.8,
    }),
  );
  const pupil = animated(
    new THREE.MeshPhysicalMaterial({
      color: style.details.pupil,
      roughness: 0.16,
      clearcoat: 1,
      envMapIntensity: 0.4,
    }),
  );
  const highlight = animated(
    new THREE.MeshStandardMaterial({
      color: style.details.highlight,
      emissive: style.details.highlight,
      emissiveIntensity: 0.65,
    }),
  );
  const bodyParts = bodyGeometry();
  mesh(bodyParts.body, skin);
  const jaw = new THREE.Group();
  jaw.name = jawName;
  jaw.add(new THREE.Mesh(bodyParts.jaw, skin));
  group.add(jaw);
  const mouthInterior = new THREE.MeshStandardMaterial({
    color: "#13212b",
    roughness: 1,
    side: THREE.DoubleSide,
  });
  materials.add(mouthInterior);
  const innerSurface = mouthInteriorGeometry();
  // Roof and lower palate separate with the real lower jaw; no dark decal or
  // hollow gap is needed on the closed body.
  const mouthRoof = new THREE.Mesh(innerSurface, mouthInterior);
  const lowerPalate = new THREE.Mesh(innerSurface.clone(), mouthInterior);
  group.add(mouthRoof);
  jaw.add(lowerPalate);

  function tube(points: Point[], radius: number, material: THREE.Material) {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...p)),
    );
    return mesh(
      new THREE.TubeGeometry(
        curve,
        Math.max(16, points.length * 8),
        radius,
        6,
        false,
      ),
      material,
    );
  }
  function ellipsoid(center: Point, scale: Point, material: THREE.Material) {
    const geometry = new THREE.SphereGeometry(1, 40, 28);
    geometry.scale(...scale);
    geometry.translate(...center);
    mesh(geometry, material);
  }
  function curve(points: Point[]) {
    return new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...p)),
    );
  }

  // Shared tessellation for fin membranes and their curved rays.
  function finSurface(
    point: (t: number, v: number) => THREE.Vector3,
    rays: number,
    rayRadius = 0.003,
  ) {
    const positions: number[] = [],
      uvs: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    const finColor = new THREE.Color(spec.palette.fin);
    const finEdge = new THREE.Color(spec.palette.finEdge);
    const along = 192,
      across = 10;
    for (let i = 0; i <= along; i++)
      for (let j = 0; j <= across; j++) {
        const t = i / along,
          v = j / across;
        const p = point(t, v);
        positions.push(p.x, p.y, p.z);
        uvs.push(t, v);
        const rib = Math.pow(0.5 + 0.5 * Math.cos(t * rays * Math.PI * 2), 5);
        const color = finColor.clone().lerp(finEdge, 0.08 + v * 0.28);
        color.multiplyScalar(
          0.88 + 0.12 * v - rib * 0.26 * Math.sin(Math.PI * v),
        );
        colors.push(color.r, color.g, color.b);
      }
    for (let i = 0; i < along; i++)
      for (let j = 0; j < across; j++) {
        const a = i * (across + 1) + j,
          b = a + across + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    mesh(geometry, fin);
    for (let i = 1; i < rays; i++) {
      const points: Point[] = [];
      for (let j = 0; j <= 10; j++)
        points.push(point(i / rays, j / 10).toArray() as Point);
      tube(points, rayRadius, ray);
    }
  }
  // Curved membrane for the pectoral fins and tail lobes.
  function ribbonFin(
    base: Point[],
    edge: Point[],
    rays: number,
    scallop = 0.012,
  ) {
    const rootCurve = curve(base),
      edgeCurve = curve(edge);
    finSurface((t, v) => {
      const root = rootCurve.getPoint(t),
        tip = edgeCurve.getPoint(t);
      const dip =
        Math.sin(t * Math.PI) *
        Math.pow(Math.sin(t * rays * Math.PI), 2) *
        scallop;
      tip.lerp(root, dip);
      const p = root.lerp(tip, v);
      p.z += Math.sin(v * Math.PI) * Math.sin(t * Math.PI) * 0.024;
      return p;
    }, rays);
  }

  // Fin roots follow the body cross section. A smooth, monotonic envelope prevents
  // folded triangles, serrated edges and gaps between the membrane and body.
  function bodyFin(
    start: number,
    end: number,
    height: number,
    peak: number,
    rays: number,
    angle = 0,
  ) {
    const rise = 1.35,
      fall = (rise * (1 - peak)) / peak;
    finSurface(
      (t, v) => {
        const x = THREE.MathUtils.lerp(start, end, t);
        const [radius, width, center] = section(x);
        const envelope =
          height *
          Math.pow(t / peak, rise) *
          Math.pow((1 - t) / (1 - peak), fall);
        const sweep = Math.sin(Math.PI * t) * 0.16;
        return new THREE.Vector3(
          x + sweep * v,
          center + (radius - 0.012 + envelope * v) * Math.cos(angle),
          (width - 0.006 + envelope * v * 0.55) * Math.sin(angle) +
            Math.sin(Math.PI * v) *
              Math.sin(Math.PI * t) *
              0.012 *
              Math.cos(angle),
        );
      },
      rays,
      0.0025,
    );
  }
  if (isSardine) {
    bodyFin(-0.35, 0.46, 0.46, 0.49, 12);
    bodyFin(0.6, 1.43, 0.22, 0.3, 12, Math.PI);
  } else {
    bodyFin(-0.88, -0.06, 0.44, 0.66, 11);
    bodyFin(0.06, 1.44, 0.34, 0.27, 17);
    bodyFin(0.03, 1.4, 0.27, 0.3, 15, Math.PI);
  }

  // Two rounded, tapered lobes form a deeply forked golden tail.
  for (const sign of [-1, 1]) {
    const tailScale = spec.shape.tailSize;
    const tailPoint = (x: number, y: number): Point => [
      1.73 + (x - 1.73) * tailScale,
      y * tailScale * sign,
      0,
    ];
    ribbonFin(
      [tailPoint(1.73, -0.025), tailPoint(1.88, -0.02), tailPoint(2.13, 0)],
      [
        tailPoint(1.73, 0.025),
        tailPoint(2.14, 0.45),
        tailPoint(2.72, 0.88),
        tailPoint(2.48, 0.44),
        tailPoint(2.13, 0),
      ],
      10,
      0.004,
    );
  }
  for (const side of [-1, 1]) {
    // Pectoral fins angle outward so they remain legible from the front and above.
    ribbonFin(
      [
        [-0.84, -0.07, 0.326 * side],
        [-0.78, -0.14, 0.337 * side],
        [-0.7, -0.28, 0.31 * side],
      ],
      [
        [-0.84, -0.07, 0.326 * side],
        [-0.3, 0.065, 0.48 * side],
        [0.16, 0.055, 0.55 * side],
        [-0.23, -0.26, 0.53 * side],
        [-0.7, -0.28, 0.31 * side],
      ],
      9,
      0.015,
    );
    bodyFin(
      isSardine ? -0.24 : -0.77,
      isSardine ? 0.16 : -0.24,
      isSardine ? 0.2 : 0.26,
      0.58,
      8,
      Math.PI - side * 0.35,
    );

    // The operculum is outlined in silver, with a small dark shoulder marking.
    const gill: Point[] = [
      [-1.17, 0.4],
      [-0.98, 0.3],
      [-0.88, 0.06],
      [-0.94, -0.25],
      [-1.15, -0.42],
      [-1.44, -0.34],
    ].map(([x, y]) => surface(x, y, side, 0.012));
    tube(gill, 0.012, gillEdge);
    tube(
      gill.map(([x, y, z]) => [x - 0.014, y - 0.008, z + 0.005 * side]),
      0.009,
      silver,
    );
    const cheek: Point[] = [
      [-1.61, -0.12],
      [-1.44, -0.32],
      [-1.22, -0.32],
      [-1.15, -0.09],
      [-1.2, 0.27],
    ].map(([x, y]) => surface(x, y, side, 0.01));
    tube(cheek, 0.008, silver);
    const spot = surface(-0.96, 0.25, side, 0.006);
    ellipsoid(spot, [0.067, 0.113, 0.02], outline);

    // Thin, surface-conforming eye layers avoid stacked discs projecting from the head.
    // All points are baked in fish coordinates and share the same swimming deformation.
    function surfaceDisc(
      ex: number,
      ey: number,
      rx: number,
      ry: number,
      lift: number,
      material: THREE.Material,
    ) {
      const positions: number[] = [...surface(ex, ey, side, lift)];
      const indices: number[] = [];
      const rings = 12,
        segments = 64;
      for (let ring = 1; ring <= rings; ring++) {
        const radius = ring / rings;
        for (let segment = 0; segment < segments; segment++) {
          const theta = (segment / segments) * Math.PI * 2;
          positions.push(
            ...surface(
              ex + Math.cos(theta) * rx * radius,
              ey + Math.sin(theta) * ry * radius,
              side,
              lift,
            ),
          );
        }
      }
      for (let segment = 0; segment < segments; segment++) {
        const next = (segment + 1) % segments;
        indices.push(0, 1 + segment, 1 + next);
        for (let ring = 0; ring < rings - 1; ring++) {
          const a = 1 + ring * segments + segment,
            b = 1 + ring * segments + next;
          indices.push(a, a + segments, b, b, a + segments, b + segments);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(
          new Float32Array((positions.length / 3) * 2),
          2,
        ),
      );
      if (material === iris) {
        const colors: number[] = [];
        for (let i = 0; i < positions.length; i += 3) {
          const x = (positions[i] - ex) / rx;
          const y = (positions[i + 1] - ey) / ry;
          const radius = Math.min(1, Math.hypot(x, y));
          const brightness =
            0.72 + 0.24 * Math.sin(Math.PI * radius) + 0.08 * y;
          colors.push(brightness, brightness, brightness);
        }
        geometry.setAttribute(
          "color",
          new THREE.Float32BufferAttribute(colors, 3),
        );
      }
      geometry.setIndex(side === 1 ? indices : [...indices].reverse());
      geometry.computeVertexNormals();
      mesh(geometry, material);
    }
    function eyePatch(
      rx: number,
      ry: number,
      lift: number,
      dx: number,
      dy: number,
      material: THREE.Material,
    ) {
      const size = style.proportions.eyeScale;
      // Keep the eye round when the species has a longer, shallower body.
      const diameter = Math.min(spec.shape.length, spec.shape.height);
      const xScale = diameter / spec.shape.length;
      const yScale = diameter / spec.shape.height;
      surfaceDisc(
        -1.48 + dx * size * xScale,
        0.16 + dy * size * yScale,
        rx * size * xScale,
        ry * size * yScale,
        lift,
        material,
      );
    }
    if (isSardine) {
      // Flush, bilateral markings, without the raised scutes of the horse mackerel.
      for (let i = 0; i < 9; i++) {
        const x = -0.69 + i * 0.23;
        const [h, , cy] = section(x);
        const radius = 0.048 - i * 0.0013;
        surfaceDisc(
          x,
          cy + h * 0.37,
          radius / spec.shape.length,
          radius / spec.shape.height,
          0.003,
          outline,
        );
      }
    }
    eyePatch(0.216, 0.219, 0.004, 0, 0, silver);
    eyePatch(0.205, 0.208, 0.007, -0.004, 0.002, eyeRim);
    eyePatch(0.182, 0.185, 0.01, -0.006, 0.004, iris);
    eyePatch(0.124, 0.132, 0.013, -0.018, 0.006, pupil);
    eyePatch(0.026, 0.028, 0.016, -0.058, 0.074, highlight);
    eyePatch(0.009, 0.009, 0.016, 0.032, -0.042, highlight);
    ellipsoid(surface(-1.8, 0.13, side, 0.012), [0.024, 0.026, 0.012], outline);

    const lateral: Point[] = [];
    for (let i = 0; i <= 40; i++) {
      const x = -0.64 + (i / 40) * 2.39,
        [, , cy] = section(x);
      const y = 0.024 * (1 - THREE.MathUtils.smoothstep(x, 0.2, 0.9)) + cy;
      lateral.push(surface(x, y, side, 0.004));
    }
    const lineMaterial = animated(
      new THREE.MeshStandardMaterial({
        color: spec.palette.stripe,
        metalness: 0.25,
        roughness: 0.45,
      }),
    );
    tube(lateral, 0.005, lineMaterial);
    for (let i = 0; i < (isSardine ? 0 : 25); i++) {
      const x = 0.4 + i * 0.051,
        [, , cy] = section(x);
      const center = surface(x, cy + 0.015, side, 0.006);
      const size = 0.022 - i * 0.0004;
      tube(
        [
          [center[0] - 0.018, center[1] + size, center[2]],
          [center[0] + 0.01, center[1], center[2] + 0.005 * side],
          [center[0] - 0.018, center[1] - size, center[2]],
        ],
        0.0035,
        lineMaterial,
      );
    }
  }

  // Each lip stays seated on its head surface. The lower silver lip travels
  // with the jaw, while the upper seam stays attached to the snout.
  function mouthContour(drop: number): Point[] {
    const halves = [-1, 1].map((side) => {
      const points: Point[] = [];
      for (let i = 1; i <= 32; i++) {
        const t = i / 32;
        const x = THREE.MathUtils.lerp(-1.98, mouthHinge.x, t);
        const y = mouthHeight(x) - drop * Math.sin(Math.PI * t);
        points.push(surface(x, y, side, 0));
      }
      return points;
    });
    return [...halves[0].reverse(), [-1.99, 0.055, 0], ...halves[1]];
  }
  jaw.add(tube(mouthContour(0.028), 0.012, silver));
  tube(mouthContour(0), 0.009, outline);

  // Baking and merging in fish coordinates lets school members share all resources.
  for (const material of materials) {
    const parts = group.children.filter(
      (o): o is THREE.Mesh =>
        o instanceof THREE.Mesh && o.material === material,
    );
    if (parts.length < 2) continue;
    const combined = mergeGeometries(parts.map((p) => p.geometry));
    for (const part of parts) {
      group.remove(part);
      part.geometry.dispose();
    }
    mesh(combined, material);
  }
  group.scale.set(spec.shape.length, spec.shape.height, spec.shape.width);
  return {
    group,
    mouthPosition: new THREE.Vector3(-1.995, -0.04, 0),
    update: (t, mouthOpen = 0) => {
      time.value = t;
      setFishMouthOpen(group, mouthOpen);
    },
    dispose: () => {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      materials.forEach((m) => m.dispose());
      texture.dispose();
    },
  };
}
