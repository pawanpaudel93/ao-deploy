import * as aoconnect from "@permaweb/aoconnect";
import pLimit from "p-limit";
import type { AosConfig, DeployConfig, DeployResult, Services } from "../types";
import { AOS_QUERY, APP_NAME, defaultServices } from "./constants";
import { LuaProjectLoader } from "./loader";
import { Logger } from "./logger";
import {
  getArweave,
  isArweaveAddress,
  isCronPattern,
  isUrl,
  parseToInt,
  retryWithDelay,
  sleep
} from "./utils";
import { Wallet } from "./wallet";

/**
 * Manages deployments of contracts to AO.
 */
export class DeploymentsManager {
  #cachedAosConfig: AosConfig | null = null;

  #validateServices(services?: Services) {
    // Validate and use provided URLs or fall back to defaults
    const { gatewayUrl, cuUrl, muUrl } = services ?? {};

    services = {
      gatewayUrl: isUrl(gatewayUrl) ? gatewayUrl : defaultServices.gatewayUrl,
      cuUrl: isUrl(cuUrl) ? cuUrl : defaultServices.cuUrl,
      muUrl: isUrl(muUrl) ? muUrl : defaultServices.muUrl
    };

    return services;
  }

  #getAoInstance(services: Services) {
    if (
      (!services.cuUrl || services.cuUrl === defaultServices.cuUrl) &&
      (!services.gatewayUrl ||
        services.gatewayUrl === defaultServices.gatewayUrl) &&
      (!services.muUrl || services.muUrl === defaultServices.muUrl)
    ) {
      return aoconnect;
    }

    return aoconnect.connect({
      GATEWAY_URL: services.gatewayUrl,
      MU_URL: services.muUrl,
      CU_URL: services.cuUrl
    });
  }

  async #getAosConfig() {
    if (this.#cachedAosConfig) {
      return this.#cachedAosConfig;
    }

    const defaultDetails = {
      module: "cNlipBptaF9JeFAf4wUmpi43EojNanIBos3EfNrEOWo",
      sqliteModule: "u1Ju_X8jiuq4rX9Nh-ZGRQuYQZgV2MKLMT3CZsykk54",
      scheduler: "_GQ33BkPtZrqxA84vM8Zk-N2aO0toNNu_C-l-rawrBA",
      authority: "fcoN_xJeisVsPXA-trzVAuIiqO3ydLQxM-L4XbrQKzY"
    };

    try {
      const response = await fetch(
        "https://raw.githubusercontent.com/pawanpaudel93/ao-deploy-config/main/config.json"
      );
      const config = (await response.json()) as AosConfig;
      this.#cachedAosConfig = {
        module: config?.module || defaultDetails.module,
        sqliteModule: config?.sqliteModule || defaultDetails.sqliteModule,
        scheduler: config?.scheduler || defaultDetails.scheduler,
        authority: defaultDetails.authority
      };
      return this.#cachedAosConfig;
    } catch {
      return defaultDetails;
    }
  }

  async #findProcess(
    name: string,
    owner: string,
    retry: DeployConfig["retry"],
    gateway: string
  ) {
    const processId = await retryWithDelay(
      async () => {
        const res = await getArweave(gateway).api.post("/graphql", {
          query: AOS_QUERY,
          variables: { owners: [owner], names: [name] }
        });
        if (!res.ok || res?.data?.data === null) {
          throw new Error(`(${res.status}) ${res.statusText} - GraphQL ERROR`);
        }
        return res?.data?.data?.transactions?.edges?.[0]?.node?.id;
      },
      retry?.count,
      retry?.delay
    );

    return processId;
  }

  #validateCron(cron: string) {
    const isCronValid = isCronPattern(cron);
    if (!isCronValid) {
      throw new Error("Invalid cron flag!");
    }
  }

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
    contractTransformer
  }: DeployConfig): Promise<DeployResult> {
    name = name || "default";
    configName = configName || name;
    retry = {
      count: parseToInt(retry?.count, 10),
      delay: parseToInt(retry?.delay, 3000)
    };

    const logger = new Logger(configName);
    const aosConfig = await this.#getAosConfig();
    module = isArweaveAddress(module)
      ? module!
      : sqlite
        ? aosConfig.sqliteModule
        : aosConfig.module;
    scheduler = isArweaveAddress(scheduler) ? scheduler! : aosConfig.scheduler;

    const walletInstance = await Wallet.load(wallet);
    const owner = await walletInstance.getAddress();
    const signer = aoconnect.createDataItemSigner(walletInstance.jwk);
    services = this.#validateServices(services);

    // Initialize the AO instance with validated URLs
    const aoInstance = this.#getAoInstance(services);

    if (!processId || (processId && !isArweaveAddress(processId))) {
      processId = await this.#findProcess(
        name,
        owner,
        retry,
        services.gatewayUrl!
      );
    }

    const isNewProcess = !processId;

    if (!processId) {
      logger.log("Spawning new process...", false, true);
      tags = Array.isArray(tags) ? tags : [];
      tags = [
        { name: "App-Name", value: APP_NAME },
        { name: "Name", value: name },
        { name: "aos-Version", value: "REPLACE-AO-DEPLOY-VERSION" },
        { name: "Authority", value: aosConfig.authority },
        ...tags
      ];

      if (cron) {
        this.#validateCron(cron);
        tags = [
          ...tags,
          { name: "Cron-Interval", value: cron },
          { name: "Cron-Tag-Action", value: "Cron" }
        ];
      }

      const data = "1984";
      processId = await retryWithDelay(
        () => aoInstance.spawn({ module, signer, tags, data, scheduler }),
        retry.count,
        retry.delay
      );
      await sleep(1000);
    } else {
      logger.log("Updating existing process...", false, true);
    }

    const loader = new LuaProjectLoader(configName, luaPath);
    let contractSrc = await loader.loadContract(contractPath);

    if (minify) {
      logger.log("Minifying contract...", false, false);
      contractSrc = await loader.minifyContract(contractSrc);
    }

    if (contractTransformer && typeof contractTransformer === "function") {
      logger.log("Transforming contract...", false, false);
      contractSrc = await contractTransformer(contractSrc);
    }

    logger.log(`Deploying: ${contractPath}`, false, true);
    // Load contract to process
    const messageId = await retryWithDelay(
      async () =>
        aoInstance.message({
          process: processId,
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
          process: processId,
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

    return { name, processId, messageId, isNewProcess, configName };
  }

  /**
   * Deploys multiple contracts concurrently with specified concurrency limits.
   * @param {DeployConfig[]} deployConfigs - Array of deployment configurations.
   * @param {number} concurrency - Maximum number of deployments to run concurrently. Default is 5.
   * @returns {Promise<PromiseSettledResult<DeployResult>[]>} Array of results for each deployment, either fulfilled or rejected.
   */
  async deployContracts(
    deployConfigs: DeployConfig[],
    concurrency: number = 5
  ): Promise<PromiseSettledResult<DeployResult>[]> {
    const limit = pLimit(concurrency);
    const promises = deployConfigs.map((config) =>
      limit(() => deployContract(config))
    );
    const results = await Promise.allSettled(promises);
    return results;
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
