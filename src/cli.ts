#!/usr/bin/env node

import process, { emitWarning } from 'node:process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import chalk from 'chalk'
import { Command } from 'commander'
import { deployContract, deployContracts } from './lib/deploy'
import { ConfigManager } from './lib/config'
import type { BundleResult, DeployResult, Tag } from './types'
import { Logger } from './lib/logger'
import { BuildError, DeployError } from './lib/error'
import { loadAndBundleContracts } from './lib/loader'
import { clearBuildOutDir } from './lib/utils'

const PKG_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../')

process.emitWarning = (warning, ...args) => {
  if (args[0] === 'ExperimentalWarning') {
    return
  }

  if (args[0] && typeof args[0] === 'object' && args[0].type === 'ExperimentalWarning') {
    return
  }

  // @ts-expect-error "experimental warning"
  return emitWarning(warning, ...args)
}

function getPackageJson() {
  const packageJsonPath = path.join(PKG_ROOT, 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString())
  return packageJson
}

function parseToInt(value: string, defaultValue: number) {
  const parsedValue = Number.parseInt(value)
  if (Number.isNaN(parsedValue)) {
    return defaultValue
  }
  return parsedValue
}

function logDeploymentDetails(result: DeployResult) {
  const { messageId, processId, isNewProcess, configName } = result
  const processUrl = chalk.green(`https://ao_marton.g8way.io/#/process/${processId}`)
  const messageUrl = chalk.green(`${processUrl}/${messageId}`)
  const logger = Logger.init(configName)

  console.log('')
  if (isNewProcess) {
    logger.log(`Deployed Process: ${processUrl}`)
  }
  logger.log(`Deployment Message: ${messageUrl}`)
}

function logBundleDetails(result: BundleResult) {
  const { name, outDir, size, configName } = result
  const generated = chalk.green(`${name}.lua has been generated at ${outDir}`)
  const bundleSize = chalk.green(`Bundle size is bytes: ${size}`)
  const logger = Logger.init(configName)

  console.log('')

  logger.log(`Bundling Service: ${generated}`)
  logger.log(`Bundling Service: ${bundleSize}`)

  logger.log(`Bundling complete! ✨`)
}

const program = new Command()
const packageJson = getPackageJson()
program
  .name(packageJson.name)
  .description('Deploy AO contracts using a CLI.')
  .version(packageJson.version)
  .argument('<contractOrConfigPath>', 'Path to the main contract file or deployment configuration.')
  .option('-n, --name [name]', 'Specify the process name.', 'default')
  .option('-w, --wallet [wallet]', 'Path to the wallet JWK file.')
  .option('-l, --lua-path [luaPath]', 'Specify the Lua modules path seperated by semicolon.')
  .option('-d, --deploy [deploy]', 'List of deployment configuration names, separated by commas.')
  .option('-s, --scheduler [scheduler]', 'Scheduler to be used for the process.', '_GQ33BkPtZrqxA84vM8Zk-N2aO0toNNu_C-l-rawrBA')
  .option('-m, --module [module]', 'Module source for spawning the process.')
  .option('-c, --cron [interval]', 'Cron interval for the process (e.g. 1-minute, 5-minutes).')
  .option('-t, --tags [tags...]', 'Additional tags for spawning the process.')
  .option('-p, --process-id [processId]', 'Specify process Id of an existing process.')
  .option('--only-build', 'Only bundles modular ao process code into single bundle file and saves at provided location.')
  .option('--build-output [out path for bundle file]', 'Specify process Id of an existing process.')
  .option('--concurrency [limit]', 'Concurrency limit for deploying multiple processes.', '5')
  .option('--retry-count [count]', 'Number of retries for deploying contract.', '10')
  .option('--retry-delay [delay]', 'Delay between retries in milliseconds.', '3000')

program.parse(process.argv)

const options = program.opts()
const contractOrConfigPath = program.args[0]
const isContractPath = contractOrConfigPath.endsWith('.lua')
const isOnlyBuild = options.onlyBuild
const buildOutput = options.buildOutput || './process-dist'

async function deploymentHandler() {
  try {
    Logger.log(packageJson.name, 'Deploying...', false, true)
    if (isContractPath) {
      const tags: Tag[] = Array.isArray(options.tags)
        ? options.tags.reduce<Tag[]>((accumulator, tag) => {
          if (tag && tag.includes(':')) {
            const [name, value] = tag.split(':')
            accumulator.push({ name, value })
          }
          return accumulator
        }, [])
        : []

      const result = await deployContract(
        {
          name: options.name,
          wallet: options.wallet,
          contractPath: contractOrConfigPath,
          scheduler: options.scheduler,
          module: options.module,
          cron: options.cron,
          tags,
          retry: {
            count: parseToInt(options.retryCount, 10),
            delay: parseToInt(options.retryDelay, 3000),
          },
          luaPath: options.luaPath,
          configName: options.name,
          processId: options.processId,
        },
      )
      logDeploymentDetails(result)
    }
    else {
      const configManager = new ConfigManager(contractOrConfigPath)
      const deployConfigs = configManager.getDeployConfigs(options.deploy)
      const concurrency = parseToInt(options.concurrency, 5)

      const results = await deployContracts(deployConfigs, concurrency)
      results.forEach((result, idx) => {
        const configName = deployConfigs[idx].configName!
        if (result.status === 'fulfilled') {
          logDeploymentDetails(result.value)
        }
        else {
          Logger.error(configName, 'Failed to deploy contract!', true)
          Logger.error(configName, result.reason)
        }
      })
      const totalCount = results.length
      const successCount = results.filter(r => r.status === 'fulfilled').length
      Logger.log(packageJson.name, `Deployment Status: ${chalk.green(`${successCount}/${totalCount}`)} successful deployments.`, true)
    }
  }
  catch (error: any) {
    throw new DeployError(error?.message ?? 'Failed to deploy contract!')
  }
}

async function buildHandler() {
  try {
    await clearBuildOutDir(buildOutput)
    Logger.log(packageJson.name, 'Bundling...', false, true)

    const name = options.name || 'bundle'

    if (isContractPath) {
      const [result] = await loadAndBundleContracts([{ contractPath: contractOrConfigPath, name, outDir: buildOutput }], 1)

      if (result && result.status === 'fulfilled') {
        logBundleDetails(result.value)
      }
      else {
        Logger.error(name, 'Failed to bundle contract!', true)
        Logger.error(name, result.reason)
      }
    }
    else {
      const configManager = new ConfigManager(contractOrConfigPath)
      const deployConfigs = configManager.getDeployConfigs(options.deploy)
      const concurrency = parseToInt(options.concurrency, 5)

      const bundlingConfigs = deployConfigs.map(config => ({
        name: config.name || 'bundle',
        contractPath: config.contractPath,
        outDir: config.outDir || './dist',
      }))
      const results = await loadAndBundleContracts(bundlingConfigs, concurrency)

      results.forEach((result, idx) => {
        const configName = deployConfigs[idx].configName!

        if (result.status === 'fulfilled') {
          logBundleDetails(result.value)
        }
        else {
          Logger.error(configName, 'Failed to bundle contract!', true)
          Logger.error(configName, result.reason)
        }
      })

      const totalCount = bundlingConfigs.length
      const successCount = results.length
      Logger.log(packageJson.name, `Bundling Status: ${chalk.green(`${successCount}/${totalCount}`)} successful deployments.`, true)
    }
  }
  catch (error: any) {
    throw new BuildError(error?.message ?? 'Failed to bundle contract!')
  }
}

;(async () => {
  try {
    if (isOnlyBuild) {
      await buildHandler()
    }
    else {
      await deploymentHandler()
    }
  }
  catch (error: any) {
    const logger = Logger.init(packageJson.name)

    if (error instanceof DeployError) {
      logger.error(`Deployment failed!`, true)
    }
    if (error instanceof BuildError) {
      logger.error(`Build failed!`, true)
    }

    logger.error(error?.message)
    process.exit(1)
  }
})()
