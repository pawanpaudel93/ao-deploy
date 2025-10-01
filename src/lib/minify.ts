import { getUserPkgManager } from "./utils/utils.common";

let luamin: any;

async function getLuamin() {
  if (luamin) return luamin;
  try {
    // @ts-expect-error luamin is not typed
    luamin = await import("lua-format");
    return luamin;
  } catch {
    const pkgManager = getUserPkgManager();
    console.warn(
      `Warning: lua-format is not installed. Please install it using '${
        pkgManager === "npm"
          ? "npm install lua-format"
          : `${pkgManager} add lua-format`
      }'`
    );
    return null;
  }
}

const watermark = `--[[\n\tCode generated using github.com/Herrtt/luamin.js\n\tAn open source Lua beautifier and minifier.\n--]]\n\n`;

const settings = {
  RenameVariables: false,
  RenameGlobals: false,
  SolveMath: false,
  Indentation: "\t"
};

export async function minifyLuaCode(source: string) {
  const luamin = await getLuamin();
  if (!luamin) return source;

  const minified = luamin.Minify(source, settings);
  return minified.replace(watermark, "").trim();
}
