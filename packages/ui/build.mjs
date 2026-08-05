// Builds the library to dist/ as ESM, with React left external so the app and the
// design-system bundle share one React instance. Type declarations are emitted
// separately by `tsc -p tsconfig.build.json` (see the "build" script).
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  sourcemap: true,
  // Two React copies would break hooks; the consumer always supplies it.
  external: ["react", "react-dom", "react/jsx-runtime"],
});
