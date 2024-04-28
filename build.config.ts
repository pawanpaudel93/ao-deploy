import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig([{
  entries: [
    'src/index',
  ],
  declaration: true,
  clean: true,
  rollup: {
    emitCJS: true,
    inlineDependencies: true,
  },
  failOnWarn: false,
}, {
  entries: [
    'src/cli',
  ],
  declaration: false,
  clean: true,
  rollup: {
    emitCJS: false,
    inlineDependencies: true,
  },
  failOnWarn: false,
}])
