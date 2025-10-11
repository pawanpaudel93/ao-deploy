import { isBrowserEnv } from "../utils/utils.common";
import { WalletInterface } from "./wallet.types";

export class Wallet implements WalletInterface {
  constructor() {}

  static async load() {
    if (isBrowserEnv() && !window.arweaveWallet) {
      throw new Error("Arweave wallet not found");
    }
    return new Wallet();
  }

  async getAddress() {
    try {
      await window.arweaveWallet.connect(["ACCESS_ADDRESS"]);
    } catch {
      // Permission is already granted
    }

    return window.arweaveWallet.getActiveAddress();
  }

  get signer(): any {
    return window.arweaveWallet;
  }
}
