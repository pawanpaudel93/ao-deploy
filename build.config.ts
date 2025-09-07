import { defineBuildConfig } from "unbuild";

export default defineBuildConfig([
  {
    name: "node",
    entries: ["src/index"],
    declaration: true,
    clean: true,
    rollup: {
      emitCJS: true,
      inlineDependencies: true
    },
    failOnWarn: false
  },
  {
    name: "web",
    entries: ["src/index.web"],
    declaration: true,
    clean: true,
    // outDir: "dist/web",
    rollup: {
      emitCJS: false,
      inlineDependencies: true
    },
    failOnWarn: false
  },
  {
    name: "cli",
    entries: ["src/cli"],
    declaration: false,
    clean: true,
    rollup: {
      emitCJS: false,
      inlineDependencies: true
    },
    failOnWarn: false
  }
]);
