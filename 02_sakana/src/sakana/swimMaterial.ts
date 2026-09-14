import type { MeshStandardMaterial } from "three";

interface FishSwimmingOptions {
  time: { value: number };
  frequency: number;
  amplitude: number;
  origin: number;
  span: number;
  wavelength: number;
  cacheKey: string;
}

function glslFloat(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

/** Keep each model's materials in step while clones vary with world position. */
export function applyFishSwimming<T extends MeshStandardMaterial>(
  material: T,
  {
    time,
    frequency,
    amplitude,
    origin,
    span,
    wavelength,
    cacheKey,
  }: FishSwimmingOptions,
): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFishTime = time;
    shader.vertexShader =
      `uniform float uFishTime;
      float bend(float x) { float s=max(0.0,(x+${glslFloat(origin)})/${glslFloat(span)}); return sin(uFishTime*${frequency.toFixed(3)}+dot(modelMatrix[3].xyz,vec3(0.41,0.73,0.29))-x*${glslFloat(wavelength)})*s*s*${amplitude.toFixed(3)}*3.0; }
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
  material.customProgramCacheKey = () => cacheKey;
  return material;
}
