// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    ignores: [
      // eslint ignore globs here
    ],
  },
  {
    rules: {
      // overrides
      'no-console': 'off',
      'brace-style': ['error', 'stroustrup', { allowSingleLine: true }],
      'indent': ['error', 2],
      'curly': ['error', 'all'],
    },
  },
)
