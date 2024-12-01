import Arweave from "arweave";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";
import { TRANSACTION_QUERY } from "./constants";

/**
 * Initializes a default Arweave instance.
 */
export const arweave = Arweave.init({
  host: "arweave.net",
  port: 443,
  protocol: "https"
});

/**
 * Parses a gateway URL and returns an object containing the host, port, and protocol.
 *
 * @param url - The gateway URL to be parsed.
 * @returns An object with the host, port, and protocol of the URL.
 */
function parseGatewayUrl(url: string): {
  host: string;
  port: number;
  protocol: string;
} {
  const parsedUrl = new URL(url);
  return {
    host: parsedUrl.hostname,
    port: parsedUrl.port ? Number.parseInt(parsedUrl.port, 10) : 443,
    protocol: parsedUrl.protocol.replace(":", "")
  };
}

/**
 * Initializes an Arweave instance with a custom gateway.
 *
 * @param gateway - The gateway URL to connect to.
 * @returns An Arweave instance configured with the provided gateway.
 */
export function getArweave(gateway: string) {
  try {
    const { host, port, protocol } = parseGatewayUrl(gateway);
    return Arweave.init({ host, port, protocol });
  } catch {
    return arweave;
  }
}

export function isArweaveAddress(address: any): boolean {
  return typeof address === "string" && /^[\w-]{43}$/.test(address);
}

export async function sleep(delay: number = 3000) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Retries a given function up to a maximum number of attempts.
 * @param fn - The asynchronous function to retry, which should return a Promise.
 * @param maxAttempts - The maximum number of attempts to make.
 * @param initialDelay - The delay between attempts in milliseconds.
 * @param getDelay - A function that returns the delay for a given attempt.
 * @return A Promise that resolves with the result of the function or rejects after all attempts fail.
 */
export async function retryWithDelay<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  initialDelay: number = 1000,
  getDelay: (attempt: number) => number = () => initialDelay
): Promise<T> {
  let attempts = 0;

  const attempt = async (): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      attempts += 1;
      if (attempts < maxAttempts) {
        const currentDelay = getDelay(attempts);
        // console.log(`Attempt ${attempts} failed, retrying...`)
        return new Promise<T>((resolve) =>
          setTimeout(() => resolve(attempt()), currentDelay)
        );
      } else {
        throw error;
      }
    }
  };

  return attempt();
}

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

/**
 * Checks if a string is a valid URL.
 *
 * @param url - The string to be checked.
 * @returns True if the string is a valid URL, false otherwise.
 */
export function isUrl(url?: string): boolean {
  try {
    if (!url || typeof url !== "string") {
      return false;
    }
    // eslint-disable-next-line no-new
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses a string to an integer.
 * If parsing fails (i.e., the value is NaN), it returns the specified default value.
 *
 * @param value - The string to be parsed.
 * @param defaultValue - The default value to return if parsing fails.
 * @returns The parsed integer or the default value if parsing fails.
 */
export function parseToInt(
  value: string | number | undefined,
  defaultValue: number
): number {
  if (value === undefined) {
    return defaultValue;
  }
  const parsedValue = Number.parseInt(value.toString());
  if (Number.isNaN(parsedValue)) {
    return defaultValue;
  }
  return parsedValue;
}

/**
 * Validates a URL string.
 * If the URL is not valid, it returns the specified default value.
 *
 * @param value - The URL string to be validated.
 * @param defaultValue - The default value to return if the URL is not valid.
 * @returns The URL if valid, or the default value if the URL is not valid.
 */
export function parseUrl(
  value: string | undefined,
  defaultValue: string
): string {
  if (value === undefined) {
    return defaultValue;
  }
  const urlValid = isUrl(value);
  if (!urlValid) {
    return defaultValue;
  }
  return value;
}

export function jsonStringify(value?: any): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return value;
  }
}

export function isLuaFile(fileName: string): boolean {
  if (!fileName) {
    return false;
  }
  return fileName.toLowerCase().endsWith(".lua");
}

export function isCronPattern(cron: string): boolean {
  if (!cron) {
    return false;
  }
  const cronRegex =
    /^\d+-(?:Second|second|Minute|minute|Hour|hour|Day|day|Month|month|Year|year|Block|block)s?$/;
  return cronRegex.test(cron);
}

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export const getUserPkgManager: () => PackageManager = () => {
  // Check for npm/pnpm/yarn/bun executable path
  const userAgent = process.env.npm_config_user_agent;
  const execPath = process.env.npm_execpath || "";

  if (execPath.includes("pnpm")) {
    return "pnpm";
  }

  if (execPath.includes("yarn")) {
    return "yarn";
  }

  if (execPath.includes("bun")) {
    return "bun";
  }

  // Fallback to user agent check
  if (userAgent) {
    if (userAgent.startsWith("yarn")) {
      return "yarn";
    } else if (userAgent.startsWith("pnpm")) {
      return "pnpm";
    } else if (userAgent.startsWith("bun")) {
      return "bun";
    } else if (userAgent.startsWith("npm")) {
      return "npm";
    }
  }

  // Default to npm if nothing else is detected
  return "npm";
};

interface PollingOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
}

export async function pollForProcessSpawn({
  processId,
  options = {}
}: {
  processId: string;
  options?: PollingOptions;
}): Promise<void> {
  const {
    maxAttempts = 10,
    initialDelayMs = 3000,
    backoffFactor = 1.5
  } = options;

  const queryTransaction = async () => {
    const response = await arweave.api.post("/graphql", {
      query: TRANSACTION_QUERY,
      variables: { ids: [processId] }
    });

    const transaction = response?.data?.data?.transactions?.edges?.[0]?.node;
    if (!transaction) {
      throw new Error("Transaction not found");
    }
    return transaction;
  };

  try {
    await retryWithDelay(
      queryTransaction,
      maxAttempts,
      initialDelayMs,
      (attempt) => initialDelayMs * Math.pow(backoffFactor, attempt - 1)
    );
  } catch {
    throw new Error(
      `Failed to find process ${processId} after ${maxAttempts} attempts. The process may still be spawning.`
    );
  }
}
