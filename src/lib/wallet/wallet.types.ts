export interface WalletInterface {
  signer: any;
  getAddress: () => Promise<string>;
}
