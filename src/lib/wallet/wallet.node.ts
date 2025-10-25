import { createDataItemSigner } from "@permaweb/aoconnect";
import type { JWKInterface } from "arweave/node/lib/wallet";
import { NodeArweaveWallet } from "node-arweave-wallet";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { arweave, isJwk } from "../utils/utils.common";
import { WalletInterface } from "./wallet.types";

export class Wallet implements WalletInterface {
  #jwk: JWKInterface | null = null;
  #arweaveWallet: NodeArweaveWallet | null = null;

  constructor(jwk?: JWKInterface, arweaveWallet?: NodeArweaveWallet) {
    if (jwk) {
      this.#jwk = jwk;
    }
    if (arweaveWallet) {
      this.#arweaveWallet = arweaveWallet;
    }
  }

  #checkIfWalletLoaded() {
    if (!this.#jwk && !this.#arweaveWallet) {
      throw new Error("Wallet not loaded yet");
    }
  }

  static async getWallet(
    jwkOrPath?: fs.PathLike | JWKInterface
  ): Promise<JWKInterface> {
    try {
      if (!jwkOrPath) {
        throw new Error("Wallet not specified");
      }

      if (isJwk(jwkOrPath)) return jwkOrPath as JWKInterface;

      const jwk = fs.readFileSync(jwkOrPath as string, "utf8");
      return JSON.parse(jwk);
    } catch {
      const walletPath = path.resolve(`${os.homedir()}/.aos.json`);
      if (fs.existsSync(walletPath)) {
        return JSON.parse(fs.readFileSync(walletPath, "utf-8"));
      }

      const wallet = await arweave.wallets.generate();
      fs.writeFileSync(walletPath, JSON.stringify(wallet));
      return wallet;
    }
  }

  static async load(jwkOrPath?: fs.PathLike | JWKInterface | "browser") {
    if (jwkOrPath === "browser") {
      const arweaveWallet = new NodeArweaveWallet();
      await arweaveWallet.initialize();
      return new Wallet(undefined, arweaveWallet);
    }

    const jwk = await this.getWallet(jwkOrPath);
    return new Wallet(jwk);
  }

  async getAddress() {
    this.#checkIfWalletLoaded();

    if (this.#arweaveWallet) {
      return await this.#arweaveWallet.getActiveAddress();
    }

    return await arweave.wallets.getAddress(this.#jwk!);
  }

  getDataItemSigner() {
    this.#checkIfWalletLoaded();

    if (this.#arweaveWallet) {
      return this.#arweaveWallet.getDataItemSigner();
    }

    return createDataItemSigner(this.#jwk!);
  }

  async close(status: "success" | "failed" = "success") {
    if (this.#arweaveWallet) {
      await this.#arweaveWallet.close(status);
    }
  }
}
