import { existsSync, mkdirSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export async function writeFileToProjectDir(
  data: string,
  outDir: string,
  fileName: string
) {
  try {
    const fullPath = path.join(process.cwd(), `${outDir}/${fileName}.lua`);
    const dirName = path.dirname(fullPath);
    if (!existsSync(dirName)) {
      mkdirSync(dirName);
    }
    await writeFile(fullPath, data);
  } catch {
    throw new Error(`Failed to write bundle to ${outDir}`);
  }
}

export async function clearBuildOutDir(outDir: string) {
  try {
    const fullPath = path.join(process.cwd(), `${outDir}`);
    const dirName = path.dirname(fullPath);

    if (!existsSync(dirName)) {
      return true;
    }

    rmSync(outDir, { recursive: true, force: true });
  } catch {
    throw new Error(`Failed to clear ${outDir}`);
  }
}
