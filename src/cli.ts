#!/usr/bin/env node

import process, { emitWarning } from 'node:process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import chalk from 'chalk'
import { Command } from 'commander'
import { type Tag, deployContract } from './lib/deploy'

const PKG_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../')

process.emitWarning = (warning, ...args) => {
  if (args[0] === 'ExperimentalWarning')
    return

  if (args[0] && typeof args[0] === 'object' && args[0].type === 'ExperimentalWarning')
    return

  // @ts-expect-error "experimental warning"
  return emitWarning(warning, ...args)
}

function getVersion() {
  const packageJsonPath = path.join(PKG_ROOT, 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString())
  return packageJson.version || '1.0.0'
}

function parseToInt(value: string, defaultValue: number) {
  const parsedValue = Number.parseInt(value)
  if (Number.isNaN(parsedValue))
    return defaultValue
  return parsedValue
}

const program = new Command()
program
  .name('ao-deploy')
  .description('A CLI tool to deploy AO contracts')
  .version(getVersion())
  .argument('<contractPath>', 'Contract main file path to deploy')
  .option('-n, --name [name]', 'Name of the process to spawn', 'default')
  .option('-w, --wallet [wallet]', 'Wallet JWK file path')
  .option('-s, --scheduler [scheduler]', 'Scheduler to use for Process', '_GQ33BkPtZrqxA84vM8Zk-N2aO0toNNu_C-l-rawrBA')
  .option('-m, --module [module]', 'The module source to use to spin up Process')
  .option('-c, --cron [interval]', 'Cron interval to use for Process i.e (1-minute, 5-minutes)')
  .option('-t, --tags [tags...]', 'Additional tags to use when spawning Process')
  .option('--retry-count [count]', 'Retry count to spawn Process', '10')
  .option('--retry-delay [delay]', 'Retry delay in seconds', '3000')

program.parse(process.argv)

const options = program.opts()
const contractPath = program.args[0]

async function main() {
  try {
    console.log(chalk.gray('Deploying...\n'))
    const tags: Tag[] = Array.isArray(options.tags)
      ? options.tags.reduce<Tag[]>((accumulator, tag) => {
        if (tag && tag.includes(':')) {
          const [name, value] = tag.split(':')
          accumulator.push({ name, value })
        }
        return accumulator
      }, [])
      : []
    const { messageId, processId } = await deployContract(
      {
        name: options.name,
        wallet: options.wallet,
        contractPath,
        scheduler: options.scheduler,
        module: options.module,
        cron: options.cron,
        tags,
        retry: {
          count: parseToInt(options.retryCount, 10),
          delay: parseToInt(options.retryDelay, 3000),
        },
      },
    )
    const processUrl = chalk.green(`https://ao_marton.g8way.io/#/process/${processId}`)
    const messageUrl = chalk.green(`${processUrl}/${messageId}`)
    console.log(`\nDeployed Process: ${processUrl} \nDeployment Message: ${messageUrl}`)
  }
  catch (error: any) {
    console.log(chalk.red('\nDeployment failed!\n'))
    console.log(chalk.red(error?.message ?? 'Failed to deploy contract!'))
    process.exit(1)
  }
}

main()
