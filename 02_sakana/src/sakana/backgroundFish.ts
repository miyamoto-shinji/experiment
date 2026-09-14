import * as THREE from "three";
import { iwashiSpecies } from "./iwashi";

type BackgroundFishKind = "small" | "large";
type Point = [number, number, number];
type Section = [number, number, number, number];

export interface BackgroundFish {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshBasicMaterial;
  update: (elapsed: number, depth: number) => void;
  dispose: () => void;
}

/** Small residents are lightweight iwashi; the distant visitor keeps its silhouette. */
export function createBackgroundFish(kind: BackgroundFishKind): BackgroundFish {
  const large = kind === "large";
  const profile: Section[] = large
    ? [
        [-1.2, 0, 0, 0.012],
        [-1.15, 0.078, 0.065, 0.009],
        [-0.97, 0.156, 0.116, 0.005],
        [-0.68, 0.219, 0.163, 0],
        [-0.35, 0.225, 0.171, -0.004],
        [0.02, 0.189, 0.141, -0.006],
        [0.36, 0.125, 0.088, -0.003],
        [0.65, 0.057, 0.041, 0.003],
        [0.85, 0.019, 0.018, 0.006],
      ]
    : [
        [-1.2, 0, 0, 0.014],
        [-1.15, 0.054, 0.042, 0.012],
        [-0.97, 0.119, 0.08, 0.009],
        [-0.66, 0.164, 0.112, 0],
        [-0.3, 0.172, 0.115, -0.006],
        [0.08, 0.145, 0.094, -0.008],
        [0.42, 0.092, 0.061, -0.002],
        [0.69, 0.038, 0.029, 0.004],
        [0.85, 0.014, 0.013, 0.006],
      ];

  function section(x: number): [number, number, number] {
    let i = 0;
    while (i < profile.length - 2 && x > profile[i + 1][0]) i++;
    const a = profile[i],
      b = profile[i + 1];
    const t = THREE.MathUtils.clamp((x - a[0]) / (b[0] - a[0]), 0, 1);
    const previous = profile[Math.max(0, i - 1)];
    const next = profile[Math.min(profile.length - 1, i + 2)];
    return [1, 2, 3].map((k) => {
      const m0 = ((b[k] - previous[k]) / (b[0] - previous[0])) * (b[0] - a[0]);
      const m1 = ((next[k] - a[k]) / (next[0] - a[0])) * (b[0] - a[0]);
      return (
        (2 * t ** 3 - 3 * t ** 2 + 1) * a[k] +
        (t ** 3 - 2 * t ** 2 + t) * m0 +
        (-2 * t ** 3 + 3 * t ** 2) * b[k] +
        (t ** 3 - t ** 2) * m1
      );
    }) as [number, number, number];
  }

  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const back = new THREE.Color(large ? "#3b627b" : iwashiSpecies.palette.back);
  const flank = new THREE.Color(
    large ? "#6c91a2" : iwashiSpecies.palette.flank,
  );
  const belly = new THREE.Color(
    large ? "#93acb7" : iwashiSpecies.palette.belly,
  );
  const finRoot = new THREE.Color(
    large ? "#4c758b" : iwashiSpecies.palette.fin,
  );
  const finEdge = new THREE.Color(
    large ? "#3d647b" : iwashiSpecies.palette.finRay,
  );

  function vertex(point: Point, color: THREE.Color) {
    const index = positions.length / 3;
    positions.push(...point);
    colors.push(color.r, color.g, color.b);
    return index;
  }

  const rings = 48,
    sides = 24;
  for (let ring = 0; ring <= rings; ring++) {
    const x = THREE.MathUtils.lerp(-1.2, 0.85, ring / rings);
    const [height, width, center] = section(x);
    for (let side = 0; side <= sides; side++) {
      const angle = (side / sides) * Math.PI * 2;
      const vertical = Math.cos(angle);
      const color = flank.clone();
      if (vertical > 0) color.lerp(back, vertical ** 1.3);
      else color.lerp(belly, (-vertical) ** 0.65);
      // Broad painted light gives the unlit mesh a soft, rounded silver flank.
      const sheen = Math.exp(-(((vertical - 0.28) / 0.18) ** 2));
      const shoulder = 1 - THREE.MathUtils.smoothstep(x, -0.45, 0.78);
      color.lerp(belly, sheen * shoulder * (large ? 0.1 : 0.25));
      vertex([x, center + vertical * height, Math.sin(angle) * width], color);
    }
  }
  for (let ring = 0; ring < rings; ring++) {
    for (let side = 0; side < sides; side++) {
      const a = ring * (sides + 1) + side,
        b = a + sides + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const tailCap = vertex([0.86, 0.006, 0], finRoot);
  for (let side = 0; side < sides; side++) {
    const a = rings * (sides + 1) + side;
    indices.push(a, a + 1, tailCap);
  }

  function curve(a: Point, control: Point, b: Point) {
    return new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(...a),
      new THREE.Vector3(...control),
      new THREE.Vector3(...b),
    );
  }

  // Curved, opaque membranes need no extra objects or sorting passes.
  function fin(
    start: Point,
    rootControl: Point,
    end: Point,
    tip: Point,
    leadingControl: Point,
    trailingControl: Point,
    shade = 1,
  ) {
    const root = curve(start, rootControl, end);
    const leading = curve(start, leadingControl, tip);
    const trailing = curve(tip, trailingControl, end);
    const offset = positions.length / 3;
    const along = 12,
      across = 4;
    for (let i = 0; i <= along; i++) {
      const t = i / along;
      const a = root.getPoint(t);
      const b =
        t <= 0.5 ? leading.getPoint(t * 2) : trailing.getPoint(t * 2 - 1);
      for (let j = 0; j <= across; j++) {
        const v = j / across;
        const point = a.clone().lerp(b, v);
        const rib = Math.sin(t * Math.PI * 12) ** 2;
        const color = finRoot
          .clone()
          .lerp(finEdge, v * 0.72)
          .multiplyScalar(shade * (1 - rib * 0.055 * Math.sin(v * Math.PI)));
        vertex(point.toArray() as Point, color);
      }
    }
    for (let i = 0; i < along; i++) {
      for (let j = 0; j < across; j++) {
        const a = offset + i * (across + 1) + j,
          b = a + across + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }

  function surfaceEdge(x: number, sign: number): Point {
    const [height, , center] = section(x);
    return [x, center + sign * (height - 0.009), 0];
  }

  fin(
    surfaceEdge(-0.58, 1),
    surfaceEdge(-0.16, 1),
    surfaceEdge(0.32, 1),
    [-0.26, large ? 0.34 : 0.285, 0],
    [-0.45, large ? 0.31 : 0.26, 0],
    [-0.08, large ? 0.24 : 0.18, 0],
  );
  fin(
    surfaceEdge(0.04, -1),
    surfaceEdge(0.28, -1),
    surfaceEdge(0.54, -1),
    [0.35, large ? -0.305 : -0.225, 0],
    [0.24, large ? -0.26 : -0.2, 0],
    [0.4, -0.12, 0],
    0.94,
  );

  for (const sign of [-1, 1]) {
    const tailHeight = large ? 0.335 : 0.27;
    fin(
      [0.77, 0.008 * sign, 0],
      [0.88, 0.014 * sign, 0],
      [1.01, 0, 0],
      [1.2, tailHeight * sign, 0],
      [1.03, tailHeight * 0.64 * sign, 0],
      [1.15, tailHeight * 0.42 * sign, 0],
    );
  }

  function surface(x: number, y: number, side: number, lift = 0): Point {
    const [height, width, center] = section(x);
    const z = width * Math.sqrt(Math.max(0, 1 - ((y - center) / height) ** 2));
    return [x, y, (z + lift) * side];
  }

  function surfaceDisc(
    x: number,
    y: number,
    radius: number,
    side: number,
    lift: number,
    color: THREE.Color,
  ) {
    const center = vertex(surface(x, y, side, lift), color);
    const segments = 20;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      vertex(
        surface(
          x + Math.cos(angle) * radius,
          y + Math.sin(angle) * radius,
          side,
          lift,
        ),
        color,
      );
      if (i > 0) {
        if (side === 1) indices.push(center, center + i, center + i + 1);
        else indices.push(center, center + i + 1, center + i);
      }
    }
  }

  for (const side of [-1, 1]) {
    const [height, width] = section(-0.52);
    const spread = large ? 0.238 : 0.17;
    fin(
      [-0.55, -height * 0.16, width * 0.97 * side],
      [-0.45, -height * 0.3, width * side],
      [-0.32, -height * 0.4, width * 0.9 * side],
      [large ? 0.2 : 0.03, -height * 0.74, spread * side],
      [-0.13, -height * 0.28, spread * side],
      [-0.12, -height * 0.65, spread * side],
      0.92,
    );
    const eyeX = large ? -1.015 : -1.005,
      eyeY = large ? 0.048 : 0.04,
      eyeRadius = large ? 0.027 : 0.033;
    surfaceDisc(
      eyeX,
      eyeY,
      eyeRadius,
      side,
      0.003,
      new THREE.Color(large ? "#7c99a8" : "#c6d9df"),
    );
    surfaceDisc(
      eyeX - 0.003,
      eyeY,
      eyeRadius * 0.66,
      side,
      0.0045,
      new THREE.Color(large ? "#345369" : "#2d4c61"),
    );
    surfaceDisc(
      eyeX - 0.008,
      eyeY + 0.01,
      eyeRadius * 0.17,
      side,
      0.006,
      new THREE.Color(large ? "#9bb2bd" : "#e1ebec"),
    );
    if (!large) {
      // Like the main iwashi, each side has nine spots seated on its upper flank.
      const spotColor = new THREE.Color("#324653");
      for (let i = 0; i < 9; i++) {
        const x = -0.5 + i * 0.12;
        const [height, , center] = section(x);
        surfaceDisc(
          x,
          center + height * 0.37,
          0.02 - i * 0.0005,
          side,
          0.002,
          spotColor,
        );
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const time = { value: 0 };
  const contrast = { value: 0 };
  const tint = { value: new THREE.Color() };
  const shallowTint = new THREE.Color(large ? "#50788e" : "#80adbf");
  const deepTint = new THREE.Color(large ? "#2d5872" : "#426f89");
  const amplitude = large ? 0.07 : 0.1;
  // Include the animated tail in culling bounds; the geometry positions stay immutable.
  geometry.boundingSphere!.radius += amplitude;
  const material = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1,
    depthTest: true,
    depthWrite: true,
    fog: true,
    toneMapped: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBackgroundFishTime = time;
    shader.uniforms.uBackgroundFishContrast = contrast;
    shader.uniforms.uBackgroundFishTint = tint;
    shader.vertexShader = `uniform float uBackgroundFishTime;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float backgroundFishEnvelope = smoothstep(-0.38, 1.2, position.x);
      float backgroundFishPhase = dot(modelMatrix[3].xyz, vec3(0.41, 0.73, 0.29));
      transformed.z += sin(uBackgroundFishTime * ${large ? "4.3" : "7.2"} + backgroundFishPhase - position.x * 2.5)
        * backgroundFishEnvelope * backgroundFishEnvelope * ${amplitude.toFixed(2)};`,
    );
    shader.fragmentShader = `uniform float uBackgroundFishContrast;\nuniform vec3 uBackgroundFishTint;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      diffuseColor.rgb = mix(diffuseColor.rgb, uBackgroundFishTint, uBackgroundFishContrast);`,
    );
  };
  material.customProgramCacheKey = () => `background-fish-${kind}-v1`;

  function update(elapsed: number, depth: number) {
    if (Number.isFinite(elapsed)) time.value = elapsed;
    if (!Number.isFinite(depth)) return;
    const normalizedDepth = THREE.MathUtils.clamp(depth, 0, 1);
    tint.value.copy(shallowTint).lerp(deepTint, normalizedDepth);
    contrast.value = large
      ? 0.34 + normalizedDepth * 0.4
      : 0.04 + normalizedDepth * 0.42;
  }
  update(0, 0);
  let disposed = false;

  return {
    geometry,
    material,
    update,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      material.dispose();
    },
  };
}
