import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * Hardhat task defining the contract deployments for Connext
 *
 * @param hre Hardhat environment to deploy to
 */
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment): Promise<void> => {
    console.log("\n============================= Exporting + Verifying Deployments ===============================");
    await hre.run("export", {
        exportAll: "./deployments.json",
    });

    // wait 10s for explorer db
    await new Promise<void>(resolve => setTimeout(() => resolve(), 10_000))

    await hre.run("etherscan-verify", {
        solcInput: true,
    });
};

export default func;
func.tags = ["export"];
func.dependencies = ["xdonate"];
