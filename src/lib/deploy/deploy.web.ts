import pLimit from "p-limit";
import type { DeployResult, WebDeployConfig } from "../../types";
import { Wallet } from "../wallet/wallet.web";
import { BaseDeploymentsManager } from "./deploy.common";

/**
 * Manages deployments of contracts to AO.
 */
export class DeploymentsManager extends BaseDeploymentsManager {
  /**
   * Deploys or updates a contract on AO.
   * @param {WebDeployConfig} deployConfig - Configuration options for the deployment.
   * @returns {Promise<DeployResult>} The result of the deployment.
   */
  async deployContract(deployConfig: WebDeployConfig): Promise<DeployResult> {
    const walletInstance = await Wallet.load();

    const getContractSource = async () => deployConfig.contractSrc || "";

    return this.deploy({
      ...deployConfig,
      wallet: walletInstance,
      getContractSource
    });
  }

  /**
   * Deploys multiple contracts concurrently with specified concurrency limits.
   * @param {WebDeployConfig[]} deployConfigs - Array of deployment configurations.
   * @param {number} concurrency - Maximum number of deployments to run concurrently. Default is 5.
   * @returns {Promise<PromiseSettledResult<DeployResult>[]>} Array of results for each deployment, either fulfilled or rejected.
   */
  async deployContracts(
    deployConfigs: WebDeployConfig[],
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

/**
 * Deploys or updates a contract on AO.
 * @param {WebDeployConfig} deployConfig - Configuration options for the deployment.
 * @returns {Promise<DeployResult>} The result of the deployment.
 */
export async function deployContract(
  deployConfig: WebDeployConfig
): Promise<DeployResult> {
  const manager = new DeploymentsManager();
  return manager.deployContract(deployConfig);
}

/**
 * Deploys multiple contracts concurrently with specified concurrency limits.
 * @param {WebDeployConfig[]} deployConfigs - Array of deployment configurations.
 * @param {number} concurrency - Maximum number of deployments to run concurrently. Default is 5.
 * @returns {Promise<PromiseSettledResult<DeployResult>[]>} Array of results for each deployment, either fulfilled or rejected.
 */
export async function deployContracts(
  deployConfigs: WebDeployConfig[],
  concurrency: number = 5
): Promise<PromiseSettledResult<DeployResult>[]> {
  const manager = new DeploymentsManager();
  return manager.deployContracts(deployConfigs, concurrency);
}
