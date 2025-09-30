import { JWKInterface } from "arweave/node/lib/wallet";

export interface WalletInterface {
  signer: JWKInterface | Window["arweaveWallet"];
  getAddress: () => Promise<string>;
}
