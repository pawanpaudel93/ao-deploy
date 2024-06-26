#!/usr/bin/env node

import process, { emitWarning } from 'node:process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import chalk from 'chalk'
import { Command } from 'commander'
import { deployContract, deployContracts } from './lib/deploy'
import { ConfigManager } from './lib/config'
import type { DeployResult, Tag } from './types'
import { Logger } from './lib/logger'

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
  .option('--concurrency [limit]', 'Concurrency limit for deploying multiple processes.', '5')
  .option('--retry-count [count]', 'Number of retries for deploying contract.', '10')
  .option('--retry-delay [delay]', 'Delay between retries in milliseconds.', '3000')

program.parse(process.argv)

const options = program.opts()
const contractOrConfigPath = program.args[0]

;(async () => {
  try {
    Logger.log(packageJson.name, 'Deploying...', false, true)
    if (contractOrConfigPath.endsWith('.lua')) {
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
    const logger = Logger.init(packageJson.name)
    logger.error(`Deployment failed!`, true)
    logger.error(error?.message ?? 'Failed to deploy contract!')
    process.exit(1)
  }
})()
