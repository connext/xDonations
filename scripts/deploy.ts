import { ethers } from "hardhat";

async function main() {
  const xDonateFactory = await ethers.getContractFactory("xDonate");
  const xDonate = await xDonateFactory.deploy(
    "0xE592427A0AEce92De3Edee1F18E0157C05861564", // Uniswap SwapRouter on Optimism
    "0x8f7492DE823025b4CfaAB1D34c58963F2af5DEDA", // Connext on Optimism
    "0x4200000000000000000000000000000000000006", // Weth on Optimism
    "0xf7f0CFC3772d29d4CC1482A2ACB7Be16a85a2223", // My address Ethereum
    "0x7F5c764cBc14f9669B88837ca1490cCa17c31607", // USDC on Optimism (donation asset)
    "6648936" // Ethereum domain ID
  );

  await xDonate.deployed();

  console.log(`Deployed xDonate to ${xDonate.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
