import { describe, expect, it } from "vitest";
import {
  hasValidBlueprints,
  isCronPattern,
  isLuaFile,
  isUrl,
  parseToInt
} from "../src/lib/utils";

describe("Utils", () => {
  describe("isLuaFile", () => {
    it("should validate lua files", () => {
      expect(isLuaFile("test.lua")).toBe(true);
      expect(isLuaFile("test.txt")).toBe(false);
    });
  });

  describe("isUrl", () => {
    it("should validate URLs", () => {
      expect(isUrl("http://localhost:4000")).toBe(true);
      expect(isUrl("invalid")).toBe(false);
    });
  });

  describe("isCronPattern", () => {
    it("should validate cron patterns", () => {
      expect(isCronPattern("5-minutes")).toBe(true);
      expect(isCronPattern("invalid")).toBe(false);
    });
  });

  describe("parseToInt", () => {
    it("should parse integers with fallback", () => {
      expect(parseToInt("123", 10)).toBe(123);
      expect(parseToInt("invalid", 10)).toBe(10);
    });
  });

  describe("hasValidBlueprints", () => {
    it("should validate blueprint arrays", () => {
      expect(hasValidBlueprints(["token"])).toBe(true);
      expect(hasValidBlueprints([])).toBe(false);
      expect(hasValidBlueprints(undefined)).toBe(false);
    });
  });
});
