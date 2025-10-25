import { createDataItemSigner } from "@permaweb/aoconnect";

export interface WalletInterface {
  signer: any;
  getAddress: () => Promise<string>;
  getDataItemSigner: () => ReturnType<typeof createDataItemSigner>;
  close: (status?: "success" | "failed") => Promise<void>;
}
