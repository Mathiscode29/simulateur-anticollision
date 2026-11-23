import { defineConfig } from 'vitest/config';

// base relative : le site fonctionne sous https://<pseudo>.github.io/simulateur-anticollision/
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 700 }, // three.js (vue 3D facultative) dans un fichier à part
  test: { environment: 'node' },
});
