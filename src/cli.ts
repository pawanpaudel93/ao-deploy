#!/usr/bin/env node

import process from 'node:process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import chalk from 'chalk'
import { Command } from 'commander'
import { deployContract } from './lib/deploy'

const PKG_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../')

export function getVersion() {
  const packageJsonPath = path.join(PKG_ROOT, 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString())
  return packageJson.version || '1.0.0'
}

const program = new Command()
program
  .name('ao-deploy')
  .description('A CLI tool to deploy AO contracts')
  .version(getVersion())
  .argument('<contractPath>', 'Contract main file path to deploy')
  .option('-n, --name [name]', 'Name of contract to deploy', 'default')
  .option('-w, --wallet-path [walletPath]', 'Wallet JWK file path')

program.parse(process.argv)

const options = program.opts()
const contractPath = program.args[0]

async function main() {
  try {
    console.log(chalk.gray('Deploying...\n'))
    const { messageId, processId } = await deployContract({ name: options.name, walletPath: options.walletPath, contractPath })
    const processUrl = `https://ao_marton.g8way.io/#/process/${processId}`
    console.log(chalk.green(`\nDeployed Process: ${processUrl} \nDeployment Message: ${processUrl}/${messageId}`))
  }
  catch (error: any) {
    console.log(chalk.red('\nDeploy failed!\n'))
    console.log(chalk.red(error?.message ?? 'Failed to deploy contract!'))
  }
}

main()
