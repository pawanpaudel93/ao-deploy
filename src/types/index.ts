import type { JWKInterface } from "arweave/node/lib/wallet";

export type ConfigName = string;

export interface Tag {
  name: string;
  value: string;
}

export interface Services {
  /**
   * The URL of the desired Gateway.
   * @default "https://arweave.net"
   */
  gatewayUrl?: string;

  /**
   * The URL of the desired AO Compute Unit.
   * @default "https://cu.ao-testnet.xyz"
   */
  cuUrl?: string;

  /**
   * The URL of the desired AO Messenger Unit.
   * @default "https://mu.ao-testnet.xyz"
   */
  muUrl?: string;
}

export type DeployConfig = {
  /**
   * Process name to spawn
   * @default "default"
   */
  name?: string;

  /**
   * Config name used for logging
   */
  configName?: string;

  /**
   * The module source to use to spin up Process
   * @default "Fetches from `https://raw.githubusercontent.com/pawanpaudel93/ao-deploy-config/main/config.json`"
   */
  module?: string;

  /**
   * Scheduler to use for Process
   * @default "_GQ33BkPtZrqxA84vM8Zk-N2aO0toNNu_C-l-rawrBA"
   */
  scheduler?: string;

  /**
   * Additional tags to use for spawning Process
   */
  tags?: Tag[];

  /**
   * Cron interval to use for Process i.e (1-minute, 5-minutes)
   */
  cron?: string;

  /**
   * Wallet path, JWK itself, or "browser" to use browser wallet (Wander or other compatible wallet)
   */
  wallet?: JWKInterface | "browser" | (string & {});

  /**
   * lua path to find the lua modules
   */
  luaPath?: string;

  /**
   * Retry options
   */
  retry?: {
    /**
     * Retry count
     * @default 10
     */
    count?: number;
    /**
     * Retry delay in milliseconds
     * @default 3000
     */
    delay?: number;
  };

  /**
   * Process Id of an existing process
   */
  processId?: string;

  /**
   * Output directory of bundle
   */
  outDir?: string;

  /**
   * Use sqlite aos module when spawning new process
   * @default false
   */
  sqlite?: boolean;

  /**
   * Configuration for various AO services
   */
  services?: Services;

  /**
   * Minify the contract before deployment
   * @default false
   */
  minify?: boolean;

  /**
   * Custom function to transform contract code before deployment
   * @param source Raw contract source code
   * @returns Transformed source code
   * @example
   * ```ts
   * contractTransformer: (source) => {
   *   // Example: Remove all comments from the source code
   *   return source.replace(/\s*--.*\n/g, "");
   * }
   * ```
   */
  contractTransformer?: (source: string) => string | Promise<string>;

  /**
   * Enable AOS On-Boot loading to load contract when process is spawned.
   * Sets "On-Boot=Data" tag during deployment.
   * CLI: --on-boot
   * @see https://github.com/permaweb/aos?tab=readme-ov-file#boot-loading
   * @default false
   */
  onBoot?: boolean;

  /**
   * Disable logging to console
   * @default false
   */
  silent?: boolean;

  /**
   * Force spawning a new process without checking for existing ones.
   * @default false
   */
  forceSpawn?: boolean;

  /**
   * Browser configuration for browser wallet
   * @example
   * ```ts
   * browserConfig: {
   *   browser: "chrome",
   *   browserProfile: "Profile 1"
   * }
   * ```
   */
  browserConfig?: {
    browser?:
      | "chrome"
      | "firefox"
      | "edge"
      | "brave"
      | "safari"
      | "opera"
      | "zen"
      | "vivaldi"
      | (string & {})
      | false;
    browserProfile?: string;
  };
} & (
  | {
      /**
       * Path to contract main file
       */
      contractPath: string;

      contractSrc?: string;

      /**
       * Blueprints to use for deployment
       */
      blueprints?: Blueprint[];
    }
  | {
      contractPath?: string;

      contractSrc?: string;

      /**
       * Blueprints to use for deployment
       */
      blueprints: Blueprint[];
    }
  | {
      contractPath?: string;

      contractSrc: string;
      /**
       * Blueprints to use for deployment
       */
      blueprints?: Blueprint[];
    }
);

export type WebDeployConfig = Omit<
  DeployConfig,
  "wallet" | "contractPath" | "luaPath" | "browserConfig"
>;

export type Config = Record<ConfigName, DeployConfig>;

export interface DeployResult {
  name: string;
  configName: string;
  messageId?: string;
  processId: string;
  isNewProcess: boolean;
}

export interface BundleResult {
  name: string;
  configName: string;
  outDir: string;
  size: number;
}

export type BundlingConfig = {
  name: string;
  outDir: string;
  luaPath?: string;
  minify?: boolean;
  contractTransformer?: (source: string) => string | Promise<string>;
} & (
  | {
      contractPath: string;
      blueprints?: Blueprint[];
    }
  | {
      contractPath?: string;
      blueprints: Blueprint[];
    }
);

export interface Module {
  name: string;
  path: string;
  content?: string;
  dependencies?: Set<string>;
}

export interface AosConfig {
  module: string;
  sqliteModule: string;
  scheduler: string;
  authority: string;
}

export type Blueprint =
  | "apm"
  | "arena"
  | "arns"
  | "chat"
  | "chatroom"
  | "patch-legacy-reply"
  | "staking"
  | "token"
  | "voting";
