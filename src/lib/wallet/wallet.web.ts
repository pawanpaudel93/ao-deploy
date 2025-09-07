import type { JWKInterface } from "arweave/node/lib/wallet";
import { arweave } from "../utils/utils.common";

export class Wallet {
  #jwk?: JWKInterface | "use_wallet";

  constructor(jwk: JWKInterface | "use_wallet" = "use_wallet") {
    if (Wallet.isJwk(jwk)) {
      this.#jwk = jwk as JWKInterface;
    }
  }

  /**
   * Check if the passed argument is a valid JSON Web Key (JWK) for Arweave.
   * @param obj - The object to check for JWK validity.
   * @returns {boolean} True if it's a valid Arweave JWK, otherwise false.
   */
  static isJwk(obj: unknown): boolean {
    if (typeof obj !== "object" || obj === null) {
      return false;
    }
    const requiredKeys = ["n", "e", "d", "p", "q", "dp", "dq", "qi"];
    return requiredKeys.every((key) => key in obj);
  }

  static async load(jwk?: JWKInterface | "use_wallet") {
    return new Wallet(jwk);
  }

  async getAddress() {
    if (!this.#jwk) {
      try {
        await window.arweaveWallet.connect(["ACCESS_ADDRESS"]);
      } catch {
        // Permission is already granted
      }

      return window.arweaveWallet.getActiveAddress();
    } else {
      return arweave.wallets.getAddress(this.#jwk);
    }
  }

  get jwk() {
    return this.#jwk;
  }
}
