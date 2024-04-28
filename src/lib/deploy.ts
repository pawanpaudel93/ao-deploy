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

async function getAosDetails() {
  const defaultDetails = {
    version: '1.10.22',
    module: 'SBNb1qPQ1TDwpD_mboxm2YllmMLXpWw4U8P9Ff8W9vk',
    scheduler: '_GQ33BkPtZrqxA84vM8Zk-N2aO0toNNu_C-l-rawrBA',
  }

  try {
    const response = await fetch('https://raw.githubusercontent.com/permaweb/aos/main/package.json')
    const pkg = await response.json() as { version: string, aos: { module: string } }
    return {
      version: pkg?.version || defaultDetails.version,
      module: pkg?.aos?.module || defaultDetails.module,
      scheduler: defaultDetails.scheduler,
    }
  }
  catch {
    return defaultDetails
  }
}

async function findProcess(name: string, owner: string) {
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

function validateCron(cron: string) {
  const cronRegex = /^\d+\-(second|seconds|minute|minutes|hour|hours|day|days|month|months|year|years|block|blocks|Second|Seconds|Minute|Minutes|Hour|Hours|Day|Days|Month|Months|Year|Years|Block|Blocks)$/
  if (!cronRegex.test(cron))
    throw new Error('Invalid cron flag!')
}

export async function deployContract({ name, wallet, contractPath, tags, cron, module, scheduler, retry, luaPath, configName }: DeployConfig): Promise<DeployResult> {
  name = name || 'default'
  configName = configName || name
  retry = {
    count: typeof retry?.count === 'number' && retry.count >= 0 ? retry.count : 10,
    delay: typeof retry?.delay === 'number' && retry.delay >= 0 ? retry.delay : 3000,
  }

  const aosDetails = await getAosDetails()
  module = isArweaveAddress(module) ? module! : aosDetails.module
  scheduler = isArweaveAddress(scheduler) ? scheduler! : aosDetails.scheduler

  const walletInstance = await Wallet.load(wallet)
  const owner = await walletInstance.getAddress()
  const signer = createDataItemSigner(walletInstance.jwk)

  let processId = await findProcess(name, owner)
  const isNewProcess = !processId

  if (!processId) {
    tags = Array.isArray(tags) ? tags : []
    tags = [
      { name: 'App-Name', value: 'aos' },
      { name: 'Name', value: name },
      { name: 'aos-Version', value: aosDetails.version },
      ...tags,
    ]

    if (cron) {
      validateCron(cron)
      tags = [...tags, { name: 'Cron-Interval', value: cron }, { name: 'Cron-Tag-Action', value: 'Cron' }]
    }

    const data = '1984'
    processId = await spawn({ module, signer, tags, data, scheduler })
    await sleep(5000)
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

  const errorMessage = Output?.data?.output || error

  if (errorMessage)
    throw new Error(errorMessage)

  return { name, processId, messageId, isNewProcess, configName }
}

export async function deployContracts(deployConfigs: DeployConfig[], concurrency: number = 5) {
  const limit = pLimit(concurrency)
  const promises = deployConfigs.map(config => limit(() => deployContract(config)))
  const results = await Promise.allSettled(promises)
  return results
}
