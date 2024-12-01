export const APP_NAME = "ao-deploy";

export const defaultServices = {
  gatewayUrl: "https://arweave.net",
  cuUrl: "https://cu.ao-testnet.xyz",
  muUrl: "https://mu.ao-testnet.xyz"
};

export const aoExplorerUrl = "https://www.ao.link";

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
        }
      }
    }
  }`;
