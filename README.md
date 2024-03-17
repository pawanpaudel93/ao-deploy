# ao-deploy

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

A package to deploy AO contracts.

## Installation

### Using npm

```sh
npm install ao-deploy --save-dev
```

### Using pnpm

```sh
pnpm add ao-deploy --save-dev
```

### Using yarn

```sh
yarn add ao-deploy --dev
```

### Using bun

```sh
bun add ao-deploy --dev
```

## Usage

### CLI

```sh
Usage: ao-deploy [options] <contractPath>

A CLI tool to deploy AO contracts

Arguments:
  contractPath                    Contract main file path to deploy

Options:
  -V, --version                   output the version number
  -n, --name [name]               Name of contract to deploy (default: "default")
  -w, --wallet-path [walletPath]  Wallet JWK file path
  -h, --help                      display help for command
```

#### Example

```sh
ao-deploy process.lua -n tictactoe -w wallet.json
```

OR,

```sh
aod process.lua -n tictactoe -w wallet.json
```

> [!Note]
A wallet is generated and saved if not passed.

Run this command to get the generated wallet path:

```sh
node -e "const path = require('path'); const os = require('os'); console.log(path.resolve(os.homedir(), '.aos.json'));"
```

## Code

```ts
import { deployContract } from 'ao-deploy'

async function main() {
  try {
    const { messageId, processId } = await deployContract({ name: 'demo', walletPath: 'wallet.json', contractPath: 'process.lua' })
    const processUrl = `https://ao_marton.g8way.io/#/process/${processId}`
    console.log(`\nDeployed Process: ${processUrl} \nDeployment Message: ${processUrl}/${messageId}`)
  }
  catch (error: any) {
    console.log('\nDeploy failed!\n')
    console.log(error?.message ?? 'Failed to deploy contract!')
  }
}

main()
```

## License

[MIT](./LICENSE) License © 2024-PRESENT [Pawan Paudel](https://github.com/pawanpaudel93)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/ao-deploy?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmjs.com/package/ao-deploy
[npm-downloads-src]: https://img.shields.io/npm/dm/ao-deploy?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmjs.com/package/ao-deploy
[bundle-src]: https://img.shields.io/bundlephobia/minzip/ao-deploy?style=flat&colorA=080f12&colorB=1fa669&label=minzip
[bundle-href]: https://bundlephobia.com/result?p=ao-deploy
[license-src]: https://img.shields.io/github/license/pawanpaudel93/ao-deploy.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/pawanpaudel93/ao-deploy/blob/main/LICENSE
[jsdocs-src]: https://img.shields.io/badge/jsdocs-reference-080f12?style=flat&colorA=080f12&colorB=1fa669
[jsdocs-href]: https://www.jsdocs.io/package/ao-deploy
