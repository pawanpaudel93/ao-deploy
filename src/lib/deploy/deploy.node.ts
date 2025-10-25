import type { DeployConfig, DeployResult } from "../../types";
import { LuaProjectLoader } from "../loader";
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
  async deployContract(deployConfig: DeployConfig): Promise<DeployResult> {
    const name = deployConfig.name || "default";
    const configName = deployConfig.configName || name;

    const walletInstance = await Wallet.load(deployConfig.wallet);

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
      return await this._deployContract({
        ...deployConfig,
        wallet: walletInstance,
        getContractSource
      });
    } catch (error) {
      // Close browser wallet if deployment fails
      await walletInstance.close("failed");
      throw error;
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
