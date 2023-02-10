import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { config as envConfig } from "dotenv";

envConfig();

export const DEFAULT_ARGS: Record<number, string[]> = {
    31337: [ // default to mimic optimism
        "0x8f7492DE823025b4CfaAB1D34c58963F2af5DEDA", // Connext on Optimism
        "0x4200000000000000000000000000000000000006", // Weth on Optimism
        "0xf7f0CFC3772d29d4CC1482A2ACB7Be16a85a2223", // My address Ethereum
        "0x7F5c764cBc14f9669B88837ca1490cCa17c31607", // USDC on Optimism (donation asset)
        "6648936" // Ethereum domain ID
    ],
    10: [
        "0x8f7492DE823025b4CfaAB1D34c58963F2af5DEDA", // Connext on Optimism
        "0x4200000000000000000000000000000000000006", // Weth on Optimism
        "0xe1935271D1993434A1a59fE08f24891Dc5F398Cd", // Donation address Ethereum
        "0x7F5c764cBc14f9669B88837ca1490cCa17c31607", // USDC on Optimism (donation asset)
        "6648936" // Ethereum domain ID
    ],
    42161: [
        "0xEE9deC2712cCE65174B561151701Bf54b99C24C8", // Connext on Arbitrum
        "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // Weth on Arbitrum
        "0xe1935271D1993434A1a59fE08f24891Dc5F398Cd", // Donation address Ethereum
        "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // USDC on Arbitrum (donation asset)
        "6648936" // Ethereum domain ID
    ],
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    // Get the chain id
    const chainId = +(await hre.getChainId());
    console.log("chainId", chainId)

    if (!DEFAULT_ARGS[chainId]) {
        throw new Error(`No defaults provided for ${chainId}`)
    }

    // Get the constructor args
    const args = [
        process.env.CONNEXT ?? DEFAULT_ARGS[chainId][0],
        process.env.WETH ?? DEFAULT_ARGS[chainId][1],
        process.env.DONATION_ADDRESS ?? DEFAULT_ARGS[chainId][2],
        process.env.DONATION_ASSET ?? DEFAULT_ARGS[chainId][3],
        process.env.DONATION_DOMAIN ?? DEFAULT_ARGS[chainId][4],
    ]

    // Get the deployer
    const [deployer] = await hre.ethers.getSigners();
    if (!deployer) {
        throw new Error(`Cannot find signer to deploy with`)
    }
    console.log("\n============================= Deploying xDonate ===============================");
    console.log("deployer: ", deployer.address);
    console.log("constructorArgs:", args);

    // Deploy contract
    const xDonate = await hre.deployments.deploy("xDonate", {
        from: deployer.address,
        args,
        skipIfAlreadyDeployed: true,
        log: true,
        // deterministicDeployment: true,
    });
    console.log(`xDonate deployed to ${xDonate.address}`);
};
export default func;
func.tags = ["xdonate"]