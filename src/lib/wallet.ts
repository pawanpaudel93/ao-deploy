import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import Arweave from 'arweave'
import type { JWKInterface } from 'arweave/node/lib/wallet'

export const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https',
})

/**
 * Check if the passed argument is a valid JSON Web Key (JWK) for Arweave.
 * @param obj - The object to check for JWK validity.
 * @returns {boolean} True if it's a valid Arweave JWK, otherwise false.
 */
function isJwk(obj: any): boolean {
  if (typeof obj !== 'object')
    return false
  const requiredKeys = ['n', 'e', 'd', 'p', 'q', 'dp', 'dq', 'qi']
  return requiredKeys.every(key => key in obj)
}

export async function getWallet(walletOrPath?: fs.PathOrFileDescriptor | JWKInterface): Promise<JWKInterface> {
  try {
    if (!walletOrPath)
      throw new Error('Wallet not specified')

    if (isJwk(walletOrPath))
      return walletOrPath as JWKInterface

    const jwk = fs.readFileSync(walletOrPath as string, 'utf8')
    return JSON.parse(jwk)
  }
  catch (e) {
    if (fs.existsSync(path.resolve(`${os.homedir()}/.aos.json`)))
      return JSON.parse(fs.readFileSync(path.resolve(`${os.homedir()}/.aos.json`), 'utf-8'))

    const wallet = await Arweave.init({}).wallets.generate()
    fs.writeFileSync(path.resolve(`${os.homedir()}/.aos.json`), JSON.stringify(wallet))
    return wallet
  }
}

export async function getWalletAddress(wallet: JWKInterface) {
  return await arweave.wallets.getAddress(wallet)
}

export function isArweaveAddress(address: any): boolean {
  return typeof address === 'string' && /^[a-z0-9-_]{43}$/i.test(address)
}
