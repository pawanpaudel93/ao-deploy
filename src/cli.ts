#!/usr/bin/env node

import chalk from "chalk";
import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import process, { emitWarning } from "node:process";
import { fileURLToPath } from "node:url";
import { ConfigManager } from "./lib/config";
import { aoExplorerUrl } from "./lib/constants";
import { deployContract, deployContracts } from "./lib/deploy";
import { BuildError, DeployError } from "./lib/error";
import { loadAndBundleContracts } from "./lib/loader";
import { Logger } from "./lib/logger";
import { clearBuildOutDir, isLuaFile, parseToInt, parseUrl } from "./lib/utils";
import type { BundleResult, DeployResult, Tag } from "./types";

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
  const { messageId, processId, isNewProcess, configName } = result;
  const processUrl = chalk.green(`${aoExplorerUrl}/#/entity/${processId}`);
  const messageUrl = chalk.green(`${aoExplorerUrl}/#/message/${messageId}`);
  const logger = Logger.init(configName);

  console.log("");
  if (isNewProcess) {
    logger.log(`Deployed Process: ${processUrl}`);
  }
  logger.log(`Deployment Message: ${messageUrl}`);
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
    "<contractOrConfigPath>",
    "Path to the main contract file or deployment configuration."
  )
  .option("-n, --name [name]", "Specify the process name.", "default")
  .option("-w, --wallet [wallet]", "Path to the wallet JWK file.")
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
    "Scheduler to be used for the process.",
    "_GQ33BkPtZrqxA84vM8Zk-N2aO0toNNu_C-l-rawrBA"
  )
  .option("-m, --module [module]", "Module source for spawning the process.")
  .option(
    "-c, --cron [interval]",
    "Cron interval for the process (e.g. 1-minute, 5-minutes)."
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
    10
  )
  .option(
    "--retry-delay [delay]",
    "Delay between retries in milliseconds.",
    parseToInt,
    3000
  )
  .option("--minify", "Reduce the size of the contract before deployment.");

program.parse(process.argv);

const options = program.opts();
const contractOrConfigPath = program.args[0];
const isContractPath = isLuaFile(contractOrConfigPath);
const isBuildOnly = options.buildOnly;
const outDir = options.outDir || "./process-dist";

async function deploymentHandler() {
  try {
    Logger.log(packageJson.name, "Deploying...", false, true);
    if (isContractPath) {
      const tags: Tag[] = Array.isArray(options.tags)
        ? options.tags.reduce<Tag[]>((accumulator, tag) => {
            if (tag && tag.includes(":")) {
              const [name, value] = tag.split(":");
              accumulator.push({ name, value });
            }
            return accumulator;
          }, [])
        : [];

      const result = await deployContract({
        name: options.name,
        wallet: options.wallet,
        contractPath: contractOrConfigPath,
        scheduler: options.scheduler,
        module: options.module,
        cron: options.cron,
        tags,
        retry: {
          count: parseToInt(options.retryCount, 10),
          delay: parseToInt(options.retryDelay, 3000)
        },
        luaPath: options.luaPath,
        configName: options.name,
        processId: options.processId,
        sqlite: options.sqlite,
        services: {
          gatewayUrl: options.gatewayUrl,
          cuUrl: options.cuUrl,
          muUrl: options.muUrl
        },
        minify: options.minify
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

    if (isContractPath) {
      const [result] = await loadAndBundleContracts(
        [
          {
            contractPath: contractOrConfigPath,
            name,
            outDir,
            luaPath: options.luaPath,
            minify: options.minify
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
        minify: config.minify
      }));
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
  try {
    if (isBuildOnly) {
      await buildHandler();
    } else {
      await deploymentHandler();
    }
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
