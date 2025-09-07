import createJITI from "jiti";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { Config, DeployConfig } from "../types";
import { defaultLogger } from "./logger";
import {
  hasValidBlueprints,
  isArweaveAddress,
  isCronPattern,
  isLuaFile,
  isUrl,
  jsonStringify
} from "./utils/utils.common";
import { Wallet } from "./wallet/wallet.node";

const __filename = fileURLToPath(import.meta.url);
const jiti = createJITI(__filename);

export class ConfigManager {
  #config: Config = {};

  constructor(configPath: string) {
    this.#loadConfig(configPath);
  }

  #loadConfig(configPath: string) {
    try {
      const fullPath = path.join(process.cwd(), configPath);
      const loadedConfig = jiti(fullPath);
      const config = loadedConfig.default ?? loadedConfig;

      if (!ConfigManager.isValidConfig(config)) {
        throw new Error("Invalid config file.");
      }

      this.#config = config;
    } catch (error: any) {
      defaultLogger.error(error);
      throw new Error(
        "Failed to load a valid config file. Please check the logs for more details."
      );
    }
  }

  static #isNonEmptyString(value: any): boolean {
    return typeof value === "string" && value.length > 0;
  }

  static #isString(value: any): boolean {
    return typeof value === "string";
  }

  static #validateTags(tags: DeployConfig["tags"], keyName: string): boolean {
    const isValid =
      tags === undefined ||
      (Array.isArray(tags) && tags.length === 0) ||
      (Array.isArray(tags) &&
        tags.every(
          (tag) =>
            tag &&
            typeof tag === "object" &&
            this.#isNonEmptyString(tag.name) &&
            this.#isNonEmptyString(tag.value)
        ));

    if (!isValid) {
      throw new Error(
        `Invalid tags configuration for "${keyName}": \n${jsonStringify(tags)}`
      );
    }

    return true;
  }

  static #validateRetry(
    retry: DeployConfig["retry"],
    keyName: string
  ): boolean {
    const isValid =
      retry === undefined ||
      (typeof retry === "object" &&
        (retry.count === undefined ||
          (typeof retry.count === "number" && retry.count >= 0)) &&
        (retry.delay === undefined ||
          (typeof retry.delay === "number" && retry.delay >= 0)));

    if (!isValid) {
      throw new Error(
        `Invalid retry configuration for "${keyName}": \n${jsonStringify(retry)}`
      );
    }

    return true;
  }

  static #validateServices(
    services: DeployConfig["services"],
    keyName: string
  ): boolean {
    const isValid =
      services === undefined ||
      (typeof services === "object" &&
        (services.gatewayUrl === undefined || isUrl(services?.gatewayUrl)) &&
        (services.cuUrl === undefined || isUrl(services?.cuUrl)) &&
        (services.muUrl === undefined || isUrl(services?.muUrl)));

    if (!isValid) {
      throw new Error(
        `Invalid services configuration for "${keyName}": \n${jsonStringify(services)}`
      );
    }

    return true;
  }

  static #validateOptionalProps(
    deployConfig: DeployConfig,
    keyName: string
  ): void {
    const optionalAddressProps: (keyof DeployConfig)[] = [
      "module",
      "scheduler",
      "processId"
    ];
    const optionalStringProps: (keyof DeployConfig)[] = [
      "name",
      "configName",
      "luaPath",
      "outDir"
    ];
    const optionalBooleanProps: (keyof DeployConfig)[] = [
      "sqlite",
      "silent",
      "minify",
      "onBoot"
    ];

    optionalAddressProps.forEach((prop) => {
      if (deployConfig[prop] && !isArweaveAddress(deployConfig[prop])) {
        throw new Error(
          `Invalid "${prop}" value in configuration for "${keyName}": ${jsonStringify(deployConfig[prop])}`
        );
      }
    });

    optionalStringProps.forEach((prop) => {
      if (deployConfig[prop] && !this.#isString(deployConfig[prop])) {
        throw new Error(
          `Invalid "${prop}" value in configuration for "${keyName}": ${jsonStringify(deployConfig[prop])}`
        );
      }
    });

    optionalBooleanProps.forEach((prop) => {
      if (
        deployConfig[prop] !== undefined &&
        typeof deployConfig[prop] !== "boolean"
      ) {
        throw new Error(
          `Invalid "${prop}" value in configuration for "${keyName}": ${jsonStringify(deployConfig[prop])}`
        );
      }
    });

    // Special handling for wallet which can be either a string or a JWK
    if (
      deployConfig.wallet &&
      !this.#isString(deployConfig.wallet) &&
      !Wallet.isJwk(deployConfig.wallet)
    ) {
      throw new Error(
        `Invalid "wallet" value in configuration for "${keyName}": ${jsonStringify(deployConfig.wallet)}`
      );
    }
  }

  static isValidConfig(config: Config): boolean {
    // Check if config exists, is an object, and is not empty
    if (
      !config ||
      typeof config !== "object" ||
      Object.keys(config).length === 0
    ) {
      throw new Error("Config is missing or invalid.");
    }

    // Check if every entry in the object values has a 'contractPath'
    return Object.entries(config).every(([name, deployConfig]) => {
      if (
        !deployConfig ||
        typeof deployConfig !== "object" ||
        Object.keys(deployConfig).length === 0
      ) {
        throw new Error(
          `Invalid configuration for "${name}": \n${jsonStringify(deployConfig)}`
        );
      }

      if (deployConfig.contractPath && !isLuaFile(deployConfig.contractPath)) {
        throw new Error(
          `A "*.lua" file is required for "contractPath" in configuration for "${name}".`
        );
      }

      if (
        deployConfig.blueprints &&
        !hasValidBlueprints(deployConfig.blueprints)
      ) {
        throw new Error(
          `Invalid "blueprints" value in configuration for "${name}": ${jsonStringify(deployConfig.blueprints)}`
        );
      }

      if (!deployConfig.blueprints && !deployConfig.contractPath) {
        throw new Error(
          `"contractPath" or "blueprints" is required in configuration for "${name}".`
        );
      }

      this.#validateOptionalProps(deployConfig, name);
      this.#validateTags(deployConfig.tags, name);
      this.#validateRetry(deployConfig.retry, name);
      this.#validateServices(deployConfig.services, name);

      if (deployConfig.cron && !isCronPattern(deployConfig.cron)) {
        throw new Error(
          `Invalid "cron" value in configuration for "${name}": ${jsonStringify(deployConfig.cron)}`
        );
      }

      if (
        deployConfig.contractTransformer !== undefined &&
        typeof deployConfig.contractTransformer !== "function"
      ) {
        throw new Error(
          `Invalid "contractTransformer" value in configuration for "${name}": ${jsonStringify(deployConfig.contractTransformer)}`
        );
      }

      return true;
    });
  }

  getConfig() {
    return this.#config;
  }

  getConfigFromNames(keys: string[]) {
    if (keys.length === 0) {
      return this.#config;
    }

    return Object.fromEntries(
      Object.entries(this.#config).filter(([key]) => keys.includes(key))
    );
  }

  getDeployConfigs(deploy: string) {
    const configNames = (deploy ?? "")
      .split(",")
      .map((name: string) => name.trim())
      .filter(Boolean);
    const config = this.getConfigFromNames(configNames);

    if (Object.keys(config).length === 0) {
      throw new Error(
        `No matching configurations found for "${deploy}". Please verify the configuration names.`
      );
    }

    return Object.entries(config).map(([name, config]) => ({
      ...config,
      configName: name
    }));
  }
}

/**
 * Defines and validates a configuration object.
 * @param config The configuration object to validate.
 * @returns The validated configuration object.
 * @throws Error if the configuration object is invalid.
 */
export function defineConfig(config: Config) {
  if (!ConfigManager.isValidConfig(config)) {
    throw new Error(
      "Invalid config file loaded. Please check the logs for more details."
    );
  }

  return config;
}
