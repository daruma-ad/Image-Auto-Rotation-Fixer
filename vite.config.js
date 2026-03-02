import { defineConfig } from 'vite';

export default defineConfig({
  // Base path is required for GitHub Pages (repo name)
  base: '/Image-Auto-Rotation-Fixer/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
});
