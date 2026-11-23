import { defineConfig } from 'vitest/config';

// base relative : le site fonctionne sous https://<pseudo>.github.io/simulateur-anticollision/
export default defineConfig({
  base: './',
  build: { target: 'es2020' },
  test: { environment: 'node' },
});
