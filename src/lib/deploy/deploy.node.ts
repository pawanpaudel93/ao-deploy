import pLimit from "p-limit";
import type { DeployConfig, DeployResult } from "../../types";
import { LuaProjectLoader } from "../loader";
import { sleep } from "../utils/utils.common";
import { Wallet } from "../wallet/wallet.node";
import { BaseDeploymentsManager } from "./deploy.common";

/**
 * Manages deployments of contracts to AO.
 */
export class DeploymentsManager extends BaseDeploymentsManager {
  async #deployContract(
    deployConfig: DeployConfig,
    sharedWallet?: Wallet
  ): Promise<DeployResult> {
    const name = deployConfig.name || "default";
    const configName = deployConfig.configName || name;

    const walletInstance =
      deployConfig.wallet === "browser" && sharedWallet
        ? sharedWallet
        : await Wallet.load(deployConfig.wallet, deployConfig.browserConfig);

    const getContractSource = async () => {
      if (deployConfig.contractSrc) return deployConfig.contractSrc;
      if (!deployConfig.contractPath) return "";

      const loader = new LuaProjectLoader(
        configName,
        deployConfig.luaPath,
        deployConfig.silent
      );
      const contractSrc = await loader.loadContract(deployConfig.contractPath);
      return contractSrc;
    };

    try {
      return await this.deploy({
        ...deployConfig,
        wallet: walletInstance,
        getContractSource,
        isSharedWallet: !!sharedWallet
      });
    } catch (error) {
      // Only close browser wallet if deployment fails and it's not a shared wallet
      if (!sharedWallet && deployConfig.wallet === "browser") {
        await walletInstance.close("failed");
      }
      throw error;
    }
  }

  /**
   * Deploys or updates a contract on AO.
   * @param {DeployConfig} deployConfig - Configuration options for the deployment.
   * @returns {Promise<DeployResult>} The result of the deployment.
   */
  async deployContract(deployConfig: DeployConfig): Promise<DeployResult> {
    return this.#deployContract(deployConfig);
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
    let sharedWallet: Wallet | null = null;

    try {
      // Create a shared wallet instance only if more than one config uses browser wallet
      let browserWalletCount = 0;
      let firstBrowserConfig: DeployConfig | undefined;

      for (const config of deployConfigs) {
        if (config.wallet === "browser") {
          browserWalletCount++;
          if (!firstBrowserConfig) {
            firstBrowserConfig = config;
          }
          // Early exit once we know we need a shared wallet
          if (browserWalletCount > 1) break;
        }
      }

      if (browserWalletCount > 1 && firstBrowserConfig) {
        sharedWallet = await Wallet.load(
          firstBrowserConfig.wallet,
          firstBrowserConfig.browserConfig
        );
      }

      const limit = pLimit(concurrency);
      const promises = deployConfigs.map((config) =>
        limit(() => this.#deployContract(config, sharedWallet || undefined))
      );
      const results = await Promise.allSettled(promises);

      // Wait a bit to ensure all messages are processed before closing the wallet
      if (sharedWallet) {
        await sleep(1000);
      }

      return results;
    } finally {
      if (sharedWallet) {
        await sharedWallet.close("success");
      }
    }
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
