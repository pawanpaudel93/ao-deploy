import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { JWKInterface } from 'arweave/node/lib/wallet'
import { arweave } from './utils'

export class Wallet {
  #jwk: JWKInterface

  constructor(jwk: JWKInterface) {
    this.#jwk = jwk
  }

  /**
   * Check if the passed argument is a valid JSON Web Key (JWK) for Arweave.
   * @param obj - The object to check for JWK validity.
   * @returns {boolean} True if it's a valid Arweave JWK, otherwise false.
   */
  static isJwk(obj: any): boolean {
    if (typeof obj !== 'object') {
      return false
    }
    const requiredKeys = ['n', 'e', 'd', 'p', 'q', 'dp', 'dq', 'qi']
    return requiredKeys.every(key => key in obj)
  }

  #checkIfWalletLoaded() {
    if (!this.#jwk) {
      throw new Error('Wallet not loaded yet')
    }
  }

  static async getWallet(jwkOrPath?: fs.PathOrFileDescriptor | JWKInterface): Promise<JWKInterface> {
    try {
      if (!jwkOrPath) {
        throw new Error('Wallet not specified')
      }

      if (this.isJwk(jwkOrPath)) {
        return jwkOrPath as JWKInterface
      }

      const jwk = fs.readFileSync(jwkOrPath as string, 'utf8')
      return JSON.parse(jwk)
    }
    catch (e) {
      if (fs.existsSync(path.resolve(`${os.homedir()}/.aos.json`))) {
        return JSON.parse(fs.readFileSync(path.resolve(`${os.homedir()}/.aos.json`), 'utf-8'))
      }

      const wallet = await arweave.wallets.generate()
      fs.writeFileSync(path.resolve(`${os.homedir()}/.aos.json`), JSON.stringify(wallet))
      return wallet
    }
  }

  static async load(jwkOrPath?: fs.PathOrFileDescriptor | JWKInterface) {
    const jwk = await this.getWallet(jwkOrPath)
    return new Wallet(jwk)
  }

  async getAddress() {
    this.#checkIfWalletLoaded()
    return await arweave.wallets.getAddress(this.#jwk)
  }

  get jwk() {
    this.#checkIfWalletLoaded()
    return this.#jwk
  }
}
