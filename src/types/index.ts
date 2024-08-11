import type { JWKInterface } from 'arweave/node/lib/wallet'

export type ConfigName = string

export interface Tag { name: string, value: string }

export interface Services {
  /**
   * The URL of the desired Gateway.
   * @default "https://arweave.net"
   */
  gatewayUrl?: string

  /**
   * The URL of the desired AO Compute Unit.
   * @default "https://cu.ao-testnet.xyz"
   */
  cuUrl?: string

  /**
   * The URL of the desired AO Messenger Unit.
   * @default "https://mu.ao-testnet.xyz"
   */
  muUrl?: string
}

export interface DeployConfig {
  /**
   * Process name to spawn
   * @default "default"
   */
  name?: string

  /**
   * Config name used for logging
   */
  configName?: string

  /**
   * Path to contract main file
   */
  contractPath: string

  /**
   * The module source to use to spin up Process
   * @default "Fetches from `https://raw.githubusercontent.com/pawanpaudel93/ao-deploy-config/main/config.json`"
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
   * lua path to find the lua modules
   */
  luaPath?: string

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

  /**
   * Concurrency limit to deploy multiple processes
   * @default 5
   */
  concurrency?: number

  /**
   * Process Id of an existing process
   */
  processId?: string

  /**
   * Output directory of bundle
   */
  outDir?: string

  /**
   * Use sqlite aos module when spawning new process
   * @default false
   */
  sqlite?: boolean

  /**
   * Configuration for various AO services
   */
  services?: Services
}

export type Config = Record<ConfigName, DeployConfig>

export interface DeployResult {
  name: string
  configName: string
  messageId: string
  processId: string
  isNewProcess: boolean
}

export interface BundleResult {
  name: string
  configName: string
  outDir: string
  size: number
}

export interface BundlingConfig {
  name: string
  contractPath: string
  outDir: string
  luaPath?: string
}

export interface Module { name: string, path: string, content?: string, dependencies?: Set<string> }

export interface AosConfig {
  module: string
  sqliteModule: string
  scheduler: string
  authority: string
}
