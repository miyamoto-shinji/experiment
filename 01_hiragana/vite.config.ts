import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: {
    // Three.js is lazy-loaded separately; enforce a 600 kB budget for that chunk.
    chunkSizeWarningLimit: 600,
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'forest', test: /three/ }] } } },
  },
});
