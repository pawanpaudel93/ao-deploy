import Arweave from "arweave";
import type { JWKInterface } from "arweave/node/lib/wallet";
import { beforeAll, describe, expect, it } from "vitest";
import { GQL } from "wao";
import { deployContract, deployContracts } from "../src/lib/deploy";
import { isArweaveAddress } from "../src/lib/utils";
import type { Services } from "../src/types";

const services: Services = {
  cuUrl: "http://localhost:4004",
  muUrl: "http://localhost:4002",
  gatewayUrl: "http://localhost:4000"
};

describe("deploy", () => {
  let arweave: Arweave;
  let wallet: JWKInterface;
  let gql: GQL;

  beforeAll(async () => {
    arweave = Arweave.init({
      host: "localhost",
      port: 4000,
      protocol: "http"
    });

    wallet = await arweave.wallets.generate();

    console.log("wallet address: ", await arweave.wallets.getAddress(wallet));

    gql = new GQL({ url: `${services.gatewayUrl}/graphql` });
  });

  describe("basic deployments", () => {
    it("should deploy a contract with blueprints", async () => {
      const result = await deployContract({
        name: "test-token",
        wallet,
        blueprints: ["token"],
        services,
        silent: true
      });

      expect(result).toEqual(
        expect.objectContaining({
          messageId: expect.any(String),
          processId: expect.any(String),
          name: "test-token",
          isNewProcess: true
        })
      );
      expect(isArweaveAddress(result.processId)).toBe(true);
      expect(isArweaveAddress(result.messageId)).toBe(true);
    });

    it("should deploy a contract with custom source", async () => {
      const result = await deployContract({
        name: "test-custom",
        wallet,
        contractPath: "test/fixtures/sample.lua",
        services,
        silent: true
      });

      expect(result).toEqual(
        expect.objectContaining({
          messageId: expect.any(String),
          processId: expect.any(String),
          name: "test-custom",
          isNewProcess: true
        })
      );
      expect(isArweaveAddress(result.processId)).toBe(true);
      expect(isArweaveAddress(result.messageId)).toBe(true);
    });

    it("should deploy with both blueprint and custom source", async () => {
      const { messageId, processId } = await deployContract({
        name: "test-mixed",
        wallet,
        contractPath: "test/fixtures/sample.lua",
        blueprints: ["token"],
        services,
        silent: true
      });

      expect(messageId).toBeDefined();
      expect(processId).toBeDefined();
    });

    it("should fail without custom source or blueprints", async () => {
      await expect(
        deployContract({
          name: "test-invalid",
          // Use empty array to trigger validation failure while satisfying type check
          blueprints: [] as unknown as import("../src/types").Blueprint[]
        })
      ).rejects.toThrow();
    });
  });

  describe("deployment options", () => {
    it("should handle deployment with cron", async () => {
      const result = await deployContract({
        name: "test-cron",
        wallet,
        blueprints: ["token"],
        cron: "5-minutes",
        services,
        silent: true
      });

      expect(result).toEqual(
        expect.objectContaining({
          messageId: expect.any(String),
          processId: expect.any(String),
          name: "test-cron",
          isNewProcess: true
        })
      );

      // Verify cron-specific tags
      const txs = await gql.txs({ id: result.processId });
      const tags = txs[0].tags;
      expect(tags).toEqual(
        expect.arrayContaining([
          { name: "Cron-Interval", value: "5-minutes" },
          { name: "Cron-Tag-Action", value: "Cron" }
        ])
      );
    });

    it("should deploy with minification", async () => {
      const { messageId, processId } = await deployContract({
        name: "test-minified",
        wallet,
        contractPath: "test/fixtures/sample.lua",
        minify: true,
        services,
        silent: true
      });

      expect(messageId).toBeDefined();
      expect(processId).toBeDefined();
    });

    it("should deploy with custom scheduler", async () => {
      const { messageId, processId } = await deployContract({
        name: "test-scheduler",
        wallet,
        blueprints: ["token"],
        scheduler: "_GQ33BkPtZrqxA84vM8Zk-N2aO0toNNu_C-l-rawrBA",
        services,
        silent: true
      });

      expect(messageId).toBeDefined();
      expect(processId).toBeDefined();
    });

    it("should deploy with custom tags", async () => {
      const customTags = [
        { name: "Custom-Tag", value: "test" },
        { name: "Version", value: "1.0.0" }
      ];

      const result = await deployContract({
        name: "test-tags",
        wallet,
        blueprints: ["token"],
        tags: customTags,
        services,
        silent: true
      });

      // Verify custom tags
      const txs = await gql.txs({ id: result.processId });
      const tags = txs[0].tags;
      expect(tags).toEqual(
        expect.arrayContaining([
          ...customTags,
          { name: "App-Name", value: expect.any(String) },
          { name: "Name", value: "test-tags" }
        ])
      );
    });

    it("should deploy with onBoot enabled", async () => {
      const result = await deployContract({
        name: "test-onboot",
        wallet,
        blueprints: ["token"],
        onBoot: true,
        services,
        silent: true
      });

      // Verify onBoot tag and data
      const txs = await gql.txs({ id: result.processId });
      const tags = txs[0].tags;
      expect(tags).toEqual(
        expect.arrayContaining([{ name: "On-Boot", value: "Data" }])
      );

      // Verify contract data is included
      const dataResponse = await fetch(
        `${services.gatewayUrl}/${result.processId}`
      );
      const data = await dataResponse.text();
      expect(data).toContain("token"); // Should contain blueprint code
    });

    // it("should deploy with sqlite module", async () => {
    //   const { messageId, processId } = await deployContract({
    //     name: "test-sqlite",
    //     wallet,
    //     blueprints: ["token"],
    //     sqlite: true,
    //     services,
    //     silent: true
    //   });

    //   expect(messageId).toBeDefined();
    //   expect(processId).toBeDefined();
    // });
  });

  describe("process management", () => {
    it("should deploy to existing process", async () => {
      // First deployment
      const initial = await deployContract({
        name: "test-existing",
        wallet,
        blueprints: ["token"],
        services,
        silent: true
      });

      // Second deployment
      const result = await deployContract({
        name: "test-existing",
        wallet,
        blueprints: ["token"],
        processId: initial.processId,
        services,
        silent: true
      });

      expect(result).toEqual(
        expect.objectContaining({
          messageId: expect.any(String),
          processId: initial.processId,
          name: "test-existing",
          isNewProcess: false
        })
      );
    });

    it("should force spawn new process", async () => {
      // First deployment
      const initial = await deployContract({
        name: "test-force",
        wallet,
        blueprints: ["token"],
        services,
        silent: true
      });

      // Force new process
      const { messageId, processId } = await deployContract({
        name: "test-force",
        wallet,
        blueprints: ["token"],
        forceSpawn: true,
        services,
        silent: true
      });

      expect(messageId).toBeDefined();
      expect(processId).not.toBe(initial.processId);
    });
  });

  describe("error handling", () => {
    it("should handle retry on failure with correct delay", async () => {
      const startTime = Date.now();
      const retryCount = 2;
      const retryDelay = 1000;

      const result = await deployContract({
        name: "test-retry",
        wallet,
        blueprints: ["token"],
        retry: {
          count: retryCount,
          delay: retryDelay
        },
        services,
        silent: true
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(result).toBeDefined();
      expect(duration).toBeGreaterThanOrEqual(retryDelay); // At least one retry happened
    });

    it("should fail with invalid blueprint", async () => {
      await expect(
        deployContract({
          name: "test-invalid",
          wallet,
          blueprints: [
            "invalid-blueprint" as unknown as import("../src/types").Blueprint
          ],
          services,
          silent: true
        })
      ).rejects.toThrow();
    });

    it("should fail with invalid contract path", async () => {
      await expect(
        deployContract({
          name: "test-invalid",
          wallet,
          contractPath: "invalid/path.lua",
          services,
          silent: true
        })
      ).rejects.toThrow();
    });
  });

  describe("contract transformation", () => {
    it("should apply contract transformer", async () => {
      const transformComment = "-- Transformed";
      const result = await deployContract({
        name: "test-transform",
        wallet,
        contractPath: "test/fixtures/sample.lua",
        contractTransformer: (source) => `${transformComment}\n${source}`,
        services,
        silent: true
      });

      // Verify transformed code
      const response = await fetch(
        `${services.gatewayUrl}/${result.messageId}`
      );
      const data = await response.text();
      expect(data).toContain(transformComment);
      expect(data).toMatch(/^-- Transformed\n/);
    });

    it("should minify contract correctly", async () => {
      const result = await deployContract({
        name: "test-minified",
        wallet,
        contractPath: "test/fixtures/sample.lua",
        minify: true,
        services,
        silent: true
      });

      // Verify minified code
      const response = await fetch(
        `${services.gatewayUrl}/${result.messageId}`
      );
      const data = await response.text();
      expect(data).not.toContain("\n\n"); // No double newlines
      expect(data).not.toMatch(/\s+--/); // No spaces before comments
      expect(data.length).toBeLessThan(1000); // Arbitrary size check
    });
  });

  describe("multiple deployments", () => {
    it("should deploy multiple contracts concurrently", async () => {
      const configs = [
        {
          name: "demo1",
          wallet,
          contractPath: "test/fixtures/sample.lua",
          tags: [{ name: "Custom", value: "Tag" }],
          retry: {
            count: 10,
            delay: 3000
          },
          services,
          silent: true
        },
        {
          name: "demo2",
          wallet: "test/fixtures/wallet.json",
          contractPath: "test/fixtures/sample.lua",
          tags: [{ name: "Custom", value: "Tag" }],
          retry: {
            count: 10,
            delay: 3000
          },
          services,
          silent: true
        }
      ];

      const results = await deployContracts(configs, 2);

      // Verify all deployments succeeded
      expect(results).toHaveLength(2);
      results.forEach((result, idx) => {
        expect(result.status).toBe("fulfilled");
        if (result.status === "fulfilled") {
          const { processId, messageId, name, isNewProcess } = result.value;
          expect(isArweaveAddress(processId)).toBe(true);
          expect(isArweaveAddress(messageId)).toBe(true);
          expect(name).toBe(configs[idx].name);
          expect(isNewProcess).toBe(true);
        }
      });

      // Verify tags for each deployment
      for (const result of results) {
        if (result.status === "fulfilled") {
          const txs = await gql.txs({ id: result.value.processId });
          const tags = txs[0].tags;
          expect(tags).toEqual(
            expect.arrayContaining([
              { name: "Custom", value: "Tag" },
              { name: "App-Name", value: expect.any(String) },
              { name: "Name", value: expect.stringMatching(/^demo[12]$/) }
            ])
          );
        }
      }
    });

    it("should handle mixed success and failure", async () => {
      const configs = [
        {
          name: "demo-success",
          wallet,
          contractPath: "test/fixtures/sample.lua",
          services,
          silent: true
        },
        {
          name: "demo-fail",
          wallet,
          contractPath: "invalid/path.lua", // Invalid path
          services,
          silent: true
        }
      ];

      const results = await deployContracts(configs, 2);

      expect(results).toHaveLength(2);

      // First deployment should succeed
      expect(results[0].status).toBe("fulfilled");
      if (results[0].status === "fulfilled") {
        expect(isArweaveAddress(results[0].value.processId)).toBe(true);
      }

      // Second deployment should fail
      expect(results[1].status).toBe("rejected");
      if (results[1].status === "rejected") {
        expect(results[1].reason).toBeInstanceOf(Error);
        expect(results[1].reason.message).toContain("invalid/path.lua");
      }
    });

    it("should handle empty config array", async () => {
      const results = await deployContracts([], 2);
      expect(results).toEqual([]);
    });
  });
});
