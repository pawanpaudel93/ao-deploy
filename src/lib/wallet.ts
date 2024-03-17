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

export async function getWallet(walletPath?: fs.PathOrFileDescriptor) {
  try {
    if (!walletPath)
      throw new Error('Wallet path not specified')

    const jwk = fs.readFileSync(walletPath, 'utf8')
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
