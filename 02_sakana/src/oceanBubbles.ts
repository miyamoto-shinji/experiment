import * as THREE from "three";
import { seabedBurrows, sampleSeabedSurfaceHeight } from "./oceanSeabed";

/** Small, intermittent gas trails rise from the actual depressions in the sand. */
export function createOceanBubbles() {
  const group = new THREE.Group();
  group.name = "ocean-bubbles";
  const vents = [seabedBurrows[1], seabedBurrows[2], seabedBurrows[4]];
  let seed = 19543;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const bubbles = vents.flatMap((vent, index) =>
    Array.from({ length: 12 }, (_, bubble) => ({
      x: vent.x + (random() - 0.5) * 0.065,
      y: sampleSeabedSurfaceHeight(vent.x, vent.z) + 0.035,
      z: vent.z + (random() - 0.5) * 0.065,
      delay: bubble * 0.19 + random() * 0.17,
      period: 11.8 + index * 1.7,
      offset: 2.5 + index * 2.1,
      life: 5.5 + random() * 1.8,
      radius: 0.025 + random() * 0.034,
      speed: 0.32 + random() * 0.14,
      phase: random() * Math.PI * 2,
    })),
  );
  const opacity = new THREE.InstancedBufferAttribute(
    new Float32Array(bubbles.length),
    1,
  );
  opacity.setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.SphereGeometry(1, 12, 8);
  geometry.setAttribute("aOpacity", opacity);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uTint: { value: new THREE.Color("#c6eef3") },
      uDepth: { value: 0 },
    },
    vertexShader: `
      attribute float aOpacity;
      varying vec3 vNormal, vView;
      varying float vOpacity;
      void main() {
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vView = -mv.xyz;
        vOpacity = aOpacity;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uTint;
      uniform float uDepth;
      varying vec3 vNormal, vView;
      varying float vOpacity;
      void main() {
        vec3 normal = normalize(vNormal);
        float rim = pow(1.0 - abs(dot(normal, normalize(vView))), 2.2);
        float highlight = pow(max(0.0, dot(normal, normalize(vec3(-.4,.6,.7)))), 38.0);
        float distanceFade = exp(-dot(vView, vView) * (0.0006 + uDepth * 0.0006));
        float alpha = vOpacity * (0.025 + rim * 0.46 + highlight * 0.34) * distanceFade;
        gl_FragColor = vec4(uTint, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, bubbles.length);
  mesh.name = "ocean-bubble-trails";
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  group.add(mesh);
  const transform = new THREE.Object3D();
  const shallow = new THREE.Color("#c6eef3");
  const deep = new THREE.Color("#729ab9");

  function update(timeSeconds: number, depth: number) {
    const time = Number.isFinite(timeSeconds) ? Math.max(0, timeSeconds) : 0;
    const amount = THREE.MathUtils.clamp(
      Number.isFinite(depth) ? depth : 0, 0, 1,
    );
    material.uniforms.uTint.value.copy(shallow).lerp(deep, amount);
    material.uniforms.uDepth.value = amount;
    bubbles.forEach((bubble, index) => {
      const age =
        (time + bubble.offset - bubble.delay + bubble.period) % bubble.period;
      const progress = age / bubble.life;
      const active = progress < 1;
      const growth = 1 + Math.min(progress, 1) * 0.2;
      transform.position.set(
        bubble.x +
          Math.sin(age * 1.45 + bubble.phase) * Math.min(age * 0.035, 0.16),
        bubble.y + age * bubble.speed + age * age * 0.014,
        bubble.z + Math.sin(age * 0.9 + bubble.phase) * Math.min(age * 0.02, 0.1),
      );
      transform.scale.setScalar(active ? bubble.radius * growth : 0.00001);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
      opacity.setX(
        index,
        active
          ? THREE.MathUtils.smoothstep(progress, 0, 0.08) *
            (1 - THREE.MathUtils.smoothstep(progress, 0.72, 1))
          : 0,
      );
    });
    mesh.instanceMatrix.needsUpdate = true;
    opacity.needsUpdate = true;
  }
  update(0, 0);
  return { group, update };
}
