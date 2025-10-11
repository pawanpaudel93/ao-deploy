import type { JWKInterface } from "arweave/node/lib/wallet";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BrowserWalletSigner } from "../browser-signer";
import { arweave, isJwk } from "../utils/utils.common";
import { WalletInterface } from "./wallet.types";

export class Wallet implements WalletInterface {
  #jwk: JWKInterface | null = null;
  #browserSigner: BrowserWalletSigner | null = null;

  constructor(jwk?: JWKInterface, browserSigner?: BrowserWalletSigner) {
    if (jwk) {
      this.#jwk = jwk;
    }
    if (browserSigner) {
      this.#browserSigner = browserSigner;
    }
  }

  #checkIfWalletLoaded() {
    if (!this.#jwk && !this.#browserSigner) {
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
      const browserSigner = new BrowserWalletSigner();
      await browserSigner.initialize();
      return new Wallet(undefined, browserSigner);
    }

    const jwk = await this.getWallet(jwkOrPath);
    return new Wallet(jwk);
  }

  async getAddress() {
    this.#checkIfWalletLoaded();

    if (this.#browserSigner) {
      return await this.#browserSigner.getAddress();
    }

    return await arweave.wallets.getAddress(this.#jwk!);
  }

  get signer(): any {
    this.#checkIfWalletLoaded();

    if (this.#browserSigner) {
      // Return the browser signer
      return this.#browserSigner;
    }

    return this.#jwk!;
  }

  async close(status: "success" | "failed" = "success") {
    if (this.#browserSigner) {
      await this.#browserSigner.close(status);
    }
  }
}
