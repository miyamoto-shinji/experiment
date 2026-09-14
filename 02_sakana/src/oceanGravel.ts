import * as THREE from "three";
import { sampleSeabedSurfaceHeight, seabedBurrows } from "./oceanSeabed";

interface GravelUniforms {
  depth: { value: number };
  sand: { value: THREE.Color };
  water: { value: THREE.Color };
}

/** Patches of rounded gravel leave the sandy channel and burrow entrances open. */
export function createOceanGravel(uniforms: GravelUniforms): THREE.Group {
  const group = new THREE.Group();
  group.name = "ocean-gravel";
  let seed = 517083;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const light = new THREE.Vector3(-0.4, 0.85, 0.3).normalize();
  const geometries = [0, 1, 2].map((kind) => {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const positions = geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        y = positions.getY(i),
        z = positions.getZ(i);
      const variation = 1 + Math.sin(x * 6 + z * 4 + y * 3 + kind * 1.8) * 0.1;
      positions.setXYZ(
        i,
        x * variation,
        y * (0.94 + variation * 0.06),
        z * variation,
      );
    }
    geometry.computeVertexNormals();
    const normals = geometry.getAttribute("normal");
    const colors = [];
    const normal = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      normal.fromBufferAttribute(normals, i);
      const shade = 0.45 + Math.max(0, normal.dot(light)) * 0.55;
      colors.push(shade, shade, shade);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  });
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
    fog: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSand = uniforms.sand;
    shader.uniforms.uWater = uniforms.water;
    shader.uniforms.uDepth = uniforms.depth;
    shader.fragmentShader = `uniform vec3 uSand, uWater; uniform float uDepth;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
       diffuseColor.rgb = mix(uSand * diffuseColor.rgb, uWater * .42, uDepth * .14);`,
    );
  };
  material.customProgramCacheKey = () => "ocean-gravel-v1";

  const placements: {
    x: number;
    y: number;
    z: number;
    size: THREE.Vector3;
    rotation: THREE.Quaternion;
    tint: THREE.Color;
  }[][] = [[], [], []];
  const up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3();
  const yaw = new THREE.Quaternion();
  function addStone(x: number, z: number) {
    // Keep small entrances readable instead of filling them with decorative stones.
    if (
      seabedBurrows.some((hole) => {
        const dx = x - hole.x,
          dz = z - hole.z;
        const c = Math.cos(hole.angle),
          s = Math.sin(hole.angle);
        return (
          ((dx * c + dz * s) / hole.rx) ** 2 +
            ((-dx * s + dz * c) / hole.rz) ** 2 <
          2.8
        );
      })
    )
      return;
    const y = sampleSeabedSurfaceHeight(x, z);
    const dx =
      (sampleSeabedSurfaceHeight(x + 0.06, z) -
        sampleSeabedSurfaceHeight(x - 0.06, z)) /
      0.12;
    const dz =
      (sampleSeabedSurfaceHeight(x, z + 0.06) -
        sampleSeabedSurfaceHeight(x, z - 0.06)) /
      0.12;
    if (Math.hypot(dx, dz) > 0.4) return;
    normal.set(-dx, 1, -dz).normalize();
    const radius =
      random() < 0.08 ? 0.14 + random() * 0.08 : 0.025 + random() ** 1.6 * 0.09;
    const height = radius * (0.3 + random() * 0.3);
    const rotation = new THREE.Quaternion().setFromUnitVectors(up, normal);
    rotation.multiply(yaw.setFromAxisAngle(up, random() * Math.PI * 2));
    const tint = new THREE.Color().setRGB(
      0.7 + random() * 0.3,
      0.72 + random() * 0.25,
      0.7 + random() * 0.22,
    );
    placements[Math.floor(random() * placements.length)].push({
      x,
      y: y + height * 0.36,
      z,
      size: new THREE.Vector3(
        radius,
        height,
        radius * (0.58 + random() * 0.42),
      ),
      rotation,
      tint,
    });
  }
  // Clusters follow the edges of the channel, with a few loose grains between them.
  for (const [cx, cz, rx, rz, count] of [
    [-3, -3, 0.9, 0.65, 60],
    [2.4, -1.3, 0.85, 1.2, 48],
    [-1.8, 3.2, 1.2, 0.7, 72],
    [1.7, 5.2, 1, 0.75, 48],
    [3.8, -7, 1.6, 1.3, 45],
    [-4.5, -10, 1.6, 1, 45],
    [0.2, -14, 1.3, 1.8, 32],
    [8, -17, 2, 1.8, 36],
  ]) {
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2,
        radius = random() ** 0.65;
      addStone(
        cx + Math.cos(angle) * radius * rx,
        cz + Math.sin(angle) * radius * rz,
      );
    }
  }
  for (let i = 0; i < 90; i++)
    addStone((random() - 0.5) * 20, -22 + random() * 31);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const shadowPositions: number[] = [],
    shadowAlphas: number[] = [],
    shadowIndices: number[] = [];
  placements.forEach((stones, kind) => {
    const mesh = new THREE.InstancedMesh(
      geometries[kind],
      material,
      stones.length,
    );
    mesh.name = `ocean-gravel-${kind}`;
    stones.forEach((stone, index) => {
      position.set(stone.x, stone.y, stone.z);
      matrix.compose(position, stone.rotation, stone.size);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, stone.tint);

      // A soft contact shadow follows the actual triangulated surface under each stone.
      const offset = shadowPositions.length / 3;
      for (let ring = 0; ring <= 2; ring++) {
        for (let segment = 0; segment < 8; segment++) {
          const angle = (segment * Math.PI) / 4,
            radius = ring * 0.65;
          const local = new THREE.Vector3(
            Math.cos(angle) * stone.size.x * radius,
            0,
            Math.sin(angle) * stone.size.z * radius,
          ).applyQuaternion(stone.rotation);
          const x = stone.x + local.x,
            z = stone.z + local.z;
          shadowPositions.push(x, sampleSeabedSurfaceHeight(x, z) + 0.006, z);
          shadowAlphas.push(ring === 0 ? 0.17 : ring === 1 ? 0.11 : 0);
          if (ring < 2) {
            const a = offset + ring * 8 + segment,
              b = offset + ring * 8 + ((segment + 1) % 8);
            shadowIndices.push(a, a + 8, b, b, a + 8, b + 8);
          }
        }
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.add(mesh);
  });
  const shadowGeometry = new THREE.BufferGeometry();
  shadowGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(shadowPositions, 3),
  );
  shadowGeometry.setAttribute(
    "aOpacity",
    new THREE.Float32BufferAttribute(shadowAlphas, 1),
  );
  shadowGeometry.setIndex(shadowIndices);
  const shadowMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    uniforms: { uWater: uniforms.water, uDepth: uniforms.depth },
    vertexShader: `attribute float aOpacity; varying float vOpacity; void main(){
      vec4 mv=modelViewMatrix*vec4(position,1.);vOpacity=aOpacity*exp(-length(mv.xyz)*.012);
      gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform vec3 uWater; uniform float uDepth; varying float vOpacity;
      void main(){gl_FragColor=vec4(uWater*.23,vOpacity*(1.-uDepth*.28));
      #include <colorspace_fragment>
      }`,
    toneMapped: false,
  });
  const shadows = new THREE.Mesh(shadowGeometry, shadowMaterial);
  shadows.name = "ocean-gravel-contact";
  group.add(shadows);
  return group;
}
