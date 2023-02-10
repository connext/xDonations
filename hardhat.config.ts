import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import { config as envConfig } from "dotenv";
import { polygon } from "@connext/smart-contracts/dist/src/typechain-types/contracts/messaging/connectors";

envConfig();

const config: HardhatUserConfig = {
  solidity: "0.8.17",
  networks: {
    // optimism
    optimism: {
      // PRIVATE_KEY loaded from .env file
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      chainId: 10,
      url: "https://mainnet.optimism.io",
    },
    "optimism-goerli": {
      // PRIVATE_KEY loaded from .env file
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      chainId: 420,
      url: "https://endpoints.omniatech.io/v1/op/goerli/public",
    },
    // arbitrum
    "arbitrum-one": {
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      chainId: 42161,
      url: "https://arb1.arbitrum.io/rpc",
    },
    "arbitrum-goerli": {
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      chainId: 421613,
      url: "https://endpoints.omniatech.io/v1/arbitrum/goerli/public",
    },
    // polygon
    polygon: {
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      chainId: 137,
      url: "https://1rpc.io/matic",
    },
    mumbai: {
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      chainId: 80001,
      url: "https://rpc.ankr.com/polygon_mumbai",
    },
  },
  etherscan: {
    apiKey: {
      // mainnets
      polygon: process.env.POLYGONSCAN_API_KEY!,
      optimisticEthereum: process.env.OPTIMISM_ETHERSCAN_API_KEY!,
      arbitrumOne: process.env.ARBISCAN_API_KEY!,
    }
  },
};

export default config;
