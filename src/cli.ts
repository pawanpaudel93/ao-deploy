#!/usr/bin/env node

import chalk from "chalk";
import { Command, Option } from "commander";
import fs from "node:fs";
import path from "node:path";
import process, { emitWarning } from "node:process";
import { fileURLToPath } from "node:url";
import { ConfigManager } from "./lib/config";
import { aoExplorerUrl } from "./lib/constants";
import { deployContract, deployContracts } from "./lib/deploy/deploy.node";
import { BuildError, DeployError } from "./lib/error";
import { loadAndBundleContracts } from "./lib/loader";
import { Logger } from "./lib/logger";
import {
  hasValidBlueprints,
  isLuaFile,
  parseToInt,
  parseUrl
} from "./lib/utils/utils.common";
import { clearBuildOutDir } from "./lib/utils/utils.node";
import type { BundleResult, BundlingConfig, DeployResult, Tag } from "./types";

const PKG_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../");

process.emitWarning = (warning, ...args) => {
  if (args[0] === "ExperimentalWarning") {
    return;
  }

  if (
    args[0] &&
    typeof args[0] === "object" &&
    args[0].type === "ExperimentalWarning"
  ) {
    return;
  }

  // @ts-expect-error "experimental warning"
  return emitWarning(warning, ...args);
};

function getPackageJson() {
  const packageJsonPath = path.join(PKG_ROOT, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString());
  return packageJson;
}

function logDeploymentDetails(result: DeployResult) {
  const { messageId, processId, isNewProcess, configName, network } = result;
  const processUrl = chalk.green(`${aoExplorerUrl}/#/entity/${processId}`);
  const logger = Logger.init(configName);

  if (isNewProcess) {
    logger.log(`Deployed Process: ${processUrl}`);
  }
  if (messageId) {
    const messageUrl = chalk.green(`${aoExplorerUrl}/#/message/${messageId}`);
    if (network === "legacy") {
      logger.log(`Deployment Message: ${messageUrl}`);
    } else {
      logger.log(`Deployment Slot: ${messageId}`);
    }
  }
}

function logBundleDetails(result: BundleResult) {
  const { name, outDir, size, configName } = result;
  const generated = chalk.green(`${name}.lua has been generated at ${outDir}`);
  const bundleSize = chalk.green(`Bundle size is ${size} bytes`);
  const logger = Logger.init(configName);

  console.log("");

  logger.log(`Bundling: ${generated}`);
  logger.log(`Bundling: ${bundleSize}`);

  logger.log(`Bundling complete! ✨`);
}

const program = new Command();
const packageJson = getPackageJson();
program
  .name(packageJson.name)
  .description("Deploy AO contracts using a CLI.")
  .version(packageJson.version)
  .argument(
    "[contractOrConfigPath]",
    "Path to the main contract file or deployment configuration."
  )
  .option("-n, --name [name]", "Specify the process name.", "default")
  .option("-w, --wallet [wallet]", "Path to the wallet JWK file.")
  .option(
    "--use-browser-wallet",
    "Use browser wallet (Wander or other compatible wallet) for signing transactions."
  )
  .option("--browser [browser]", "Browser to use for signing transactions.")
  .option(
    "--browser-profile [browserProfile]",
    "Browser profile to use for signing transactions."
  )
  .option(
    "-l, --lua-path [luaPath]",
    "Specify the Lua modules path seperated by semicolon."
  )
  .option(
    "-d, --deploy [deploy]",
    "List of deployment configuration names, separated by commas."
  )
  .option(
    "-b, --build [build]",
    "List of build configuration names, separated by commas."
  )
  .option(
    "-s, --scheduler [scheduler]",
    "Scheduler to be used for the process."
  )
  .option("-m, --module [module]", "Module source for spawning the process.")
  .option(
    "-c, --cron [interval]",
    "Cron interval for the process (e.g. 1-minute, 5-minutes)."
  )
  .option(
    "--cron-action [cronAction]",
    "Cron tag action for the process.",
    "Cron"
  )
  .option("-t, --tags [tags...]", "Additional tags for spawning the process.")
  .option(
    "-p, --process-id [processId]",
    "Specify process Id of an existing process."
  )
  .option(
    "--build-only",
    "Bundle the contract into a single file and store it in the process-dist directory."
  )
  .option(
    "--out-dir [outDir]",
    "Used with --build-only to output the single bundle contract file to a specified directory."
  )
  .option(
    "--gateway-url [url]",
    "Custom Gateway URL to connect to.",
    parseUrl,
    "https://arweave.net"
  )
  .option(
    "--cu-url [url]",
    "Custom Compute Unit (CU) URL to connect to.",
    parseUrl,
    "https://cu.ao-testnet.xyz"
  )
  .option(
    "--mu-url [url]",
    "Custom Messenger Unit (MU) URL to connect to.",
    parseUrl,
    "https://mu.ao-testnet.xyz"
  )
  .option(
    "--hb-url [url]",
    "Hyperbeam Node URL to connect to.",
    parseUrl,
    "https://push.forward.computer"
  )
  .option(
    "--concurrency [limit]",
    "Concurrency limit for deploying multiple processes.",
    parseToInt,
    5
  )
  .option("--sqlite", "Use sqlite aos module when spawning new process")
  .option(
    "--retry-count [count]",
    "Number of retries for deploying contract.",
    parseToInt,
    3
  )
  .option(
    "--retry-delay [delay]",
    "Delay between retries in milliseconds.",
    parseToInt,
    1000
  )
  .option("--minify", "Reduce the size of the contract before deployment.")
  .option("--on-boot", "Load contract when process is spawned.")
  .option("--blueprints [blueprints...]", "Blueprints to use for the contract.")
  .option(
    "--force-spawn",
    "Force spawning a new process without checking for existing ones."
  )
  .addOption(
    new Option("--network [network]", "Network to use for deployment.")
      .choices(["mainnet", "legacy"])
      .default("mainnet")
  );

program.parse(process.argv);

const options = program.opts();
const contractOrConfigPath = program.args[0];
const hasBlueprints = hasValidBlueprints(options.blueprints);
const isContractPath = isLuaFile(contractOrConfigPath);
const isContractPathOrBlueprint = isContractPath || hasBlueprints;
const isBuildOnly = options.buildOnly;
const outDir = options.outDir || "./process-dist";

async function deploymentHandler() {
  try {
    Logger.log(packageJson.name, "Deploying...", false, true);
    if (isContractPathOrBlueprint) {
      const tags: Tag[] = Array.isArray(options.tags)
        ? options.tags.reduce<Tag[]>((accumulator, tag) => {
            if (tag && tag.includes(":")) {
              const [name, value] = tag.split(":");
              accumulator.push({ name, value });
            }
            return accumulator;
          }, [])
        : [];

      const wallet = options.useBrowserWallet ? "browser" : options.wallet;

      const result = await deployContract({
        name: options.name,
        wallet: wallet,
        contractPath: contractOrConfigPath,
        scheduler: options.scheduler,
        module: options.module,
        cron: options.cron,
        cronAction: options.cronAction,
        tags,
        retry: {
          count: parseToInt(options.retryCount, 3),
          delay: parseToInt(options.retryDelay, 1000)
        },
        luaPath: options.luaPath,
        configName: options.name,
        processId: options.processId,
        sqlite: options.sqlite,
        services: {
          gatewayUrl: options.gatewayUrl,
          cuUrl: options.cuUrl,
          muUrl: options.muUrl,
          hbUrl: options.hbUrl
        },
        minify: options.minify,
        onBoot: options.onBoot,
        blueprints: options.blueprints,
        forceSpawn: options.forceSpawn,
        browserConfig: {
          browser: options.browser,
          browserProfile: options.browserProfile
        },
        network: options.network
      });
      logDeploymentDetails(result);
    } else {
      const configManager = new ConfigManager(contractOrConfigPath);
      const deployConfigs = configManager.getDeployConfigs(options.deploy);
      const concurrency = parseToInt(options.concurrency, 5);

      const results = await deployContracts(deployConfigs, concurrency);
      results.forEach((result, idx) => {
        const configName = deployConfigs[idx].configName!;
        if (result.status === "fulfilled") {
          logDeploymentDetails(result.value);
        } else {
          Logger.error(configName, "Failed to deploy contract!", true);
          Logger.error(configName, result.reason);
        }
      });
      const totalCount = results.length;
      const successCount = results.filter(
        (r) => r.status === "fulfilled"
      ).length;
      Logger.log(
        packageJson.name,
        `Deployment Status: ${chalk.green(`${successCount}/${totalCount}`)} successful deployments.`,
        true
      );
    }
  } catch (error: any) {
    throw new DeployError(error?.message ?? "Failed to deploy contract!");
  }
}

async function buildHandler() {
  try {
    await clearBuildOutDir(outDir);
    Logger.log(packageJson.name, "Bundling...", false, true);

    const name = options.name || "bundle";

    if (isContractPathOrBlueprint) {
      const [result] = await loadAndBundleContracts(
        [
          {
            contractPath: contractOrConfigPath,
            name,
            outDir,
            luaPath: options.luaPath,
            minify: options.minify,
            blueprints: options.blueprints
          }
        ],
        1
      );

      if (result && result.status === "fulfilled") {
        logBundleDetails(result.value);
      } else {
        Logger.error(name, "Failed to bundle contract!", true);
        Logger.error(name, result.reason);
      }
    } else {
      const configManager = new ConfigManager(contractOrConfigPath);
      const deployConfigs = configManager.getDeployConfigs(options.build);
      const concurrency = parseToInt(options.concurrency, 5);

      const bundlingConfigs = deployConfigs.map((config) => ({
        name: config.name || "bundle",
        contractPath: config.contractPath,
        outDir: config.outDir || "./process-dist",
        luaPath: config.luaPath,
        minify: config.minify,
        contractTransformer: config.contractTransformer,
        blueprints: config.blueprints
      })) as BundlingConfig[];
      const results = await loadAndBundleContracts(
        bundlingConfigs,
        concurrency
      );

      results.forEach((result, idx) => {
        const configName = deployConfigs[idx].configName!;

        if (result.status === "fulfilled") {
          logBundleDetails(result.value);
        } else {
          Logger.error(configName, "Failed to bundle contract!", true);
          Logger.error(configName, result.reason);
        }
      });

      const totalCount = bundlingConfigs.length;
      const successCount = results.length;
      Logger.log(
        packageJson.name,
        `Build status: ${chalk.green(`${successCount}/${totalCount}`)} successful builds.`,
        true
      );
    }
  } catch (error: any) {
    throw new BuildError(error?.message ?? "Failed to bundle contract!");
  }
}

(async () => {
  if (!contractOrConfigPath && !hasBlueprints) {
    Logger.error(
      packageJson.name,
      "Either contract path, config path or blueprints must be provided!"
    );
    process.exit(1);
  }
  try {
    if (isBuildOnly) {
      await buildHandler();
    } else {
      await deploymentHandler();
    }

    // Explicitly exit after successful completion to ensure all handles are closed
    process.exit(0);
  } catch (error: any) {
    const logger = Logger.init(packageJson.name);

    if (error instanceof DeployError) {
      logger.error(`Deployment failed!`, true);
    }
    if (error instanceof BuildError) {
      logger.error(`Build failed!`, true);
    }

    logger.error(error?.message);
    process.exit(1);
  }
})();
