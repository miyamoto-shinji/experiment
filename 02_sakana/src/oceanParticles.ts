import * as THREE from "three";

/** Soft suspended particles, with the same seeded layout on every initialization. */
export function createOceanParticles(scene: THREE.Scene, pixelRatio: number) {
  const particleCount = 230;
  const particlePositions = new Float32Array(particleCount * 3),
    sizes = new Float32Array(particleCount);
  let seed = 7281;
  function random() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  for (let i = 0; i < particleCount; i++) {
    particlePositions.set(
      [(random() - 0.5) * 23, (random() - 0.5) * 15, (random() - 0.5) * 15 - 4],
      i * 3,
    );
    sizes[i] = random() * 2.2 + 0.6;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(particlePositions, 3),
  );
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
    },
    vertexShader: `attribute float aSize; uniform float uTime; uniform float uPixelRatio; varying float vAlpha;
    void main(){vec3 p=position;p.y=mod(p.y+7.5+uTime*.045,15.0)-7.5;p.x+=sin(uTime*.12+p.y)*.14;vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aSize*uPixelRatio*9.0/-mv.z,1.0,5.0);vAlpha=.12+aSize*.08;}`,
    fragmentShader: `varying float vAlpha;void main(){float d=length(gl_PointCoord-.5);float alpha=smoothstep(.5,.05,d)*vAlpha;gl_FragColor=vec4(.65,.84,.81,alpha);}`,
  });
  const particles = new THREE.Points(geometry, material);
  scene.add(particles);
  let disposed = false;

  function update(elapsed: number) {
    if (!disposed) material.uniforms.uTime.value = elapsed;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    particles.removeFromParent();
    geometry.dispose();
    material.dispose();
  }

  return { update, dispose };
}
