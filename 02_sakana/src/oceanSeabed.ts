import * as THREE from "three";

type SandDepression = {
  x: number;
  z: number;
  rx: number;
  rz: number;
  depth: number;
  angle: number;
};

// Offset pairs suggest inhabited sand without turning the whole bed into dimples.
export const seabedBurrows: readonly SandDepression[] = [
  { x: -0.4, z: 2.4, rx: 0.4, rz: 0.62, depth: 0.35, angle: 0.8 },
  { x: 0.4, z: -1.8, rx: 0.48, rz: 0.65, depth: 0.4, angle: -0.42 },
  { x: -0.9, z: -5.9, rx: 0.43, rz: 0.63, depth: 0.32, angle: -0.6 },
  { x: -0.28, z: -6.4, rx: 0.26, rz: 0.4, depth: 0.21, angle: 0.2 },
  { x: 2.1, z: -9.6, rx: 0.38, rz: 0.59, depth: 0.34, angle: 0.7 },
  { x: -3.4, z: -13.2, rx: 0.3, rz: 0.43, depth: 0.28, angle: -0.3 },
  { x: 2.65, z: -10.05, rx: 0.21, rz: 0.33, depth: 0.17, angle: 0.5 },
];

const bowls: readonly SandDepression[] = [
  { x: -2.1, z: -8.2, rx: 2.8, rz: 3.2, depth: 0.23, angle: 0.35 },
  { x: 2.7, z: -13, rx: 3.6, rz: 2.4, depth: 0.21, angle: -0.55 },
  { x: -5.5, z: -17, rx: 3.8, rz: 4.7, depth: 0.15, angle: 0.45 },
  { x: 0.2, z: -2, rx: 2, rz: 3.6, depth: 0.16, angle: -0.25 },
  { x: 7, z: -24, rx: 4, rz: 6, depth: 0.18, angle: 0.2 },
];

function depressionRadius(x: number, z: number, feature: SandDepression) {
  const dx = x - feature.x;
  const dz = z - feature.z;
  const c = Math.cos(feature.angle);
  const s = Math.sin(feature.angle);
  const u = (dx * c + dz * s) / feature.rx;
  const v = (-dx * s + dz * c) / feature.rz;
  // One lip slopes farther into the current; there is no raised circular rim.
  const skew = 1 + 0.16 * Math.tanh(v * 1.6);
  return u * u * skew + v * v;
}

function channelAt(x: number, z: number) {
  const center =
    0.9 * Math.sin(z * 0.145 + 0.6) + 0.55 * Math.sin(z * 0.052 - 1.4);
  const width = 2 + 0.4 * Math.sin(z * 0.13 + 1.1);
  return {
    offset: x - center,
    weight: Math.exp(-(((x - center) / width) ** 2)),
  };
}

/** Smooth, deterministic seabed height in world coordinates, including burrows. */
export function sampleSeabedHeight(x: number, z: number): number {
  const channel = channelAt(x, z);
  const dunePhase =
    z * 0.34 + 0.55 * Math.sin(x * 0.25) + 0.6 * Math.sin(z * 0.085 + x * 0.18);
  let height = -3.23;
  height += 0.13 * Math.sin(dunePhase);
  height += 0.085 * Math.sin(x * 0.47 - z * 0.18 + 0.3 * Math.sin(z * 0.2));
  height +=
    0.03 * Math.sin(x * 0.95 + z * 0.36) * Math.sin(z * 0.47 - x * 0.08);
  height += 0.04 * Math.sin(x * 0.11 - z * 0.072);
  height -= channel.weight * (0.17 + 0.06 * Math.sin(z * 0.18 + 0.5));
  height +=
    0.28 *
    Math.exp(-(((channel.offset - 4.4) / 3.7) ** 2)) *
    (0.82 + 0.18 * Math.sin(z * 0.16 + 0.4));
  height +=
    0.24 *
    Math.exp(-(((channel.offset + 4.8) / 3.4) ** 2)) *
    (0.8 + 0.2 * Math.sin(z * 0.21 - 1.2));
  for (const bowl of bowls) {
    height -= bowl.depth * Math.exp(-depressionRadius(x, z, bowl) * 1.25);
  }
  for (const burrow of seabedBurrows) {
    const radius = depressionRadius(x, z, burrow);
    height -= burrow.depth * Math.exp(-radius * radius * 1.6);
  }
  // A soft bound preserves slopes while keeping every sand surface below the fish.
  return -3.35 + 0.7 * Math.tanh((height + 3.35) / 0.7);
}

function sampleCavityShade(x: number, z: number) {
  let shade = channelAt(x, z).weight * 0.085;
  for (const bowl of bowls) {
    shade += 0.105 * Math.exp(-depressionRadius(x, z, bowl) * 1.7);
  }
  for (const burrow of seabedBurrows) {
    const radius = depressionRadius(x, z, burrow);
    shade += 0.7 * Math.exp(-radius * radius * 2.6);
  }
  return Math.min(0.87, shade);
}

function sampleAxis(
  min: number,
  focusMin: number,
  focusMax: number,
  max: number,
) {
  const centerSteps = Math.ceil((focusMax - focusMin) / 0.24);
  const axis = Array.from(
    { length: centerSteps + 1 },
    (_, i) => focusMin + ((focusMax - focusMin) * i) / centerSteps,
  );
  let step = 0.24;
  let coordinate = focusMin;
  const low: number[] = [];
  while (coordinate > min) {
    step = Math.min(step * 1.19, 3.2);
    coordinate = Math.max(min, coordinate - step);
    low.push(coordinate);
  }
  coordinate = focusMax;
  step = 0.24;
  while (coordinate < max) {
    step = Math.min(step * 1.19, 3.2);
    coordinate = Math.min(max, coordinate + step);
    axis.push(coordinate);
  }
  return low.reverse().concat(axis).map(Math.fround);
}

const terrainXs = sampleAxis(-50, -12, 12, 50);
const terrainZs = sampleAxis(-60, -20, 12, 50);

function findCell(axis: readonly number[], position: number) {
  let low = 0;
  let high = axis.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (axis[middle] <= position) low = middle;
    else high = middle;
  }
  return Math.min(low, axis.length - 2);
}

/** Exact rendered triangle height for seating gravel or other objects on the sand. */
export function sampleSeabedSurfaceHeight(x: number, z: number): number {
  const px = THREE.MathUtils.clamp(x, -50, 50);
  const pz = THREE.MathUtils.clamp(z, -60, 50);
  const ix = findCell(terrainXs, px);
  const iz = findCell(terrainZs, pz);
  const x0 = terrainXs[ix],
    x1 = terrainXs[ix + 1];
  const z0 = terrainZs[iz],
    z1 = terrainZs[iz + 1];
  const u = (px - x0) / (x1 - x0);
  const v = (pz - z0) / (z1 - z0);
  const a = Math.fround(sampleSeabedHeight(x0, z0));
  const b = Math.fround(sampleSeabedHeight(x1, z0));
  const c = Math.fround(sampleSeabedHeight(x0, z1));
  const d = Math.fround(sampleSeabedHeight(x1, z1));
  if ((ix + iz) % 2) {
    return v >= u
      ? a + (d - c) * u + (c - a) * v
      : a + (b - a) * u + (d - b) * v;
  }
  return u + v <= 1
    ? a + (b - a) * u + (c - a) * v
    : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

/** One watertight grid: dense around the fish, gradually coarser in distant fog. */
export function createOceanSeabed(uniforms: {
  time: { value: number };
  depth: { value: number };
  sand: { value: THREE.Color };
  water: { value: THREE.Color };
}): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const xs = terrainXs;
  const zs = terrainZs;
  const columns = xs.length;
  const count = columns * zs.length;
  const positions = new Float32Array(count * 3);
  const cavities = new Float32Array(count);
  const indices = new Uint16Array((columns - 1) * (zs.length - 1) * 6);
  for (let iz = 0; iz < zs.length; iz++) {
    for (let ix = 0; ix < columns; ix++) {
      const i = iz * columns + ix;
      const x = xs[ix];
      const z = zs[iz];
      positions[i * 3] = x;
      positions[i * 3 + 1] = sampleSeabedHeight(x, z);
      positions[i * 3 + 2] = z;
      cavities[i] = sampleCavityShade(x, z);
    }
  }
  let cursor = 0;
  for (let iz = 0; iz < zs.length - 1; iz++) {
    for (let ix = 0; ix < columns - 1; ix++) {
      const a = iz * columns + ix;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      // Alternating diagonals avoid a visible directional bias on rounded dunes.
      const triangles = (ix + iz) % 2 ? [a, c, d, a, d, b] : [a, c, b, b, c, d];
      for (const index of triangles) indices[cursor++] = index;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("cavity", new THREE.BufferAttribute(cavities, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = new THREE.ShaderMaterial({
    toneMapped: false,
    uniforms: {
      uTime: uniforms.time,
      uDepth: uniforms.depth,
      uSand: uniforms.sand,
      uWater: uniforms.water,
    },
    vertexShader: `
      attribute float cavity;
      varying vec3 vWorld, vNormal;
      varying float vDistance, vCavity;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vec4 viewed = viewMatrix * world;
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vCavity = cavity;
        vDistance = length(viewed.xyz);
        gl_Position = projectionMatrix * viewed;
      }
    `,
    fragmentShader: `
      varying vec3 vWorld, vNormal;
      varying float vDistance, vCavity;
      uniform vec3 uSand, uWater;
      uniform float uTime, uDepth;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
      }
      void main() {
        vec2 p = vWorld.xz;
        vec3 normal = normalize(vNormal);
        vec3 light = normalize(vec3(-0.46, 0.81, 0.36));
        float diffuse = max(0.0, dot(normal, light));
        float relief = 0.50 + 0.57 * diffuse;

        // Fixed sediment ripples, filtered out as their projected width shrinks.
        float phase = p.y * 17.0 + 2.1 * sin(p.x * 0.8 + p.y * 0.15)
                    + 0.5 * sin(p.y * 1.25 + p.x * 0.5);
        float rippleFilter = exp(-pow(fwidth(phase) * 0.72, 2.0));
        float ripple = (sin(phase) * 0.025 + sin(phase * 2.0 + 0.9) * 0.006)
                     * rippleFilter;
        float grainFootprint = max(length(dFdx(p)), length(dFdy(p))) * 88.0;
        float grain = (noise(p * 88.0) - 0.5) * 0.055
                    * (1.0 - smoothstep(0.25, 1.1, grainFootprint));
        float mottling = (noise(p * 0.76 + vec2(12.4, 8.7)) - 0.5) * 0.065;
        float sediment = 1.0 + ripple + grain + mottling;
        float occlusion = 1.0 - vCavity * 0.78;
        vec3 color = uSand * relief * sediment * occlusion;

        // Broad, moving refractions have soft edges instead of a bright wire grid.
        float t = uTime * 0.11;
        vec2 warped = p * 1.18;
        warped += vec2(sin(p.y * 0.73 + t), cos(p.x * 0.66 - t * 0.8)) * 0.78;
        float refractA = sin(warped.x + 1.2 * sin(warped.y * 0.84 + t));
        float refractB = cos(warped.y * 0.83 + sin(warped.x * 0.72 - t));
        float caustic = pow(0.5 + 0.5 * sin(refractA * 2.1 + refractB * 1.65), 3.0);
        float causticFilter = exp(-length(fwidth(warped)) * 0.6);
        color += uSand * caustic * causticFilter * 0.095
               * pow(1.0 - uDepth, 3.0) * occlusion;

        float fog = 1.0 - exp(-vDistance * vDistance * (0.00045 + uDepth * 0.0006));
        color = mix(color, uWater, fog);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "ocean-seabed";
  return mesh;
}
