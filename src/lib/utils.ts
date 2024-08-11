import path from 'node:path'
import process from 'node:process'
import { writeFile } from 'node:fs/promises'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { URL } from 'node:url'
import Arweave from 'arweave'
import Ardb from 'ardb'

export const APP_NAME = 'ao-deploy'

/**
 * Initializes a default Arweave instance.
 */
export const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https',
})

/**
 * Parses a gateway URL and returns an object containing the host, port, and protocol.
 *
 * @param url - The gateway URL to be parsed.
 * @returns An object with the host, port, and protocol of the URL.
 */
function parseGatewayUrl(url: string): { host: string, port: number, protocol: string } {
  const parsedUrl = new URL(url)
  return {
    host: parsedUrl.hostname,
    port: parsedUrl.port ? Number.parseInt(parsedUrl.port, 10) : 443,
    protocol: parsedUrl.protocol.replace(':', ''),
  }
}

/**
 * Initializes an Arweave instance with a custom gateway.
 *
 * @param gateway - The gateway URL to connect to.
 * @returns An Arweave instance configured with the provided gateway.
 */
export function getArweave(gateway: string) {
  try {
    const { host, port, protocol } = parseGatewayUrl(gateway)
    return Arweave.init({ host, port, protocol })
  }
  catch {
    return arweave
  }
}

export const ardb: Ardb = new ((Ardb as any)?.default ?? Ardb)(arweave)

export function getArdb(gateway: string) {
  try {
    const arweave = getArweave(gateway)
    return (new ((Ardb as any)?.default ?? Ardb)(arweave)) as Ardb
  }
  catch { return ardb }
}

export function isArweaveAddress(address: any): boolean {
  return typeof address === 'string' && /^[\w-]{43}$/.test(address)
}

export async function sleep(delay: number = 3000) {
  return new Promise((resolve, _) => setTimeout(resolve, delay))
}

/**
 * Retries a given function up to a maximum number of attempts.
 * @param fn - The asynchronous function to retry, which should return a Promise.
 * @param maxAttempts - The maximum number of attempts to make.
 * @param delay - The delay between attempts in milliseconds.
 * @return A Promise that resolves with the result of the function or rejects after all attempts fail.
 */
export async function retryWithDelay<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delay: number = 1000,
): Promise<T> {
  let attempts = 0

  const attempt = async (): Promise<T> => {
    try {
      return await fn()
    }
    catch (error) {
      attempts += 1
      if (attempts < maxAttempts) {
        // console.log(`Attempt ${attempts} failed, retrying...`)
        return new Promise<T>(resolve => setTimeout(() => resolve(attempt()), delay))
      }
      else {
        throw error
      }
    }
  }

  return attempt()
}

export async function writeFileToProjectDir(data: string, outDir: string, fileName: string) {
  try {
    const fullPath = path.join(process.cwd(), `${outDir}/${fileName}.lua`)
    const dirName = path.dirname(fullPath)
    if (!existsSync(dirName)) {
      mkdirSync(dirName)
    }
    await writeFile(fullPath, data)
  }
  catch {
    throw new Error(`Failed to write bundle to ${outDir}`)
  }
}

export async function clearBuildOutDir(outDir: string) {
  try {
    const fullPath = path.join(process.cwd(), `${outDir}`)
    const dirName = path.dirname(fullPath)

    if (!existsSync(dirName)) {
      return true
    }

    rmSync(outDir, { recursive: true, force: true })
  }
  catch {
    throw new Error(`Failed to clear ${outDir}`)
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
    if (!url || typeof url !== 'string') {
      return false
    }
    // eslint-disable-next-line no-new
    new URL(url)
    return true
  }
  catch {
    return false
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
export function parseToInt(value: string | number | undefined, defaultValue: number): number {
  if (value === undefined) {
    return defaultValue
  }
  const parsedValue = Number.parseInt(value.toString())
  if (Number.isNaN(parsedValue)) {
    return defaultValue
  }
  return parsedValue
}

/**
 * Validates a URL string.
 * If the URL is not valid, it returns the specified default value.
 *
 * @param value - The URL string to be validated.
 * @param defaultValue - The default value to return if the URL is not valid.
 * @returns The URL if valid, or the default value if the URL is not valid.
 */
export function parseUrl(value: string | undefined, defaultValue: string): string {
  if (value === undefined) {
    return defaultValue
  }
  const urlValid = isUrl(value)
  if (!urlValid) {
    return defaultValue
  }
  return value
}

export const defaultServices = {
  gatewayUrl: 'https://arweave.net',
  cuUrl: 'https://cu.ao-testnet.xyz',
  muUrl: 'https://mu.ao-testnet.xyz',
}

export function jsonStringify(value?: any): string {
  try {
    return JSON.stringify(value, null, 2)
  }
  catch {
    return value
  }
}

export function isLuaFile(fileName: string): boolean {
  if (!fileName) {
    return false
  }
  return fileName.toLowerCase().endsWith('.lua')
}

export function isCronPattern(cron: string): boolean {
  if (!cron) {
    return false
  }
  const cronRegex = /^\d+-(?:Second|second|Minute|minute|Hour|hour|Day|day|Month|month|Year|year|Block|block)s?$/
  return cronRegex.test(cron)
}
