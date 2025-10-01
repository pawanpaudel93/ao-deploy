/*
 * This file contains code derived from the aos codebase (c) 2024 Forward Research,
 * licensed under the Business Source License 1.1 until the Change Date, after which
 * it will transition to MPL 2.0.
 *
 * https://github.com/permaweb/aos/blob/main/LICENSE
 */

import chalk from "chalk";
import { exec } from "node:child_process";
import { constants, promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import util from "node:util";
import pLimit from "p-limit";
// @ts-expect-error types missing
import createFileTree from "pretty-file-tree";
import type { BundleResult, BundlingConfig, Module } from "../types";
import { Logger } from "./logger";
import { minifyLuaCode } from "./minify";
import {
  hasValidBlueprints,
  loadBlueprints,
  logActionStatus
} from "./utils/utils.common";
import { writeFileToProjectDir } from "./utils/utils.node";

const execAsync = util.promisify(exec);

export class LuaProjectLoader {
  #luaPath: string;
  #logger: Logger;

  constructor(name: string, luaPath?: string, silent: boolean = false) {
    this.#luaPath = luaPath || "";
    this.#logger = Logger.init(name, silent);
  }

  async #fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path, constants.F_OK | constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  async #getModulePath(module: string, cwd: string) {
    try {
      const modPath = path.join(cwd, `${module.replace(/\./g, "/")}.lua`);
      if (await this.#fileExists(modPath)) {
        return modPath;
      }

      const luaCode = `print(package.searchpath('${module}', package.path .. ';' .. '${this.#luaPath}'))`;
      const command = `lua -e "${luaCode}"`;

      const { stdout, stderr } = await execAsync(command);

      if (stderr) {
        return;
      }

      if (stdout) {
        const potentialPath = stdout.trim();
        if (await this.#fileExists(potentialPath)) {
          return potentialPath;
        }
      }
    } catch {
      /* empty */
    }
  }

  #createExecutableFromProject(project: Module[]) {
    const getModFnName = (name: string) =>
      name.replace(/\./g, "_").replace(/^_/, "");
    const contents: { name: string; path: string; code: string }[] = [];

    for (const mod of project) {
      const existing = contents.find((m) => m.path === mod.path);
      const moduleContent =
        (!existing &&
          `-- module: "${mod.name}"\nlocal function _loaded_mod_${getModFnName(mod.name)}()\n${mod.content}\nend\n`) ||
        "";
      const requireMapper = `\n_G.package.loaded["${mod.name}"] = _loaded_mod_${getModFnName(existing?.name || mod.name)}()`;

      contents.push({
        name: mod.name,
        path: mod.path,
        code: moduleContent + requireMapper
      });
    }

    return contents.reduce((acc, con) => `${acc}\n\n${con.code}`, "");
  }

  #topologicalSort(moduleMap: Map<string, Module>) {
    const visited = new Set<string>();
    const result: Module[] = [];

    function visit(modName: string) {
      if (visited.has(modName)) {
        return;
      }

      const mod = moduleMap.get(modName);
      if (!mod) {
        throw new Error(`Module ${modName} is not found in the module map.`);
      }

      visited.add(modName);
      mod.dependencies?.forEach((depName) => visit(depName));
      result.push(mod);
    }

    moduleMap.forEach((_, modName) => visit(modName));

    return result;
  }

  async #createProjectStructure(mainFile: string, cwd: string) {
    // initial set of modules
    const modules = await this.#findRequires(mainFile, cwd);
    // Create a map for quick access
    const moduleMap: Map<string, Module> = new Map(
      modules.map((m) => [m.name, m])
    );

    // Load and parse content for each module, and resolve dependencies
    for (const [, mod] of moduleMap) {
      if (!mod.content) {
        const fileContent = await fs.readFile(mod.path, "utf-8");
        mod.content = fileContent
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n");
        const requiresInMod = await this.#findRequires(mod.content!, cwd);

        for (const requirement of requiresInMod) {
          if (!moduleMap.has(requirement.name)) {
            moduleMap.set(requirement.name, requirement);
          }
          mod.dependencies = (mod.dependencies || new Set()).add(
            requirement.name
          );
        }
      }
    }

    // Perform a topological sort based on dependencies
    const sortedModules = this.#topologicalSort(moduleMap);

    // Filter out modules without content (if any)
    return sortedModules.filter((mod) => mod.content);
  }

  async #findRequires(data: string, cwd: string): Promise<Module[]> {
    const requirePattern = /(?<=(require( *)(\n*)(\()?( *)("|'))).*(?=("|'))/g;
    const requiredModules = (data.match(requirePattern) || []).map(
      async (mod) => {
        const modPath = await this.#getModulePath(mod, cwd);

        return modPath
          ? { name: mod, path: modPath, content: undefined }
          : null;
      }
    );

    return (await Promise.all(requiredModules)).filter((m) => !!m) as Module[];
  }

  async loadContract(contractPath: string) {
    if (/\.lua$/.test(contractPath)) {
      let filePath = contractPath;
      if (!path.isAbsolute(filePath)) {
        filePath = path.resolve(path.join(process.cwd(), contractPath));
      }

      if (!(await this.#fileExists(filePath))) {
        throw new Error(chalk.red(`${filePath} file not found.`));
      }

      this.#logger.log(`Loading: ${contractPath}`, false, true);
      let line = await fs.readFile(filePath, "utf-8");

      this.#logger.log(`Parsing contract structure...`, false, true);

      const projectStructure = await this.#createProjectStructure(
        line,
        path.dirname(filePath)
      );
      if (projectStructure.length > 0) {
        line = `${this.#createExecutableFromProject(projectStructure)}\n\n${line}`;

        this.#logger.log(
          chalk.yellow(`The following files will be loaded:`),
          false,
          true
        );
        if (!this.#logger.silent) {
          console.log(
            chalk.dim(
              createFileTree([
                ...projectStructure.map((m) => m.path),
                `${filePath} ${chalk.reset(chalk.bgGreen(" MAIN "))}`
              ])
            )
          );
          console.log("");
        }
      }

      return line.trim();
    } else {
      throw new Error(chalk.red("A `*.lua` file is required."));
    }
  }

  async loadAndBundleContract(config: BundlingConfig): Promise<BundleResult> {
    try {
      logActionStatus(
        "bundle",
        this.#logger,
        config.contractPath,
        config.blueprints
      );

      let contractSrc = "";
      let blueprintsSrc = "";

      if (!config.contractPath && !hasValidBlueprints(config.blueprints)) {
        throw new Error(
          "Please provide either a valid contract path or blueprints."
        );
      }

      if (config.contractPath) {
        contractSrc = await this.loadContract(config.contractPath);
      }

      if (config.blueprints && config.blueprints.length > 0) {
        blueprintsSrc = await loadBlueprints(config.blueprints);
      }

      if (contractSrc || blueprintsSrc) {
        contractSrc = [blueprintsSrc, contractSrc]
          .filter(Boolean)
          .join("\n\n")
          .trim();
      }

      if (
        config.contractTransformer &&
        typeof config.contractTransformer === "function"
      ) {
        this.#logger.log("Transforming contract...", false, false);
        contractSrc = await config.contractTransformer(contractSrc);
      }

      if (config.minify) {
        this.#logger.log("Minifying contract...", false, false);
        contractSrc = await this.minifyContract(contractSrc);
      }

      await writeFileToProjectDir(contractSrc, config.outDir, config.name);

      return {
        configName: config.name,
        outDir: config.outDir,
        size: new TextEncoder().encode(contractSrc).length,
        name: config.name
      };
    } catch {
      throw new Error(
        chalk.red(
          `Failed to load and bundle contract at: ${config.contractPath}`
        )
      );
    }
  }

  async minifyContract(source: string): Promise<string> {
    return minifyLuaCode(source);
  }
}

export async function loadAndBundleContracts(
  configs: BundlingConfig[],
  concurrency: number = 5
): Promise<PromiseSettledResult<BundleResult>[]> {
  const limit = pLimit(concurrency);
  const promises = configs.map((config) =>
    limit(() => {
      const loader = new LuaProjectLoader(config.name, config.luaPath);

      return loader.loadAndBundleContract(config);
    })
  );

  return await Promise.allSettled(promises);
}
