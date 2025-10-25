import { connect } from "@permaweb/aoconnect";
import pLimit from "p-limit";
import type {
  AosConfig,
  DeployConfig,
  DeployResult,
  Services
} from "../../types";
import { AOS_QUERY, APP_NAME, defaultServices } from "../constants";
import { Logger } from "../logger";
import { minifyLuaCode } from "../minify";
import {
  getArweave,
  hasValidBlueprints,
  isArweaveAddress,
  isCronPattern,
  isUrl,
  loadBlueprints,
  logActionStatus,
  parseToInt,
  pollForProcessSpawn,
  retryWithDelay
} from "../utils/utils.common";
import { WalletInterface } from "../wallet/wallet.types";

/**
 * Manages deployments of contracts to AO.
 */
export class BaseDeploymentsManager {
  protected cachedAosConfig: AosConfig | null = null;

  protected validateServices(services?: Services) {
    // Validate and use provided URLs or fall back to defaults
    const { gatewayUrl, cuUrl, muUrl } = services ?? {};

    services = {
      gatewayUrl: isUrl(gatewayUrl) ? gatewayUrl : defaultServices.gatewayUrl,
      cuUrl: isUrl(cuUrl) ? cuUrl : defaultServices.cuUrl,
      muUrl: isUrl(muUrl) ? muUrl : defaultServices.muUrl
    };

    return services;
  }

  protected getAoInstance(services: Services): any {
    if (
      (!services.cuUrl || services.cuUrl === defaultServices.cuUrl) &&
      (!services.gatewayUrl ||
        services.gatewayUrl === defaultServices.gatewayUrl) &&
      (!services.muUrl || services.muUrl === defaultServices.muUrl)
    ) {
      return connect({ MODE: "legacy" });
    }

    return connect({
      MODE: "legacy",
      GATEWAY_URL: services.gatewayUrl,
      MU_URL: services.muUrl,
      CU_URL: services.cuUrl
    });
  }

  protected async getAosConfig() {
    if (this.cachedAosConfig) {
      return this.cachedAosConfig;
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
      this.cachedAosConfig = {
        module: config?.module || defaultDetails.module,
        sqliteModule: config?.sqliteModule || defaultDetails.sqliteModule,
        scheduler: config?.scheduler || defaultDetails.scheduler,
        authority: defaultDetails.authority
      };
      return this.cachedAosConfig;
    } catch {
      return defaultDetails;
    }
  }

  protected async findProcess(
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

  protected validateCron(cron: string) {
    const isCronValid = isCronPattern(cron);
    if (!isCronValid) {
      throw new Error("Invalid cron flag!");
    }
  }

  protected async _deployContract({
    name,
    wallet: walletInstance,
    contractPath,
    getContractSource,
    tags,
    cron,
    module,
    scheduler,
    retry,
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
  }: Omit<DeployConfig, "wallet"> & {
    getContractSource: () => Promise<string>;
    wallet: WalletInterface;
  }): Promise<DeployResult> {
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

    const owner = await walletInstance.getAddress();

    const signer = walletInstance.getDataItemSigner();

    services = this.validateServices(services);

    // Initialize the AO instance with validated URLs
    const aoInstance = this.getAoInstance(services);

    logActionStatus(
      "deploy",
      logger,
      contractPath || "provided contract source",
      blueprints
    );

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

    let contractSrc = (await getContractSource()) || "";

    let blueprintsSrc = "";

    if (!contractSrc && !hasValidBlueprints(blueprints)) {
      throw new Error(
        "Please provide a contract path, source code, or blueprints."
      );
    }

    if (Array.isArray(blueprints) && blueprints.length > 0) {
      blueprintsSrc = await loadBlueprints(blueprints);
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
      contractSrc = await minifyLuaCode(contractSrc);
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
        processId: processId!,
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

      // Close wallet after message is sent
      await walletInstance.close("success");

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

  /**
   * Deploys or updates a contract on AO.
   * @param {DeployConfig} deployConfig - Configuration options for the deployment.
   * @returns {Promise<DeployResult>} The result of the deployment.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async deployContract(_deployConfig: DeployConfig): Promise<DeployResult> {
    throw new Error("Not implemented");
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
      limit(() => this.deployContract(config))
    );
    const results = await Promise.allSettled(promises);
    return results;
  }
}
