import {
  createDataItemSigner,
  message,
  result,
  spawn,
} from '@permaweb/aoconnect'
import Ardb from 'ardb'
import type { JWKInterface } from 'arweave/node/lib/wallet'
import { arweave, getWallet, getWalletAddress, isArweaveAddress } from './wallet'
import { loadContract } from './load'

/**
 * Args for deployContract
 */
export interface DeployArgs {
  /**
   * Process name to spawn
   * @default "default"
   */
  name?: string
  /**
   * Path to contract main file
   */
  contractPath: string
  /**
   * The module source to use to spin up Process
   * @default "Fetches from `https://raw.githubusercontent.com/permaweb/aos/main/package.json`"
   */
  module?: string
  /**
   * Scheduler to use for Process
   * @default "_GQ33BkPtZrqxA84vM8Zk-N2aO0toNNu_C-l-rawrBA"
   */
  scheduler?: string
  /**
   * Additional tags to use for spawning Process
   */
  tags?: Tag[]
  /**
   * Cron interval to use for Process i.e (1-minute, 5-minutes)
   */
  cron?: string
  /**
   * Wallet path or JWK itself
   */
  wallet?: JWKInterface | string

  /**
   * Retry options
   */
  retry?: {
    /**
     * Retry count
     * @default 10
     */
    count?: number
    /**
     * Retry delay in milliseconds
     * @default 3000
     */
    delay?: number
  }
}

export interface Tag { name: string, value: string }

const ardb = new ((Ardb as any)?.default ?? Ardb)(arweave)

/**
 * Retries a given function up to a maximum number of attempts.
 * @param fn - The asynchronous function to retry, which should return a Promise.
 * @param maxAttempts - The maximum number of attempts to make.
 * @param delay - The delay between attempts in milliseconds.
 * @return A Promise that resolves with the result of the function or rejects after all attempts fail.
 */
async function retryWithDelay<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  delay: number = 1000,
): Promise<T> {
  let attempts = 0

  const attempt = async (): Promise<T> => {
    try {
      return await fn()
    }
    catch (error) {
      attempts += 1
      if (attempts < maxAttempts) {
        console.log(`Attempt ${attempts} failed, retrying...`)
        return new Promise<T>(resolve => setTimeout(() => resolve(attempt()), delay))
      }
      else {
        throw error
      }
    }
  }

  return attempt()
}

async function sleep(delay: number = 3000) {
  return new Promise((resolve, _) => setTimeout(resolve, delay))
}

async function getAos() {
  const defaultVersion = '1.10.22'
  const defaultModule = 'SBNb1qPQ1TDwpD_mboxm2YllmMLXpWw4U8P9Ff8W9vk'
  const defaultScheduler = '_GQ33BkPtZrqxA84vM8Zk-N2aO0toNNu_C-l-rawrBA'
  try {
    const pkg = await (
      await fetch(
        'https://raw.githubusercontent.com/permaweb/aos/main/package.json',
      )
    ).json() as { version: string, aos: { module: string } }
    return {
      aosVersion: pkg?.version ?? defaultVersion,
      aosModule: pkg?.aos?.module ?? defaultModule,
      aosScheduler: defaultScheduler,
    }
  }
  catch {
    return { aosVersion: defaultVersion, aosModule: defaultModule, aosScheduler: defaultScheduler }
  }
}

async function findProcess(name: string, aosModule: string, owner: string) {
  const tx = await ardb
    .appName('aos')
    .search('transactions')
    .from(owner)
    .only('id')
    .tags([
      { name: 'Data-Protocol', values: ['ao'] },
      { name: 'Type', values: ['Process'] },
      {
        name: 'Module',
        values: [
          aosModule,
          '1SafZGlZT4TLI8xoc0QEQ4MylHhuyQUblxD8xLKvEKI',
          '9afQ1PLf2mrshqCTZEzzJTR2gWaC9zNPnYgYEqg1Pt4',
        ],
      },
      { name: 'Name', values: [name] },
    ])
    .findOne()

  return tx?.id
}

export async function deployContract({ name, wallet, contractPath, tags, cron, module, scheduler, retry }: DeployArgs) {
  // Create a new process
  name = name || 'default'
  tags = Array.isArray(tags) ? tags : []
  retry = retry ?? { count: 10, delay: 3000 }

  const { aosVersion, aosModule, aosScheduler } = await getAos()
  module = isArweaveAddress(module) ? module! : aosModule
  scheduler = isArweaveAddress(scheduler) ? scheduler! : aosScheduler

  const walletJWK = await getWallet(wallet)
  const owner = await getWalletAddress(walletJWK)
  const signer = createDataItemSigner(wallet)

  let processId = await findProcess(name, module, owner)

  tags = [
    { name: 'App-Name', value: 'aos' },
    { name: 'Name', value: name },
    { name: 'aos-Version', value: aosVersion },
    ...tags,
  ]
  if (cron) {
    if (/^\d+\-(second|seconds|minute|minutes|hour|hours|day|days|month|months|year|years|block|blocks|Second|Seconds|Minute|Minutes|Hour|Hours|Day|Days|Month|Months|Year|Years|Block|Blocks)$/.test(cron)) {
      tags = [...tags, { name: 'Cron-Interval', value: cron }, { name: 'Cron-Tag-Action', value: 'Cron' },
      ]
    }
    else {
      throw new Error('Invalid cron flag!')
    }
  }
  const data = '1984'

  if (!processId) {
    processId = await spawn({ module, signer, tags, data, scheduler })
    await sleep(5000)
  }

  const contractSrc = loadContract(contractPath)

  // Load contract to process
  const messageId = await retryWithDelay(
    async () =>
      message({
        process: processId,
        tags: [{ name: 'Action', value: 'Eval' }],
        data: contractSrc,
        signer,
      }),
    retry.count ?? 10,
    retry.delay ?? 3000,
  )

  const { Output } = await result({ process: processId, message: messageId })
  if (Output?.data?.output)
    throw new Error(Output?.data?.output)

  return { processId, messageId }
}
