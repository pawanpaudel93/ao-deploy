import {
  createDataItemSigner,
  message,
  result,
  spawn,
} from '@permaweb/aoconnect'
import pLimit from 'p-limit'
import type { DeployConfig, DeployResult } from '../types'
import { Wallet } from './wallet'
import { LuaProjectLoader } from './loader'
import { ardb, isArweaveAddress, retryWithDelay, sleep } from './utils'
import { Logger } from './logger'

/**
 * Manages deployments of contracts to AO.
 */
export class DeploymentsManager {
  #cachedAosDetails: { version: string, module: string, scheduler: string } | null = null

  async #getAosDetails() {
    if (this.#cachedAosDetails) {
      return this.#cachedAosDetails
    }

    const defaultDetails = {
      version: '1.10.22',
      module: 'SBNb1qPQ1TDwpD_mboxm2YllmMLXpWw4U8P9Ff8W9vk',
      scheduler: '_GQ33BkPtZrqxA84vM8Zk-N2aO0toNNu_C-l-rawrBA',
    }

    try {
      const response = await fetch('https://raw.githubusercontent.com/permaweb/aos/main/package.json')
      const pkg = await response.json() as { version: string, aos: { module: string } }
      this.#cachedAosDetails = {
        version: pkg?.version || defaultDetails.version,
        module: pkg?.aos?.module || defaultDetails.module,
        scheduler: defaultDetails.scheduler,
      }
      return this.#cachedAosDetails
    }
    catch {
      return defaultDetails
    }
  }

  async #findProcess(name: string, owner: string) {
    const tx = await ardb
      .appName('aos')
      .search('transactions')
      .from(owner)
      .only('id')
      .tags([
        { name: 'Data-Protocol', values: ['ao'] },
        { name: 'Type', values: ['Process'] },
        { name: 'Name', values: [name] },
      ])
      .findOne()

    return tx?.id
  }

  #validateCron(cron: string) {
    const cronRegex = /^\d+\-(Second|second|Minute|Minute|Hour|hour|Day|day|Month|month|Year|year|Block|block)s?$/
    if (!cronRegex.test(cron)) {
      throw new Error('Invalid cron flag!')
    }
  }

  /**
   * Deploys or updates a contract on AO.
   * @param {DeployConfig} deployConfig - Configuration options for the deployment.
   * @returns {Promise<DeployResult>} The result of the deployment.
   */
  async deployContract({ name, wallet, contractPath, tags, cron, module, scheduler, retry, luaPath, configName, processId }: DeployConfig): Promise<DeployResult> {
    name = name || 'default'
    configName = configName || name
    retry = {
      count: typeof retry?.count === 'number' && retry.count >= 0 ? retry.count : 10,
      delay: typeof retry?.delay === 'number' && retry.delay >= 0 ? retry.delay : 3000,
    }

    const logger = new Logger(configName)
    const aosDetails = await this.#getAosDetails()
    module = isArweaveAddress(module) ? module! : aosDetails.module
    scheduler = isArweaveAddress(scheduler) ? scheduler! : aosDetails.scheduler

    const walletInstance = await Wallet.load(wallet)
    const owner = await walletInstance.getAddress()
    const signer = createDataItemSigner(walletInstance.jwk)

    if (!processId || (processId && !isArweaveAddress(processId))) {
      processId = await this.#findProcess(name, owner)
    }

    const isNewProcess = !processId

    if (!processId) {
      logger.log('Spawning new process...', false, true)
      tags = Array.isArray(tags) ? tags : []
      tags = [
        { name: 'App-Name', value: 'aos' },
        { name: 'Name', value: name },
        { name: 'aos-Version', value: aosDetails.version },
        ...tags,
      ]

      if (cron) {
        this.#validateCron(cron)
        tags = [...tags, { name: 'Cron-Interval', value: cron }, { name: 'Cron-Tag-Action', value: 'Cron' }]
      }

      const data = '1984'
      processId = await retryWithDelay(
        () => spawn({ module, signer, tags, data, scheduler }),
        retry.count,
        retry.delay,
      )
      await sleep(1000)
    }
    else {
      logger.log('Updating existing process...', false, true)
    }

    const loader = new LuaProjectLoader(configName, luaPath)
    const contractSrc = await loader.loadContract(contractPath)

    // Load contract to process
    const messageId = await retryWithDelay(
      async () =>
        message({
          process: processId,
          tags: [{ name: 'Action', value: 'Eval' }],
          data: contractSrc,
          signer,
        }),
      retry.count,
      retry.delay,
    )

    const { Output, Error: error } = await retryWithDelay(
      async () => result({
        process: processId,
        message: messageId,
      }),
      retry.count,
      retry.delay,
    )

    let errorMessage = null

    if (Output?.data?.output) {
      errorMessage = Output.data.output
    }
    else if (error) {
      if (typeof error === 'object' && Object.keys(error).length > 0) {
        errorMessage = JSON.stringify(error)
      }
      else {
        errorMessage = String(error)
      }
    }

    if (errorMessage) {
      throw new Error(errorMessage)
    }

    return { name, processId, messageId, isNewProcess, configName }
  }

  /**
   * Deploys multiple contracts concurrently with specified concurrency limits.
   * @param {DeployConfig[]} deployConfigs - Array of deployment configurations.
   * @param {number} concurrency - Maximum number of deployments to run concurrently. Default is 5.
   * @returns {Promise<PromiseSettledResult<DeployResult>[]>} Array of results for each deployment, either fulfilled or rejected.
   */
  async deployContracts(deployConfigs: DeployConfig[], concurrency: number = 5): Promise<PromiseSettledResult<DeployResult>[]> {
    const limit = pLimit(concurrency)
    const promises = deployConfigs.map(config => limit(() => deployContract(config)))
    const results = await Promise.allSettled(promises)
    return results
  }
}

/**
 * Deploys or updates a contract on AO.
 * @param {DeployConfig} deployConfig - Configuration options for the deployment.
 * @returns {Promise<DeployResult>} The result of the deployment.
 */
export async function deployContract(deployConfig: DeployConfig): Promise<DeployResult> {
  const manager = new DeploymentsManager()
  return manager.deployContract(deployConfig)
}

/**
 * Deploys multiple contracts concurrently with specified concurrency limits.
 * @param {DeployConfig[]} deployConfigs - Array of deployment configurations.
 * @param {number} concurrency - Maximum number of deployments to run concurrently. Default is 5.
 * @returns {Promise<PromiseSettledResult<DeployResult>[]>} Array of results for each deployment, either fulfilled or rejected.
 */
export async function deployContracts(deployConfigs: DeployConfig[], concurrency: number = 5): Promise<PromiseSettledResult<DeployResult>[]> {
  const manager = new DeploymentsManager()
  return manager.deployContracts(deployConfigs, concurrency)
}
