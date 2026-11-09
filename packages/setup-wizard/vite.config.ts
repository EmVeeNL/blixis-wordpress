import { defineConfig } from "vite";

// One classic script (no modules, no network): WordPress hosts need no Node, so the build is
// committed to Blixis Blocks. The page passes the token map as JSON; see src/main.ts.
export default defineConfig({
  build: {
    outDir: "../../plugins/blixis-blocks/assets",
    emptyOutDir: false,
    target: "es2022",
    cssCodeSplit: false,
    sourcemap: false,
    lib: {
      entry: "src/main.ts",
      name: "BlixisSetup",
      formats: ["iife"],
      fileName: () => "setup.js",
    },
  },
});
