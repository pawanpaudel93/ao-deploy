import fs from "fs/promises";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { LuaProjectLoader } from "../src/lib/loader";

describe("LuaProjectLoader", () => {
  let loader: LuaProjectLoader;

  beforeEach(() => {
    loader = new LuaProjectLoader("test", undefined, true);
  });

  afterAll(async () => {
    await fs.unlink("test/dist/test.lua");
  });

  it("should load and bundle a contract", async () => {
    const result = await loader.loadAndBundleContract({
      name: "test",
      contractPath: "test/fixtures/sample.lua",
      outDir: "test/dist"
    });

    expect(result).toBeDefined();
    expect(result.size).toBeGreaterThan(0);
    expect(result.name).toBe("test");
  });

  it("should load blueprints", async () => {
    const result = await loader.loadAndBundleContract({
      name: "test",
      blueprints: ["token"],
      outDir: "test/dist"
    });

    expect(result).toBeDefined();
    expect(result.size).toBeGreaterThan(0);
  });

  it("should minify contract when specified", async () => {
    const normalResult = await loader.loadAndBundleContract({
      name: "test",
      contractPath: "test/fixtures/sample.lua",
      outDir: "test/dist"
    });

    const minifiedResult = await loader.loadAndBundleContract({
      name: "test",
      contractPath: "test/fixtures/sample.lua",
      outDir: "test/dist",
      minify: true
    });

    expect(minifiedResult.size).toBeLessThan(normalResult.size);
  });
});
