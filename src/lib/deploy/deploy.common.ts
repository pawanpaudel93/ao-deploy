import { connect } from "@permaweb/aoconnect";
import pLimit from "p-limit";
import type {
  AosConfig,
  DeployConfig,
  DeployResult,
  Services
} from "../../types";
import { AOS_QUERY, defaultServices } from "../constants";
import {
  getArweave,
  isCronPattern,
  isUrl,
  retryWithDelay
} from "../utils/utils.common";

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
