import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { FishSpecies } from "./species";
import { setFishMouthOpen, type FishInstance } from "./fishModel";

type Point = [number, number, number];
const hinge: [number, number] = [-1.17, -0.28];
const snout = -2.06;
// A broad head and deep shoulder, with a short, thick tail wrist.
const profile = [
  [snout, 0.045, 0.11, 0.015],
  [-1.88, 0.3, 0.27, -0.015],
  [-1.6, 0.49, 0.4, 0.015],
  [-1.22, 0.67, 0.52, 0],
  [-0.7, 0.77, 0.56, -0.025],
  [-0.12, 0.72, 0.49, -0.04],
  [0.48, 0.55, 0.37, -0.03],
  [1, 0.33, 0.235, 0.005],
  [1.38, 0.145, 0.14, 0.045],
  [1.65, 0.105, 0.115, 0.065],
  [1.82, 0.07, 0.085, 0.065],
];

function section(x: number) {
  let i = 0;
  while (i < profile.length - 2 && x > profile[i + 1][0]) i++;
  const a = profile[i],
    b = profile[i + 1];
  const t = THREE.MathUtils.clamp((x - a[0]) / (b[0] - a[0]), 0, 1);
  return [1, 2, 3].map((k) => {
    const prev = profile[Math.max(0, i - 1)],
      next = profile[Math.min(profile.length - 1, i + 2)];
    const m0 = ((b[k] - prev[k]) / (b[0] - prev[0])) * (b[0] - a[0]);
    const m1 = ((next[k] - a[k]) / (next[0] - a[0])) * (b[0] - a[0]);
    return (
      (2 * t ** 3 - 3 * t * t + 1) * a[k] +
      (t ** 3 - 2 * t * t + t) * m0 +
      (-2 * t ** 3 + 3 * t * t) * b[k] +
      (t ** 3 - t * t) * m1
    );
  });
}

function surface(x: number, y: number, side: number, lift = 0.008): Point {
  const [h, w, cy] = section(x);
  return [
    x,
    y,
    (w * Math.sqrt(Math.max(0, 1 - ((y - cy) / h) ** 2)) + lift) * side,
  ];
}

function lipHeight(x: number) {
  const t = THREE.MathUtils.clamp((x - snout) / (hinge[0] - snout), 0, 1);
  return 0.015 - 0.295 * t ** 0.9;
}

function mottledTexture(spec: FishSpecies) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const base = ctx.createLinearGradient(0, 0, 0, 512);
  for (const [stop, color] of [
    [0, spec.palette.back],
    [0.13, "#9c593f"],
    [0.26, spec.palette.flank],
    [0.38, "#d2966f"],
    [0.45, spec.palette.belly],
    [0.5, "#c3b4a7"],
    [0.55, spec.palette.belly],
    [0.62, "#d2966f"],
    [0.74, spec.palette.flank],
    [0.87, "#9c593f"],
    [1, spec.palette.back],
  ] as [number, string][])
    base.addColorStop(stop, color);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 1024, 512);
  let seed = 42137;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  function patch(x: number, y: number, rx: number, ry: number, color: string) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2,
        radius = 0.64 + random() * 0.45;
      const px = x + Math.cos(a) * rx * radius,
        py = y + Math.sin(a) * ry * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  for (const side of [0, 1]) {
    const y = (value: number) => (side === 0 ? value : 512 - value);
    // Uneven, broad patches, rather than an evenly spaced dot pattern.
    for (let i = 0; i < 44; i++) {
      patch(
        random() * 1060 - 18,
        y(12 + random() * 180),
        24 + random() * 50,
        10 + random() * 24,
        ["#884e3cb8", "#9b5038bb", "#d17443ad"][i % 3],
      );
    }
    for (let i = 0; i < 58; i++) {
      const large = i % 4 === 0;
      patch(
        random() * 1024,
        y(20 + random() * 183),
        large ? 28 + random() * 16 : 9 + random() * 12,
        large ? 17 + random() * 10 : 5 + random() * 8,
        ["#edc5a0", "#d8a581", "#f0ceab"][i % 3],
      );
    }
    for (let i = 0; i < 130; i++) {
      patch(
        random() * 1024,
        y(random() * 245),
        20 + random() * 24,
        10 + random() * 12,
        i % 2 ? "#fff0d609" : "#582e250b",
      );
    }
  }
  // A broad, warm sheen gives volume under the aquarium's uniform lighting.
  for (const y of [96, 416]) {
    ctx.save();
    ctx.translate(400, y);
    ctx.scale(400, 20);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    glow.addColorStop(0, "#ffe0b91a");
    glow.addColorStop(1, "#ffe0b900");
    ctx.fillStyle = glow;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function headAndBody() {
  const positions: number[] = [],
    uv: number[] = [],
    bodyIndices: number[] = [],
    jawIndices: number[] = [];
  const rings = 104,
    headRings = 30,
    sides = 48;
  const [hh, , hc] = section(hinge[0]);
  const hingeAngle = Math.acos((hinge[1] - hc) / hh);
  for (let i = 0; i <= rings; i++) {
    const x =
      i <= headRings
        ? THREE.MathUtils.lerp(snout, hinge[0], i / headRings)
        : THREE.MathUtils.lerp(
            hinge[0],
            1.82,
            (i - headRings) / (rings - headRings),
          );
    const [h, w, cy] = section(x);
    const lip =
      i <= headRings
        ? Math.acos(THREE.MathUtils.clamp((lipHeight(x) - cy) / h, -1, 1))
        : THREE.MathUtils.lerp(
            hingeAngle,
            Math.PI / 2,
            THREE.MathUtils.smoothstep(x, hinge[0], -0.7),
          );
    for (let j = 0; j <= sides; j++) {
      const angle =
        j <= 12
          ? (lip * j) / 12
          : j <= 36
            ? lip + ((2 * Math.PI - 2 * lip) * (j - 12)) / 24
            : 2 * Math.PI - lip + (lip * (j - 36)) / 12;
      positions.push(x, cy + Math.cos(angle) * h, Math.sin(angle) * w);
      uv.push((x - snout) / (1.82 - snout), 1 - angle / (2 * Math.PI));
      if (i < rings && j < sides) {
        const a = i * (sides + 1) + j,
          b = a + sides + 1;
        (i < headRings && j >= 12 && j < 36 ? jawIndices : bodyIndices).push(
          a,
          a + 1,
          b,
          b,
          a + 1,
          b + 1,
        );
      }
    }
  }
  const nose = positions.length / 3;
  positions.push(-2.09, 0.015, 0);
  uv.push(0, 0.5);
  for (let j = 0; j < sides; j++)
    (j >= 12 && j < 36 ? jawIndices : bodyIndices).push(nose, j + 1, j);
  const tail = positions.length / 3;
  positions.push(1.83, 0.065, 0);
  uv.push(1, 0.5);
  for (let j = 0; j < sides; j++)
    bodyIndices.push(
      tail,
      rings * (sides + 1) + j,
      rings * (sides + 1) + j + 1,
    );
  const body = new THREE.BufferGeometry();
  body.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  body.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  body.setIndex([...bodyIndices, ...jawIndices]);
  body.computeVertexNormals();
  const jaw = body.clone();
  body.setIndex(bodyIndices);
  jaw.setIndex(jawIndices);
  return { body, jaw };
}

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
    result.onBeforeCompile = (shader) => {
      shader.uniforms.uFishTime = time;
      shader.vertexShader =
        `uniform float uFishTime;
        float bend(float x){float s=max(0.0,(x+0.8)/3.5);return sin(uFishTime*${spec.motion.frequency.toFixed(3)}-x*1.5)*s*s*${spec.motion.amplitude.toFixed(3)}*3.0;}
        ` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <beginnormal_vertex>",
        "#include <beginnormal_vertex>\nobjectNormal.x-=((bend(position.x+.01)-bend(position.x-.01))/.02)*objectNormal.z;",
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\ntransformed.z+=bend(position.x);",
      );
    };
    result.customProgramCacheKey = () => `rockfish-${spec.id}`;
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
  const inside = material("#412b28", { side: THREE.DoubleSide, roughness: 1 });
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
  const jaw = new THREE.Group();
  jaw.name = "fish-lower-jaw";
  jaw.userData.hinge = hinge;
  jaw.userData.maxAngle = 0.56;
  group.add(jaw);
  mesh(parts.jaw, skin, jaw);
  const innerPositions: number[] = [],
    innerIndices: number[] = [];
  for (let i = 0; i <= 36; i++) {
    const x = THREE.MathUtils.lerp(snout, hinge[0], i / 36),
      y = lipHeight(x);
    innerPositions.push(...surface(x, y, -1, 0), ...surface(x, y, 1, 0));
    if (i < 36) {
      const a = i * 2;
      innerIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const inner = new THREE.BufferGeometry();
  inner.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(innerPositions, 3),
  );
  inner.setIndex(innerIndices);
  inner.computeVertexNormals();
  mesh(inner, inside);
  mesh(inner.clone(), inside, jaw);
  function mouthLine(drop = 0): Point[] {
    const halves = [-1, 1].map((side) =>
      Array.from({ length: 37 }, (_, i) => {
        const t = i / 36,
          x = THREE.MathUtils.lerp(snout, hinge[0], t);
        return surface(
          x,
          lipHeight(x) - drop * Math.sin(Math.PI * t),
          side,
          0.002,
        );
      }),
    );
    return [...halves[0].reverse(), [-2.09, 0.015, 0], ...halves[1]];
  }
  tube(mouthLine(), 0.021, lipMaterial);
  tube(mouthLine(0.028), 0.024, lipMaterial, jaw);

  // Recessed cheek linings close the sides of the gape. Their lower edges follow
  // the jaw exactly; each cloned mesh retains independent morph influences.
  const liningPositions: number[] = [],
    liningNormals: number[] = [];
  const liningIndices: number[] = [],
    cosineDelta: number[] = [],
    sineDelta: number[] = [];
  for (const side of [-1, 1]) {
    const start = liningPositions.length / 3;
    const contour: Point[] = [[-2.09, 0.015, 0]];
    for (let i = 0; i <= 36; i++) {
      const x = THREE.MathUtils.lerp(snout, hinge[0], i / 36);
      contour.push(surface(x, lipHeight(x), side, -0.004));
    }
    for (let i = 0; i < contour.length; i++) {
      const [x, y, z] = contour[i];
      liningPositions.push(x, y, z, x, y, z);
      liningNormals.push(0, 0, side, 0, 0, side);
      cosineDelta.push(0, 0, 0, x - hinge[0], y - hinge[1], 0);
      sineDelta.push(0, 0, 0, -(y - hinge[1]), x - hinge[0], 0);
      if (i < contour.length - 1) {
        const a = start + i * 2,
          b = a + 2;
        const indices = [a, a + 1, b, b, a + 1, b + 1];
        liningIndices.push(...(side === 1 ? indices : indices.reverse()));
      }
    }
  }
  const liningGeometry = new THREE.BufferGeometry();
  liningGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(liningPositions, 3),
  );
  liningGeometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(liningNormals, 3),
  );
  liningGeometry.setIndex(liningIndices);
  liningGeometry.morphTargetsRelative = true;
  liningGeometry.morphAttributes.position = [
    new THREE.Float32BufferAttribute(cosineDelta, 3),
    new THREE.Float32BufferAttribute(sineDelta, 3),
  ];
  const mouthParts = new THREE.Group();
  group.add(mouthParts);
  mesh(liningGeometry, inside, mouthParts).name = "fish-mouth-lining";

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
    mouthPosition: new THREE.Vector3(-2.09, -0.16, 0),
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
