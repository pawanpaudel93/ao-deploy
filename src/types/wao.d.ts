declare module "wao" {
  export class GQL {
    constructor(options: { url: string });
    txs(options: {
      id: string;
    }): Promise<Array<{ tags: Array<{ name: string; value: string }> }>>;
  }
}
