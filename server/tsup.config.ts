import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  // The shared package ships TypeScript source, so bundle it; everything else stays a runtime dependency.
  noExternal: ['@prioritize/shared'],
});
