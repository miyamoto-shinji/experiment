import * as THREE from "three";

export type Point = [number, number, number];
export interface JawRootPoint {
  position: Point;
  normal: Point;
  uv: [number, number];
}
export const hinge: [number, number] = [-1.5, -0.22];
export const mouthTip: Point = [-2.09, 0.015, 0];
export const snout = -2.06;
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

export function section(x: number) {
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

export function surface(
  x: number,
  y: number,
  side: number,
  lift = 0.008,
): Point {
  const [h, w, cy] = section(x);
  return [
    x,
    y,
    (w * Math.sqrt(Math.max(0, 1 - ((y - cy) / h) ** 2)) + lift) * side,
  ];
}

export function lipHeight(x: number) {
  const t = THREE.MathUtils.clamp((x - snout) / (hinge[0] - snout), 0, 1);
  return mouthTip[1] + (hinge[1] - mouthTip[1]) * t ** 1.35;
}

export function headAndBody() {
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
  positions.push(...mouthTip);
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
  const jawRoot: JawRootPoint[] = Array.from({ length: 25 }, (_, j) => {
    const i = headRings * (sides + 1) + 12 + j;
    return {
      position: positions.slice(i * 3, i * 3 + 3) as Point,
      normal: Array.from(
        body.getAttribute("normal").array.slice(i * 3, i * 3 + 3),
      ) as Point,
      uv: uv.slice(i * 2, i * 2 + 2) as [number, number],
    };
  });
  return { body, jaw, jawRoot };
}
