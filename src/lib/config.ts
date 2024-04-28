import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import createJITI from 'jiti'
import type { Config } from '../types'

const __filename = fileURLToPath(import.meta.url)

const jiti = createJITI(__filename)

export class ConfigManager {
  #config: Config = {}

  constructor(configPath: string) {
    const loadedConfig = this.#load(configPath)
    if (ConfigManager.isValidConfig(loadedConfig))
      this.#config = loadedConfig
    else
      throw new Error('Invalid config file loaded.')
  }

  #load(configPath: string) {
    const fullPath = path.join(process.cwd(), configPath)
    const configs = jiti(fullPath)
    return configs.default ?? configs
  }

  static isValidConfig(config: Config): boolean {
    // Check if config exists, is an object, and is not empty
    if (!config || typeof config !== 'object' || Object.keys(config).length === 0)
      return false

    // Check if every entry in the object values has a 'contractPath'
    return Object.values(config).every(value => value && 'contractPath' in value && 'name' in value)
  }

  getConfig() {
    return this.#config
  }

  getConfigFromNames(keys: string[]) {
    if (keys.length === 0)
      return this.#config

    return Object.fromEntries(Object.entries(this.#config).filter(([key, _]) => keys.includes(key)))
  }

  getDeployConfigs(deploy: string) {
    const configNames = (deploy ?? '').split(',').map((name: string) => name.trim()).filter(Boolean)
    const config = this.getConfigFromNames(configNames)
    if (Object.keys(config).length === 0)
      throw new Error(`Config file doesn't have names from ${deploy}`)
    const deployConfigs = Object.entries(config).map(([name, config]) => ({ ...config, configName: name }))
    return deployConfigs
  }
}

export function defineConfig(config: Config) {
  if (!ConfigManager.isValidConfig(config))
    throw new Error('Invalid config file loaded.')
  return config
}
