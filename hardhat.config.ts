import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import { config as envConfig } from "dotenv";
import "@nomiclabs/hardhat-etherscan";

envConfig();

const config: HardhatUserConfig = {
  solidity: "0.8.17",
  networks: {
    optimism: {
      url: "https://mainnet.optimism.io",
      // PRIVATE_KEY loaded from .env file
      accounts: [`0x${process.env.PRIVATE_KEY}`],
    },
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: process.env.ETHERSCAN_API_KEY!,
  },
};

export default config;
