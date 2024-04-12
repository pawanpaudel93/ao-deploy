/*
 * This file contains code derived from the aos codebase (c) 2024 Forward Research,
 * licensed under the Business Source License 1.1 until the Change Date, after which
 * it will transition to MPL 2.0.
 *
 * https://github.com/permaweb/aos/blob/main/LICENSE
 */

import path from 'node:path'
import { constants, promises as fs } from 'node:fs'
import process from 'node:process'
import { exec } from 'node:child_process'
import util from 'node:util'

// @ts-expect-error types missing
import createFileTree from 'pretty-file-tree'
import chalk from 'chalk'
import ora from 'ora'

const execAsync = util.promisify(exec)

interface Module { name: string, path: string, content?: string, dependencies?: Set<string> }

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path, constants.F_OK | constants.R_OK)
    return true
  }
  catch {
    return false
  }
}

async function getModulePath(module: string, cwd: string) {
  try {
    const modPath = path.join(cwd, `${module.replace(/\./g, '/')}.lua`)
    if (await fileExists(modPath))
      return modPath

    const luaCode = `print(package.searchpath('${module}', package.path))`
    const command = `lua -e "${luaCode}"`

    const { stdout, stderr } = await execAsync(command)

    if (stderr)
      return

    if (stdout) {
      const potentialPath = stdout.trim()
      if (await fileExists(potentialPath))
        return potentialPath
    }
  }
  catch (error) {}
}

export function createExecutableFromProject(project: Module[]) {
  const getModFnName = (name: string) => name.replace(/\./g, '_').replace(/^_/, '')
  const contents: { name: string, path: string, code: string }[] = []

  for (const mod of project) {
    const existing = contents.find(m => m.path === mod.path)
    const moduleContent = (!existing && `-- module: "${mod.name}"\nlocal function _loaded_mod_${getModFnName(mod.name)}()\n${mod.content}\nend\n`) || ''
    const requireMapper = `\n_G.package.loaded["${mod.name}"] = _loaded_mod_${getModFnName(existing?.name || mod.name)}()`

    contents.push({
      name: mod.name,
      path: mod.path,
      code: moduleContent + requireMapper,
    })
  }

  return contents.reduce((acc, con) => `${acc}\n\n${con.code}`, '')
}

function topologicalSort(moduleMap: Map<string, Module>) {
  const visited = new Set<string>()
  const result: Module[] = []

  function visit(modName: string) {
    if (visited.has(modName))
      return

    const mod = moduleMap.get(modName)
    if (!mod)
      throw new Error(`Module ${modName} is not found in the module map.`)

    visited.add(modName)
    mod.dependencies?.forEach(depName => visit(depName))
    result.push(mod)
  }

  moduleMap.forEach((_, modName) => visit(modName))

  return result
}

export async function createProjectStructure(mainFile: string, cwd: string) {
  // initial set of modules
  const modules = await findRequires(mainFile, cwd)
  // Create a map for quick access
  const moduleMap: Map<string, Module> = new Map(modules.map(m => [m.name, m]))

  // Load and parse content for each module, and resolve dependencies
  for (const [_, mod] of moduleMap) {
    if (!mod.content) {
      const fileContent = await fs.readFile(mod.path, 'utf-8')
      mod.content = fileContent.split('\n').map(line => `  ${line}`).join('\n')
      const requiresInMod = await findRequires(mod.content!, cwd)

      for (const requirement of requiresInMod) {
        if (!moduleMap.has(requirement.name))
          moduleMap.set(requirement.name, requirement)
        mod.dependencies = (mod.dependencies || new Set()).add(requirement.name)
      }
    }
  }

  // Perform a topological sort based on dependencies
  const sortedModules = topologicalSort(moduleMap)

  // Filter out modules without content (if any)
  return sortedModules.filter(mod => mod.content)
}

async function findRequires(data: string, cwd: string): Promise<Module[]> {
  const requirePattern = /(?<=(require( *)(\n*)(\()?( *)("|'))).*(?=("|'))/g
  const requiredModules = (data.match(requirePattern) || []).map(async (mod) => {
    const modPath = await getModulePath(mod, cwd)

    return modPath
      ? {
          name: mod,
          path: modPath,
          content: undefined,
        }
      : null
  })

  return (await Promise.all(requiredModules)).filter(m => !!m) as Module[]
}

export async function loadContract(contractPath: string) {
  if (/\.lua$/.test(contractPath)) {
    let filePath = contractPath
    if (!path.isAbsolute(filePath))
      filePath = path.resolve(path.join(process.cwd(), contractPath))

    if (!(await fileExists(filePath)))
      throw new Error(chalk.red(`ERROR: ${filePath} file not found.`))

    console.log(chalk.green('Deploying: ', contractPath))
    let line = await fs.readFile(filePath, 'utf-8')

    const spinner = ora({
      spinner: 'dots',
      suffixText: ``,
      discardStdin: false,
    }).start()
    spinner.suffixText = chalk.gray('Parsing project structure...')
    const projectStructure = await createProjectStructure(line, path.dirname(filePath))
    if (projectStructure.length > 0)
      line = `${createExecutableFromProject(projectStructure)}\n\n${line}`

    spinner.stop()

    if (projectStructure.length > 0) {
      console.log(chalk.yellow('\nThe following files will be deployed:'))
      console.log(chalk.dim(createFileTree([...projectStructure.map(m => m.path), `${filePath} ${chalk.reset(chalk.bgGreen(' MAIN '))}`])))
    }

    return line
  }
  else {
    throw new Error(chalk.red('It requires a *.lua file'))
  }
}
