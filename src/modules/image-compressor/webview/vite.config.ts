import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from "path";


const rootDir = resolve(__dirname);
const srcDir = resolve(rootDir, "src");
const pagesDir = resolve(srcDir, "pages");
const assetsDir = resolve(srcDir, "assets");
const outDir = resolve(rootDir, "dist");
const publicDir = resolve(rootDir, "public");

const isDev = process.env.__DEV__ === "true";
const isProduction = !isDev;

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@root": rootDir,
      "@src": srcDir,
      "@assets": assetsDir,
      "@pages": pagesDir,
    },
  },
  plugins: [react()],
  publicDir,
  build:{
    outDir,
    // sourcemap: isDev,
    minify: isProduction,
    reportCompressedSize: isProduction,
    rollupOptions: {
      input: {
        bundle: resolve(rootDir,"index.html"),
      },
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`,
      },
    },
  }
})
