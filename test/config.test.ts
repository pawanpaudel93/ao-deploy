import { describe, expect, it } from "vitest";
import { ConfigManager } from "../src/lib/config";

describe("ConfigManager", () => {
  it("should validate a correct config", () => {
    const validConfig = {
      test: {
        name: "test-contract",
        contractPath: "contract.lua",
        wallet: "./wallet.json"
      }
    };
    expect(() => ConfigManager.isValidConfig(validConfig)).not.toThrow();
  });

  it("should validate blueprints config", () => {
    const validConfig = {
      test: {
        name: "test-contract",
        blueprints: ["token" as const],
        wallet: "./wallet.json"
      }
    };
    expect(() => ConfigManager.isValidConfig(validConfig)).not.toThrow();
  });

  it("should reject invalid config", () => {
    const invalidConfig = {
      test: {
        name: "test-contract",
        // Add empty blueprints to satisfy type check but still fail validation
        blueprints: []
      }
    };
    expect(() => ConfigManager.isValidConfig(invalidConfig)).toThrow();
  });

  it("should validate services URLs", () => {
    const configWithServices = {
      test: {
        contractPath: "contract.lua",
        services: {
          gatewayUrl: "http://localhost:4000",
          cuUrl: "http://localhost:4004",
          muUrl: "http://localhost:4002"
        }
      }
    };
    expect(() => ConfigManager.isValidConfig(configWithServices)).not.toThrow();
  });
});
