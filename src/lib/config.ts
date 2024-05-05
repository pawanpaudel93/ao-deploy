import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import createJITI from 'jiti'
import type { Config, DeployConfig } from '../types'

const __filename = fileURLToPath(import.meta.url)

const jiti = createJITI(__filename)

export class ConfigManager {
  #config: Config = {}

  constructor(configPath: string) {
    const loadedConfig = this.#load(configPath)
    if (ConfigManager.isValidConfig(loadedConfig)) {
      this.#config = loadedConfig
    }
    else {
      throw new Error('Invalid config file loaded.')
    }
  }

  #load(configPath: string) {
    const fullPath = path.join(process.cwd(), configPath)
    const configs = jiti(fullPath)
    return configs.default ?? configs
  }

  static #isNonEmptyString(value: any): boolean {
    return typeof value === 'string' && value.length > 0
  }

  static #isString(value: any): boolean {
    return typeof value === 'string'
  }

  static #validateTags(tags?: DeployConfig['tags']): boolean {
    return tags === undefined || (Array.isArray(tags) && tags.length === 0) || (Array.isArray(tags) && tags.every(tag =>
      tag && typeof tag === 'object' && this.#isNonEmptyString(tag.name) && this.#isNonEmptyString(tag.value),
    ))
  }

  static #validateRetry(retry?: DeployConfig['retry']): boolean {
    return retry === undefined || (
      typeof retry === 'object'
      && (retry.count === undefined || (typeof retry.count === 'number' && retry.count >= 0))
      && (retry.delay === undefined || (typeof retry.delay === 'number' && retry.delay >= 0))
    )
  }

  static isValidConfig(config: Config): boolean {
    // Check if config exists, is an object, and is not empty
    if (!config || typeof config !== 'object' || Object.keys(config).length === 0) {
      return false
    }

    // Check if every entry in the object values has a 'contractPath'
    return Object.values(config).every((deployConfig) => {
      if (!deployConfig || typeof deployConfig !== 'object') {
        return false
      }

      const requiredStringProps: (keyof DeployConfig)[] = ['contractPath', 'name']
      const optionalStringProps: (keyof DeployConfig)[] = ['module', 'scheduler', 'cron', 'luaPath', 'wallet', 'configName', 'processId']

      const hasRequiredStrings = requiredStringProps.every(prop => this.#isNonEmptyString(deployConfig[prop]))
      const hasOptionalStrings = optionalStringProps.every(prop => !deployConfig[prop] || this.#isString(deployConfig[prop]))

      const tagsValid = this.#validateTags(deployConfig.tags)
      const retryValid = this.#validateRetry(deployConfig.retry)

      return hasRequiredStrings && hasOptionalStrings && tagsValid && retryValid
    })
  }

  getConfig() {
    return this.#config
  }

  getConfigFromNames(keys: string[]) {
    if (keys.length === 0) {
      return this.#config
    }

    return Object.fromEntries(Object.entries(this.#config).filter(([key, _]) => keys.includes(key)))
  }

  getDeployConfigs(deploy: string) {
    const configNames = (deploy ?? '').split(',').map((name: string) => name.trim()).filter(Boolean)
    const config = this.getConfigFromNames(configNames)
    if (Object.keys(config).length === 0) {
      throw new Error(`Config file doesn't have names from ${deploy}`)
    }
    const deployConfigs = Object.entries(config).map(([name, config]) => ({ ...config, configName: name }))
    return deployConfigs
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
    throw new Error('Invalid config file loaded.')
  }
  return config
}
