/** Shared art direction for future species. See docs/ART_DIRECTION.md. */
export const fishVisualStyle = {
  palette: {
    back: "#425d70",
    flank: "#91acb9",
    belly: "#edf0ef",
    fin: "#b8a64a",
    stripe: "#d3cf99",
  },
  proportions: { eyeScale: 0.85 },
  surface: {
    metalness: 0.38,
    roughness: 0.24,
    clearcoat: 0.85,
    clearcoatRoughness: 0.18,
    envMapIntensity: 0.9,
  },
  fin: { metalness: 0.18, roughness: 0.42, clearcoat: 0.3 },
  details: {
    outline: "#324653",
    finRay: "#b0a15a",
    eyeRim: "#33464f",
    iris: "#eee7bd",
    pupil: "#07151e",
    highlight: "#ffffff",
  },
} as const;
