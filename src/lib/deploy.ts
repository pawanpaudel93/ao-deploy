import {
  createDataItemSigner,
  message,
  result,
  spawn,
} from '@permaweb/aoconnect'
import Ardb from 'ardb'
import { arweave, getWallet, getWalletAddress } from './wallet'
import { loadContract } from './load'

const ardb = new ((Ardb as any)?.default ?? Ardb)(arweave)

export interface DeployArgs {
  name?: string
  walletPath?: string
  contractPath: string
}

/**
 * Retries a given function up to a maximum number of attempts.
 * @param fn - The asynchronous function to retry, which should return a Promise.
 * @param maxAttempts - The maximum number of attempts to make.
 * @param delay - The delay between attempts in milliseconds.
 * @return A Promise that resolves with the result of the function or rejects after all attempts fail.
 */
async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  delay: number = 1000,
): Promise<T> {
  let attempts = 0

  const attempt = (): Promise<T> => {
    return fn().catch((error) => {
      attempts += 1
      if (attempts < maxAttempts) {
        console.log(`Attempt ${attempts} failed, retrying...`)
        return new Promise<T>(resolve =>
          setTimeout(() => resolve(attempt()), delay),
        )
      }
      else {
        throw error
      }
    })
  }

  return attempt()
}

async function sleep(delay: number = 3000) {
  return new Promise((resolve, _) => setTimeout(resolve, delay))
}

async function getAos() {
  const defaultVersion = '1.10.22'
  const defaultModule = 'SBNb1qPQ1TDwpD_mboxm2YllmMLXpWw4U8P9Ff8W9vk'
  try {
    const pkg = await (
      await fetch(
        'https://raw.githubusercontent.com/permaweb/aos/main/package.json',
      )
    ).json() as { version: string, aos: { module: string } }
    return {
      version: pkg?.version ?? defaultVersion,
      module: pkg?.aos?.module ?? defaultModule,
    }
  }
  catch {
    return { version: defaultVersion, module: defaultModule }
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

export async function deployContract({ name, walletPath, contractPath }: DeployArgs) {
  // Create a new process
  name = name || 'default'
  const { version, module } = await getAos()
  const wallet = await getWallet(walletPath)
  const owner = await getWalletAddress(wallet)
  let processId = await findProcess(name, module, owner)
  const scheduler = '_GQ33BkPtZrqxA84vM8Zk-N2aO0toNNu_C-l-rawrBA'
  const signer = createDataItemSigner(wallet)
  const tags = [
    { name: 'App-Name', value: 'aos' },
    { name: 'Name', value: name },
    { name: 'aos-Version', value: version },
  ]
  const data = '1984'

  if (!processId) {
    processId = await spawn({ module, signer, tags, data, scheduler })
    await sleep(5000)
  }

  const contractSrc = loadContract(contractPath)

  // Load contract to process
  const messageId = await retry(
    async () =>
      message({
        process: processId,
        tags: [{ name: 'Action', value: 'Eval' }],
        data: contractSrc,
        signer,
      }),
    10,
    3000,
  )

  const { Output } = await result({ process: processId, message: messageId })
  if (Output?.data?.output)
    throw new Error(Output?.data?.output)

  return { processId, messageId }
}
