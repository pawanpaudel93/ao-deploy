// https://github.com/permaweb/aos/blob/main/src/services/loading-files.js#L30

import path from 'node:path'
import fs from 'node:fs'
import process from 'node:process'
import createFileTree from 'pretty-file-tree'
import chalk from 'chalk'
import ora from 'ora'

interface Module { name: string, path: string, content?: string }

export function createExecutableFromProject(project: Module[]) {
  const getModFnName = (name: string) => name.replace(/\./g, '_').replace(/^_/, '')
  const contents: { name: string, path: string, code: string }[] = []

  // filter out repeated modules with different import names
  // and construct the executable Lua code
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

/**
 * Create the project structure from the main file's content
 */
export function createProjectStructure(mainFile: string, cwd: string) {
  const modules = findRequires(mainFile, cwd)
  let orderedModNames = modules.map(m => m.name)

  for (let i = 0; i < modules.length; i++) {
    if (modules[i].content || !fs.existsSync(modules[i].path))
      continue

    modules[i].content = fs.readFileSync(modules[i].path, 'utf-8')
      .split('\n')
      .map(v => `  ${v}`)
      .join('\n')

    const requiresInMod = findRequires(modules[i].content, cwd)

    requiresInMod.forEach((mod) => {
      const existingMod = modules.find(m => m.name === mod.name)
      if (!existingMod)
        modules.push(mod)

      const existingName = orderedModNames.find(name => name === mod.name)
      if (existingName)
        orderedModNames = orderedModNames.filter(name => name !== existingName)

      orderedModNames.push(existingName || mod.name)
    })
  }

  // Create an ordered array of modules,
  // we use this loop to reverse the order,
  // because the last modules are the first
  // ones that need to be imported
  // only add modules that were found
  // if the module was not found, we assume it
  // is already loaded into aos
  const orderedModules = []
  for (let i = orderedModNames.length; i > 0; i--) {
    const mod = modules.find(m => m.name === orderedModNames[i - 1])
    if (mod && mod.content)
      orderedModules.push(mod)
  }

  return orderedModules
}

function findRequires(data: string, cwd: string) {
  const requirePattern = /(?<=(require( *)(\n*)(\()?( *)("|'))).*(?=("|'))/g
  const requiredModules = data.match(requirePattern)?.map(
    mod => ({
      name: mod,
      path: path.join(cwd, `${mod.replace(/\./g, '/')}.lua`),
      content: undefined,
    }),
  ) || []

  return requiredModules
}

export function loadContract(contractPath: string) {
  if (/\.lua$/.test(contractPath)) {
    let filePath = contractPath
    if (!path.isAbsolute(filePath))
      filePath = path.resolve(path.join(process.cwd(), contractPath))

    if (!fs.existsSync(filePath))
      throw new Error(chalk.red('ERROR: file not found.'))

    console.log(chalk.green('Loading... ', contractPath))
    let line = fs.readFileSync(filePath, 'utf-8')

    const spinner = ora({
      spinner: 'dots',
      suffixText: ``,
      discardStdin: false,
    })
    spinner.start()
    spinner.suffixText = chalk.gray('Parsing project structure...')
    const projectStructure = createProjectStructure(
      line,
      path.dirname(filePath),
    )
    if (projectStructure.length > 0)
      line = `${createExecutableFromProject(projectStructure)}\n\n${line}`

    spinner.stop()

    if (projectStructure.length > 0) {
      console.log(chalk.yellow('\nThe following files will be deployed:'))
      console.log(
        chalk.dim(
          createFileTree([
            ...projectStructure.map(m => m.path),
            `${filePath} ${chalk.reset(chalk.bgGreen(' MAIN '))}`,
          ]),
        ),
      )
    }

    return line
  }
  else {
    throw new Error(chalk.red('ERROR: .load function requires a *.lua file'))
  }
}
