export const APP_NAME = "ao-deploy";

export const defaultServices = {
  gatewayUrl: "https://arweave.net",
  cuUrl: "https://cu.ao-testnet.xyz",
  muUrl: "https://mu.ao-testnet.xyz",
  hbUrl: "https://push.forward.computer"
};

export const aoExplorerUrl = "https://aolink.arweave.net";

export const AOS_QUERY = `query ($owners: [String!]!, $names: [String!]!) {
    transactions(
      first: 1,
      owners: $owners,
      tags: [
        { name: "Data-Protocol", values: ["ao"] },
        { name: "Type", values: ["Process"]},
        { name: "Name", values: $names}
      ]
    ) {
      edges {
        node {
          id
          tags {
            name
            value
          }
        }
      }
    }
  }`;

export const TRANSACTION_QUERY = `query ($ids: [ID!]!) {
  transactions(ids: $ids) {
    edges {
      node {
        id
      }
    }
  }
}`;

export const blueprintsSet = new Set([
  "apm",
  "arena",
  "arns",
  "chat",
  "chatroom",
  "patch-legacy-reply",
  "staking",
  "token",
  "voting"
]);
