import {HardhatRuntimeEnvironment} from "hardhat/types";
import {DeployFunction} from "hardhat-deploy/types";
import { config as envConfig } from "dotenv";

envConfig();

const DEFAULT_ARGS: Record<number, string[]> = {
    10: [
        "0xE592427A0AEce92De3Edee1F18E0157C05861564", // Uniswap SwapRouter on Optimism
        "0x8f7492DE823025b4CfaAB1D34c58963F2af5DEDA", // Connext on Optimism
        "0x4200000000000000000000000000000000000006", // Weth on Optimism
        "0xf7f0CFC3772d29d4CC1482A2ACB7Be16a85a2223", // My address Ethereum
        "0x7F5c764cBc14f9669B88837ca1490cCa17c31607", // USDC on Optimism (donation asset)
        "6648936" // Ethereum domain ID
    ],
    137: [
        "0xE592427A0AEce92De3Edee1F18E0157C05861564", // Uniswap SwapRouter on Polygon
        "0x11984dc4465481512eb5b777E44061C158CF2259", // Connext on Polygon
        "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // Weth on Polygon
        "0xf7f0CFC3772d29d4CC1482A2ACB7Be16a85a2223", // My address Ethereum
        "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC on Polygon (donation asset)
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
        process.env.UNISWAP_SWAP_ROUTER ?? DEFAULT_ARGS[chainId][0],
        process.env.CONNEXT ?? DEFAULT_ARGS[chainId][1],
        process.env.WETH ?? DEFAULT_ARGS[chainId][2],
        process.env.DONATION_ADDRESS ?? DEFAULT_ARGS[chainId][3],
        process.env.DONATION_ASSET ?? DEFAULT_ARGS[chainId][4],
        process.env.DONATION_DOMAIN ?? DEFAULT_ARGS[chainId][5],
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