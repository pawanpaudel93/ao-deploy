import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig([{
  entries: [
    'src/index',
  ],
  declaration: true,
  clean: true,
  rollup: {
    emitCJS: true,
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
  },
  failOnWarn: false,
}])
