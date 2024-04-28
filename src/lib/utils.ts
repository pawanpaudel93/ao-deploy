import Arweave from 'arweave'
import Ardb from 'ardb'

export const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https',
})

export const ardb = new ((Ardb as any)?.default ?? Ardb)(arweave)

export function isArweaveAddress(address: any): boolean {
  return typeof address === 'string' && /^[a-z0-9-_]{43}$/i.test(address)
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
