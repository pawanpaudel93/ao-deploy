# ao-deploy

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

A package for deploying AO contracts.

## Features

- Build only or deploy AO contracts with ease.
- Custom LUA_PATH support.
- Support LuaRocks packages.
- Support for deployment configuration.
- Flexible concurrency and retry options for reliable deployments.
- CLI and API interfaces for versatile usage.
- Minify or modify the contract before deployment.

## Installation

### Basic Installation

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

### Optional Dependencies

If you plan to use the `--minify` option, you'll need to install `lua-format`:

```sh
npm install lua-format --save-dev   # npm
pnpm add lua-format --save-dev      # pnpm
yarn add lua-format --dev           # yarn
bun add lua-format --dev           # bun
```

## Usage

### CLI

```sh
Usage: ao-deploy [options] <contractOrConfigPath>

Deploy AO contracts using a CLI.

Arguments:
  contractOrConfigPath          Path to the main contract file or deployment configuration.

Options:
  -V, --version                 output the version number
  -n, --name [name]             Specify the process name. (default: "default")
  -w, --wallet [wallet]         Path to the wallet JWK file.
  -l, --lua-path [luaPath]      Specify the Lua modules path seperated by semicolon.
  -d, --deploy [deploy]         List of deployment configuration names, separated by commas.
  -b, --build [build]           List of deployment configuration names, separated by commas.
  -s, --scheduler [scheduler]   Scheduler to be used for the process. (default: "_GQ33BkPtZrqxA84vM8Zk-N2aO0toNNu_C-l-rawrBA")
  -m, --module [module]         Module source for spawning the process.
  -c, --cron [interval]         Cron interval for the process (e.g. 1-minute, 5-minutes).
  -t, --tags [tags...]          Additional tags for spawning the process.
  -p, --process-id [processId]  Specify process Id of existing process.
  --build-only                  Bundle the contract into a single file and store it in the process-dist directory.
  --out-dir [outDir]            Used with --build-only to output the single bundle contract file to a specified directory.
  --gateway-url [url]           Custom Gateway URL to connect to. (default: "https://arweave.net")
  --cu-url [url]                Custom Compute Unit (CU) URL to connect to. (default: "https://cu.ao-testnet.xyz")
  --mu-url [url]                Custom Messenger Unit (MU) URL to connect to. (default: "https://mu.ao-testnet.xyz")
  --concurrency [limit]         Concurrency limit for deploying multiple processes. (default: 5)
  --sqlite                      Use sqlite aos module when spawning new process.
  --retry-count [count]         Number of retries for deploying contract. (default: 10)
  --retry-delay [delay]         Delay between retries in milliseconds. (default: 3000)
  --minify                      Reduce the size of the contract before deployment. (default: false)
  -h, --help                    display help for command
```

#### Example: Deploy contract

```sh
ao-deploy process.lua -n tictactoe -w wallet.json --tags name1:value1 name2:value2
```

### Example: Deploy contract with minify

> [!Note]
> Make sure to install `lua-format` as mentioned in [Optional Dependencies](#optional-dependencies) section.

```sh
ao-deploy process.lua -n tictactoe -w wallet.json --tags name1:value1 name2:value2 --minify
```

#### Example: Deploy contracts with configuration

Here is an example using a deployment configuration:

```ts
// aod.config.ts
import { defineConfig } from "ao-deploy";

const wallet = "wallet.json";
const luaPath = "./?.lua;./src/?.lua";

const config = defineConfig({
  contract_1: {
    luaPath,
    name: `contract-1`,
    contractPath: "contract-1.lua",
    wallet,
    minify: true // Minify the contract before deployment
  },
  contract_2: {
    luaPath,
    name: `contract-2`,
    contractPath: "contract-2.lua",
    wallet,
    // Custom source transformer function
    sourceTransformer: (source) => {
      return source.replace(/print\(/g, "print(");
    }
  },
  contract_3: {
    luaPath,
    name: `contract-3`,
    contractPath: "contract-3.lua",
    wallet
  }
});

export default config;
```

Deploy all specified contracts:

```sh
ao-deploy aod.config.ts
```

Deploy specific contracts:

```sh
ao-deploy aod.config.ts --deploy=contract_1,contract_3
```

#### Example: Build Contract

To Build contracts and produce single bundle lua file, take a look at below provided commands

Build contract and save to default(`process-dist`) directory:

```sh
aod src/process.lua -n my-process --build-only
```

Build contract and save to specific directory:

```sh
aod src/process.lua -n my-process --build-only --out-dir <PATH>
aod src/process.lua -n my-process --build-only --out-dir ./dist
```

#### Example: Build Contracts using Configuration

To Build contracts using config, take a look at below provided example

Here is an example using a deployment configuration:

```ts
// aod.config.ts
import { defineConfig } from "ao-deploy";

const luaPath = "./?.lua;./src/?.lua";

const config = defineConfig({
  contract_1: {
    luaPath,
    name: `contract-1`,
    contractPath: "contract-1.lua",
    outDir: "./dist"
  },
  contract_2: {
    luaPath,
    name: `contract-2`,
    contractPath: "contract-2.lua",
    outDir: "./dist"
  },
  contract_3: {
    luaPath,
    name: `contract-3`,
    contractPath: "contract-3.lua",
    outDir: "./dist"
  }
});

export default config;
```

Build all specified contracts:

```sh
ao-deploy aod.config.ts --build-only
```

Build specific contracts:

```sh
ao-deploy aod.config.ts --build=contract_1,contract_3 --build-only
```

> [!Note]
> A wallet is generated and saved if not passed.

Retrieve the generated wallet path:

```sh
node -e "const path = require('path'); const os = require('os'); console.log(path.resolve(os.homedir(), '.aos.json'));"
```

### API Usage

To deploy a contract, you need to import and call the `deployContract` function from your script. Here is a basic example:

#### Example: deployContract

```ts
import { deployContract } from "ao-deploy";

async function main() {
  try {
    const { messageId, processId } = await deployContract({
      name: "demo",
      wallet: "wallet.json",
      contractPath: "process.lua",
      tags: [{ name: "Custom", value: "Tag" }],
      retry: {
        count: 10,
        delay: 3000
      }
    });
    const processUrl = `https://www.ao.link/#/entity/${processId}`;
    const messageUrl = `https://www.ao.link/#/message/${messageId}`;
    console.log(
      `\nDeployed Process: ${processUrl} \nDeployment Message: ${messageUrl}`
    );
  } catch (error: any) {
    console.log(
      `Deployment failed!: ${error?.message ?? "Failed to deploy contract!"}\n`
    );
  }
}

main();
```

##### Parameters

The `deployContract` function accepts the following parameters within the DeployArgs object:

- `name` (optional): The process name to spawn. Defaults to "default".
- `contractPath`: The path to the contract's main file.
- `module` (optional): The module source to use. Defaults to fetching from the AOS's GitHub repository.
- `scheduler` (optional): The scheduler to use for the process. Defaults to `_GQ33BkPtZrqxA84vM8Zk-N2aO0toNNu_C-l-rawrBA`.
- `tags` (optional): Additional tags to use for spawning the process.
- `cron` (optional): The cron interval for the process, e.g., "1-minute", "5-minutes". Use format `interval-(second, seconds, minute, minutes, hour, hours, day, days, month, months, year, years, block, blocks, Second, Seconds, Minute, Minutes, Hour, Hours, Day, Days, Month, Months, Year, Years, Block, Blocks)`
- `wallet` (optional): The wallet path or JWK itself (Autogenerated if not passed).
- `retry` (optional): Retry options with `count` and `delay` properties. By default, it will retry up to `10` times with a `3000` milliseconds delay between attempts.
- `luaPath` (optional): The path to the Lua modules seperated by semicolon.
- `processId` (optional): The process id of existing process.
- `minify` (optional): Reduce the size of the contract before deployment.
- `sourceTransformer` (optional): Custom function to transform source code before deployment.

#### Example: deployContracts

To deploy contracts, you need to import and call the `deployContracts` function from your script. Here is a basic example:

```ts
import { deployContracts } from "ao-deploy";

async function main() {
  try {
    const results = await deployContracts(
      [
        {
          name: "demo1",
          wallet: "wallet.json",
          contractPath: "process1.lua",
          tags: [{ name: "Custom", value: "Tag" }],
          retry: {
            count: 10,
            delay: 3000
          }
        },
        {
          name: "demo2",
          wallet: "wallet.json",
          contractPath: "process2.lua",
          tags: [{ name: "Custom", value: "Tag" }],
          retry: {
            count: 10,
            delay: 3000
          }
        }
      ],
      2
    );
    results.forEach((result, idx) => {
      if (result.status === "fulfilled") {
        const { processId, messageId } = result.value;
        const processUrl = `https://www.ao.link/#/entity/${processId}`;
        const messageUrl = `https://www.ao.link/#/message/${messageId}`;
        console.log(
          `\nDeployed Process: ${processUrl} \nDeployment Message: ${messageUrl}`
        );
      } else {
        console.log(`Failed to deploy contract!: ${result.reason}\n`);
      }
    });
  } catch (error: any) {
    console.log(
      `Deployment failed!: ${error?.message ?? "Failed to deploy contract!"}\n`
    );
  }
}

main();
```

## Author

👤 **Pawan Paudel**

- Github: [@pawanpaudel93](https://github.com/pawanpaudel93)

## 🤝 Contributing

Contributions, issues and feature requests are welcome! \ Feel free to check [issues page](https://github.com/pawanpaudel93/ao-deploy/issues).

## Show your support

Give a ⭐️ if this project helped you!

Copyright © 2024 [Pawan Paudel](https://github.com/pawanpaudel93).

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/ao-deploy?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmjs.com/package/ao-deploy
[npm-downloads-src]: https://img.shields.io/npm/dm/ao-deploy?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmjs.com/package/ao-deploy
[license-src]: https://img.shields.io/github/license/pawanpaudel93/ao-deploy.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/pawanpaudel93/ao-deploy/blob/main/LICENSE
[jsdocs-src]: https://img.shields.io/badge/jsdocs-reference-080f12?style=flat&colorA=080f12&colorB=1fa669
[jsdocs-href]: https://www.jsdocs.io/package/ao-deploy
