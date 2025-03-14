import Arweave from "arweave";
import { assert, describe, expect, it } from "vitest";
import { ConfigManager } from "../src/lib/config";
import { Wallet } from "../src/lib/wallet";

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

  it("should validate with a wallet JWK", async () => {
    const arweave = Arweave.init({});
    const jwk = await arweave.wallets.generate();
    assert(Wallet.isJwk(jwk));

    const validConfig = {
      test: {
        name: "test-contract",
        contractPath: "contract.lua",
        wallet: jwk
      }
    };
    expect(() => ConfigManager.isValidConfig(validConfig)).not.toThrow();
  });

  it("should validate blueprints config", () => {
    const validConfig = {
      test: {
        name: "test-contract",
        blueprints: ["token"],
        wallet: "./wallet.json"
      }
    };
    expect(() => ConfigManager.isValidConfig(validConfig)).not.toThrow();
  });

  it("should reject invalid config", () => {
    const invalidConfig = {
      test: {
        name: "test-contract"
        // missing required fields
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
