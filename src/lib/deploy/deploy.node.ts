import { createDataItemSigner } from "@permaweb/aoconnect";
import type { DeployConfig, DeployResult } from "../../types";
import { APP_NAME } from "../constants";
import { LuaProjectLoader } from "../loader";
import { Logger } from "../logger";
import {
  hasValidBlueprints,
  isArweaveAddress,
  loadBlueprints,
  logActionStatus,
  parseToInt,
  pollForProcessSpawn,
  retryWithDelay
} from "../utils/utils.common";
import { Wallet } from "../wallet/wallet.node";
import { BaseDeploymentsManager } from "./deploy.common";

/**
 * Manages deployments of contracts to AO.
 */
export class DeploymentsManager extends BaseDeploymentsManager {
  /**
   * Deploys or updates a contract on AO.
   * @param {DeployConfig} deployConfig - Configuration options for the deployment.
   * @returns {Promise<DeployResult>} The result of the deployment.
   */
  async deployContract({
    name,
    wallet,
    contractPath,
    tags,
    cron,
    module,
    scheduler,
    retry,
    luaPath,
    configName,
    processId,
    sqlite,
    services,
    minify,
    contractTransformer,
    onBoot,
    blueprints,
    silent = false,
    forceSpawn = false
  }: DeployConfig): Promise<DeployResult> {
    name = name || "default";
    configName = configName || name;
    retry = {
      count: parseToInt(retry?.count, 10),
      delay: parseToInt(retry?.delay, 3000)
    };

    const logger = new Logger(configName, silent);
    const aosConfig = await this.getAosConfig();
    module = isArweaveAddress(module)
      ? module!
      : sqlite
        ? aosConfig.sqliteModule
        : aosConfig.module;
    scheduler = isArweaveAddress(scheduler) ? scheduler! : aosConfig.scheduler;

    const walletInstance = await Wallet.load(wallet);
    const owner = await walletInstance.getAddress();
    const signer = createDataItemSigner(walletInstance.jwk);
    services = this.validateServices(services);

    // Initialize the AO instance with validated URLs
    const aoInstance = this.getAoInstance(services);

    logActionStatus("deploy", logger, contractPath, blueprints);

    let isNewProcess = forceSpawn;

    if (
      !forceSpawn &&
      (!processId || (processId && !isArweaveAddress(processId)))
    ) {
      processId = await this.findProcess(
        name,
        owner,
        retry,
        services.gatewayUrl!
      );
      isNewProcess = !processId;
    }

    let contractSrc = "";
    let blueprintsSrc = "";

    if (!contractPath && !hasValidBlueprints(blueprints)) {
      throw new Error(
        "Please provide either a valid contract path or blueprints."
      );
    }

    if (Array.isArray(blueprints) && blueprints.length > 0) {
      blueprintsSrc = await loadBlueprints(blueprints);
    }

    const loader = new LuaProjectLoader(configName, luaPath, silent);
    if (contractPath) {
      contractSrc = await loader.loadContract(contractPath);
    }

    if (blueprintsSrc || contractSrc) {
      contractSrc = [blueprintsSrc, contractSrc]
        .filter(Boolean)
        .join("\n\n")
        .trim();
    }

    if (contractTransformer && typeof contractTransformer === "function") {
      logger.log("Transforming contract...", false, false);
      contractSrc = await contractTransformer(contractSrc);
    }

    if (minify) {
      logger.log("Minifying contract...", false, false);
      contractSrc = await loader.minifyContract(contractSrc);
    }

    if (isNewProcess) {
      logger.log("Spawning new process...", false, true);
      tags = Array.isArray(tags) ? tags : [];
      tags = [
        { name: "App-Name", value: APP_NAME },
        { name: "Name", value: name },
        { name: "aos-Version", value: "REPLACE-AO-DEPLOY-VERSION" },
        { name: "Authority", value: aosConfig.authority },
        ...tags
      ];

      if (onBoot) {
        tags = [...tags, { name: "On-Boot", value: "Data" }];
      }

      if (cron) {
        this.validateCron(cron);
        tags = [
          ...tags,
          { name: "Cron-Interval", value: cron },
          { name: "Cron-Tag-Action", value: "Cron" }
        ];
      }

      const data = onBoot ? contractSrc : "1984";
      processId = await retryWithDelay(
        () => aoInstance.spawn({ module, signer, tags, data, scheduler }),
        retry.count,
        retry.delay
      );

      if (!processId) {
        throw new Error("Failed to spawn process");
      }

      await pollForProcessSpawn({
        processId,
        gatewayUrl: services.gatewayUrl
      });

      if (onBoot) {
        return { name, processId, isNewProcess, configName };
      }
    }

    let messageId: string;
    if (!onBoot || !isNewProcess) {
      if (!isNewProcess) {
        logger.log("Updating existing process...", false, true);
      }
      // Load contract to process
      messageId = await retryWithDelay(
        async () =>
          aoInstance.message({
            process: processId!,
            tags: [{ name: "Action", value: "Eval" }],
            data: contractSrc,
            signer
          }),
        retry.count,
        retry.delay
      );

      const { Output, Error: error } = await retryWithDelay(
        async () =>
          aoInstance.result({
            process: processId!,
            message: messageId
          }),
        retry.count,
        retry.delay
      );

      let errorMessage = null;

      if (Output?.data?.output) {
        errorMessage = Output.data.output;
      } else if (error) {
        if (typeof error === "object" && Object.keys(error).length > 0) {
          errorMessage = JSON.stringify(error);
        } else {
          errorMessage = String(error);
        }
      }

      if (errorMessage) {
        throw new Error(errorMessage);
      }
    }

    return {
      name,
      processId: processId!,
      messageId: messageId!,
      isNewProcess,
      configName
    };
  }
}

/**
 * Deploys or updates a contract on AO.
 * @param {DeployConfig} deployConfig - Configuration options for the deployment.
 * @returns {Promise<DeployResult>} The result of the deployment.
 */
export async function deployContract(
  deployConfig: DeployConfig
): Promise<DeployResult> {
  const manager = new DeploymentsManager();
  return manager.deployContract(deployConfig);
}

/**
 * Deploys multiple contracts concurrently with specified concurrency limits.
 * @param {DeployConfig[]} deployConfigs - Array of deployment configurations.
 * @param {number} concurrency - Maximum number of deployments to run concurrently. Default is 5.
 * @returns {Promise<PromiseSettledResult<DeployResult>[]>} Array of results for each deployment, either fulfilled or rejected.
 */
export async function deployContracts(
  deployConfigs: DeployConfig[],
  concurrency: number = 5
): Promise<PromiseSettledResult<DeployResult>[]> {
  const manager = new DeploymentsManager();
  return manager.deployContracts(deployConfigs, concurrency);
}
