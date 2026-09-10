import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const palettes = [
  {
    top: "#95eafb",
    water: "#319ed0",
    bottom: "#408eb1",
    sand: "#a2ced3",
    rock: "#6394a5",
    kelp: "#286f80",
  },
  {
    top: "#248fcc",
    water: "#165b91",
    bottom: "#092e52",
    sand: "#356d91",
    rock: "#386482",
    kelp: "#245367",
  },
  {
    top: "#143c65",
    water: "#0a2547",
    bottom: "#040f24",
    sand: "#1a3554",
    rock: "#27415e",
    kelp: "#1a3548",
  },
];

/** Procedural scenery whose foreground rocks participate in the fish depth test. */
export function createOceanEnvironment(scene: THREE.Scene) {
  const group = new THREE.Group();
  group.name = "ocean-environment";
  scene.add(group);
  const shelterPosition = new THREE.Vector3(7, -0.15, -5.8);
  const exitPosition = new THREE.Vector3(0.2, 0.25, 0);
  const shelterRoute = {
    approach: exitPosition.clone(),
    gate: new THREE.Vector3(0.2, 0.25, -5.8),
  };
  let seed = 90371;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let currentDepth = 0,
    targetDepth = 0;
  const time = { value: 0 },
    depth = { value: 0 };
  const top = { value: new THREE.Color(palettes[0].top) };
  const water = { value: new THREE.Color(palettes[0].water) };
  const bottom = { value: new THREE.Color(palettes[0].bottom) };
  const sand = { value: new THREE.Color(palettes[0].sand) };
  const fog =
    scene.fog instanceof THREE.FogExp2
      ? scene.fog
      : new THREE.FogExp2(water.value, 0.015);
  scene.fog = fog;
  const backgroundMaterial = new THREE.ShaderMaterial({
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    uniforms: {
      uTop: top,
      uWater: water,
      uBottom: bottom,
      uTime: time,
      uDepth: depth,
    },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,1.,1.);}`,
    fragmentShader: `varying vec2 vUv; uniform vec3 uTop,uWater,uBottom; uniform float uTime,uDepth;
    void main(){float y=vUv.y; vec3 c=mix(uBottom,uWater,smoothstep(0.,.6,y));
      c=mix(c,uTop,pow(smoothstep(.32,1.,y),1.65));
      float beam=pow(max(0.,sin((vUv.x+(1.-y)*.17)*39.+sin(uTime*.09))),12.);
      c+=vec3(.11,.24,.28)*beam*pow(y,1.3)*(1.-uDepth*.88)*.20;
      vec2 surface=vec2(vUv.x*27.,(1.-y)*88.);
      float wave=sin(surface.x+sin(surface.y+uTime*.22)*1.4)
        +sin(surface.y*1.13+sin(surface.x*.8-uTime*.18));
      float crest=pow(max(0.,1.-abs(wave)*1.6),8.);
      c+=vec3(.30,.38,.39)*crest*smoothstep(.85,1.,y)*(1.-uDepth*.86)*.48;
      gl_FragColor=vec4(c,1.);
      #include <colorspace_fragment>
    }`,
  });
  const background = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    backgroundMaterial,
  );
  background.frustumCulled = false;
  background.renderOrder = -100;
  group.add(background);

  // A triangulated sandy channel recedes into the canyon, with moving light on its surface.
  const floorGeometry = new THREE.PlaneGeometry(100, 110, 64, 70);
  floorGeometry.rotateX(-Math.PI / 2);
  floorGeometry.translate(0, -3.05, -5);
  const floorPositions = floorGeometry.getAttribute("position");
  const floorColors = [];
  for (let i = 0; i < floorPositions.count; i++) {
    const x = floorPositions.getX(i),
      z = floorPositions.getZ(i);
    floorPositions.setY(
      i,
      -3.05 + Math.sin(x * 0.57 + z * 0.29) * 0.09 + random() * 0.07,
    );
    const shade = 0.8 + random() * 0.2;
    floorColors.push(shade, shade, shade);
  }
  floorGeometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(floorColors, 3),
  );
  floorGeometry.computeVertexNormals();
  const floorMaterial = new THREE.ShaderMaterial({
    vertexColors: true,
    toneMapped: false,
    uniforms: { uTime: time, uDepth: depth, uSand: sand, uWater: water },
    vertexShader: `varying vec3 vWorld,vColor; varying float vDistance; void main(){
      vColor=color; vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;
      vec4 mv=viewMatrix*w;vDistance=length(mv.xyz);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 vWorld,vColor;varying float vDistance;uniform vec3 uSand,uWater;uniform float uTime,uDepth;
    void main(){vec2 p=vWorld.xz*1.6;float t=uTime*.16;
      float a=sin(p.x+sin(p.y*1.37+t)*.76+t);
      float b=sin(p.y*1.18+sin(p.x*.89-t)*.86-t*.71);
      float lines=pow(max(0.,1.-abs(a+b)*1.8),18.);
      float ripple=sin(p.y*4.+sin(p.x)*.4)*.025;
      vec3 c=uSand*vColor*(.91+ripple)+vec3(.3,.45,.43)*lines*pow(1.-uDepth,3.)*.5;
      c=mix(c,uWater,1.-exp(-vDistance*vDistance*(.00045+uDepth*.0006)));
      gl_FragColor=vec4(c,1.);
      #include <colorspace_fragment>
    }`,
  });
  group.add(new THREE.Mesh(floorGeometry, floorMaterial));

  // Keep the rock composition stable when the sand tessellation changes.
  seed = 4306137;
  const rockMaterial = new THREE.MeshBasicMaterial({
    color: palettes[0].rock,
    vertexColors: true,
    toneMapped: false,
  });
  const light = new THREE.Vector3(-0.35, 0.86, 0.38).normalize();
  function rock(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const positions = geometry.getAttribute("position");
    const phase = random() * 6;
    for (let i = 0; i < positions.count; i++) {
      const px = positions.getX(i),
        py = positions.getY(i),
        pz = positions.getZ(i);
      const distortion = 1 + Math.sin(px * 9 + py * 5 + pz * 7 + phase) * 0.11;
      positions.setXYZ(
        i,
        px * sx * distortion,
        py * sy * distortion,
        pz * sz * distortion,
      );
    }
    geometry.rotateY(random() * 2);
    geometry.translate(x, y, z);
    geometry.computeVertexNormals();
    const normals = geometry.getAttribute("normal"),
      colors = [];
    for (let i = 0; i < positions.count; i++) {
      const normal = new THREE.Vector3().fromBufferAttribute(normals, i);
      const shade =
        0.38 + Math.max(0, normal.dot(light)) * 0.56 + random() * 0.035;
      colors.push(shade, shade, shade);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }
  function rockCluster(geometries: THREE.BufferGeometry[], name: string) {
    const merged = mergeGeometries(geometries);
    geometries.forEach((geometry) => geometry.dispose());
    const mesh = new THREE.Mesh(merged, rockMaterial);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  }
  // Leave real open water behind the foreground bank, including space for fins and turns.
  const corridor = new THREE.Box3(
    new THREE.Vector3(-3.5, -2.1, -9),
    new THREE.Vector3(10.5, 3.5, -2.8),
  );
  const distant: THREE.BufferGeometry[] = [];
  function addDistant(geometry: THREE.BufferGeometry) {
    geometry.computeBoundingBox();
    if (geometry.boundingBox!.intersectsBox(corridor)) geometry.dispose();
    else distant.push(geometry);
  }
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? -1 : 1,
      z = -7 - random() * 25;
    addDistant(
      rock(
        side * (7 + random() * 14),
        -2.5 + random() * 0.8,
        z,
        1.5 + random() * 3.8,
        1.2 + random() * 3.4,
        1.5 + random() * 2.2,
      ),
    );
  }
  for (let i = 0; i < 32; i++) {
    const x = (random() - 0.5) * 22,
      z = -2 - random() * 28;
    addDistant(
      rock(
        x,
        -2.9,
        z,
        0.12 + random() * 0.48,
        0.12 + random() * 0.34,
        0.15 + random() * 0.5,
      ),
    );
  }
  rockCluster(distant, "ocean-canyon");
  const left = rockCluster(
    [
      rock(-5.5, -2.5, -0.3, 2.5, 1.3, 1.7),
      rock(-5.9, -1.35, -1.2, 1.8, 1.4, 1.7),
      rock(-4.15, -2.45, 0.6, 1.35, 0.7, 1.3),
      rock(-3.35, -2.75, 0.75, 0.67, 0.42, 0.62),
    ],
    "ocean-left-bank",
  );
  const right = rockCluster(
    [
      rock(5.7, -1.9, 0.9, 2.8, 1.8, 1.7),
      rock(5.4, -0.15, 0.45, 2.3, 1.6, 1.4),
      rock(6.9, 0.3, -0.4, 2.2, 2.5, 1.6),
      rock(4.4, -2.4, 1.8, 1.55, 0.95, 1.5),
      rock(3.65, -2.65, 2.1, 0.85, 0.5, 0.8),
    ],
    "ocean-right-shelter",
  );

  // Leaf ribbons and branching sea fans move independently of the solid scenery.
  const plantMaterial = new THREE.MeshBasicMaterial({
    color: palettes[0].kelp,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const plants: { group: THREE.Group; phase: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const plant = new THREE.Group();
    plant.position.set(
      i < 5 ? -4.2 - random() * 1.5 : 5.8 + random(),
      -2.9,
      -2.5 - random() * 4,
    );
    const height = 0.8 + random() * 2.5;
    const vertices: number[] = [],
      indices: number[] = [];
    for (let j = 0; j <= 18; j++) {
      const t = j / 18,
        center = Math.sin(t * 4) * 0.12,
        width = Math.sin(t * Math.PI) * 0.065;
      vertices.push(
        center - width,
        t * height,
        0,
        center + width,
        t * height,
        0,
      );
      if (j < 18) {
        const k = j * 2;
        indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    for (let j = 0; j < 8; j++) {
      const y = (0.18 + j * 0.09) * height,
        side = j % 2 ? 1 : -1;
      const start = vertices.length / 3,
        spread = 0.25 + random() * 0.16;
      vertices.push(
        0,
        y,
        0,
        spread * 0.55 * side,
        y + 0.09,
        0.04,
        spread * side,
        y + 0.43,
        0,
        spread * 0.26 * side,
        y + 0.32,
        -0.02,
      );
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    plant.add(new THREE.Mesh(geometry, plantMaterial));
    plant.rotation.y = random() * 0.7;
    group.add(plant);
    plants.push({ group: plant, phase: random() * 6 });
  }
  const coralMaterial = new THREE.MeshBasicMaterial({
    color: "#457181",
    toneMapped: false,
  });
  const coralPieces: THREE.BufferGeometry[] = [];
  function branch(
    start: THREE.Vector3,
    end: THREE.Vector3,
    radius: number,
    generations: number,
  ) {
    const direction = end.clone().sub(start);
    const geometry = new THREE.CylinderGeometry(
      radius * 0.65,
      radius,
      direction.length(),
      5,
    );
    geometry.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.clone().normalize(),
      ),
    );
    geometry.translate(...start.clone().add(end).multiplyScalar(0.5).toArray());
    coralPieces.push(geometry);
    if (!generations) return;
    for (const side of [-1, 1]) {
      const next = end
        .clone()
        .add(
          new THREE.Vector3(
            side * (0.18 + random() * 0.14),
            0.23 + random() * 0.25,
            (random() - 0.5) * 0.18,
          ),
        );
      branch(end, next, radius * 0.67, generations - 1);
    }
  }
  branch(
    new THREE.Vector3(3.8, -2.95, -4),
    new THREE.Vector3(3.8, -2.5, -4),
    0.043,
    3,
  );
  branch(
    new THREE.Vector3(-4.9, -2.95, -5),
    new THREE.Vector3(-4.9, -2.4, -5),
    0.05,
    3,
  );
  const coralGeometry = mergeGeometries(coralPieces);
  coralPieces.forEach((geometry) => geometry.dispose());
  group.add(new THREE.Mesh(coralGeometry, coralMaterial));

  const scratch = new THREE.Color();
  function paint(color: THREE.Color, key: keyof (typeof palettes)[number]) {
    const index = Math.min(1, Math.floor(currentDepth * 2));
    color
      .set(palettes[index][key])
      .lerp(scratch.set(palettes[index + 1][key]), currentDepth * 2 - index);
  }
  function update(timeSeconds: number, delta: number) {
    const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    currentDepth = THREE.MathUtils.damp(currentDepth, targetDepth, 3.5, dt);
    time.value = Number.isFinite(timeSeconds) ? timeSeconds : 0;
    depth.value = currentDepth;
    paint(top.value, "top");
    paint(water.value, "water");
    paint(bottom.value, "bottom");
    paint(sand.value, "sand");
    paint(rockMaterial.color, "rock");
    paint(plantMaterial.color, "kelp");
    coralMaterial.color
      .copy(rockMaterial.color)
      .multiplyScalar(0.7 + currentDepth * 0.15);
    fog.color.copy(water.value);
    fog.density = 0.015 + currentDepth * 0.008;
    for (const plant of plants) {
      plant.group.rotation.z = Math.sin(time.value * 0.5 + plant.phase) * 0.06;
      plant.group.scale.y = 1 - currentDepth * 0.65;
    }
  }
  function resize(mobile: boolean) {
    right.position.set(mobile ? -1.5 : 0, mobile ? 0.8 : 0, 0);
    left.position.x = mobile ? 1.2 : 0;
    shelterPosition.set(mobile ? 5.6 : 7, mobile ? 0.65 : -0.15, -5.8);
    exitPosition.set(mobile ? -0.5 : 0.2, mobile ? 1.1 : 0.25, 0);
    shelterRoute.approach.copy(exitPosition);
    shelterRoute.gate.copy(exitPosition).setZ(-5.8);
  }
  function setDepth(value: number) {
    targetDepth = THREE.MathUtils.clamp(
      ((Number.isFinite(value) ? value : 50) - 50) / 100,
      0,
      1,
    );
  }
  function dispose() {
    group.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      (Array.isArray(object.material)
        ? object.material
        : [object.material]
      ).forEach((material) => materials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }
  update(0, 0);
  return {
    group,
    setDepth,
    resize,
    update,
    shelterPosition,
    exitPosition,
    shelterRoute,
    dispose,
  };
}
