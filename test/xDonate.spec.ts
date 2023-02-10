import { expect } from "chai";
import { deployments, ethers } from "hardhat";
import { BigNumberish, constants, Contract, providers, utils, Wallet } from "ethers";
import { DEFAULT_ARGS } from "../deploy";
import { ERC20_ABI } from "@0xgafu/common-abi";

const fund = async (asset: string, wei: BigNumberish, from: Wallet, to: string): Promise<providers.TransactionReceipt> => {
  if (asset === constants.AddressZero) {
    const tx = await from.sendTransaction({ to, value: wei });
    // send eth
    return await tx.wait();;
  }

  // send tokens
  const token = new Contract(asset, ERC20_ABI, from);
  const tx = await token.transfer(to, wei);
  return await tx.wait();
}

describe("xDonate", function () {
  // Set up constants (will mirror what deploy fixture uses)
  const [CONNEXT, WETH, DONATION_ADDRESS, DONATION_ASSET, DONATION_DOMAIN] = DEFAULT_ARGS[31337];
  const UNISWAP_SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564"
  const UNISWAP_SWAP_QUOTER = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6"
  const WHALE = "0x385BAe68690c1b86e2f1Ad75253d080C14fA6e16" // this is the address that should have weth, donation, and random addr
  const RANDOM_TOKEN = "0x4200000000000000000000000000000000000042" // this is OP
  const DONATION_ASSET_DECIMALS = 6; // USDC decimals on op

  // Set up variables
  let donation: Contract;
  let wallet: Wallet;
  let whale: Wallet;
  let donationToken: Contract;
  let weth: Contract;
  let randomToken: Contract;

  before(async () => {
    // get wallet
    [wallet] = await ethers.getSigners() as unknown as Wallet[]
    // get whale
    whale = await ethers.getImpersonatedSigner(WHALE) as unknown as Wallet;
    // deploy contract
    const { xDonate } = await deployments.fixture(["xdonate"]);
    donation = new Contract(xDonate.address, xDonate.abi, ethers.provider);

    // setup tokens
    donationToken = new Contract(DONATION_ASSET, ERC20_ABI, ethers.provider);
    weth = new Contract(WETH, ERC20_ABI, ethers.provider);
    randomToken = new Contract(RANDOM_TOKEN, ERC20_ABI, ethers.provider);
  })

  describe("constructor", () => {
    it("should deploy correctly", async () => {
      // Ensure all properties set correctly
      expect(await donation.swapRouter()).to.be.eq(UNISWAP_SWAP_ROUTER);
      expect(await donation.swapQuoter()).to.be.eq(UNISWAP_SWAP_QUOTER);
      expect(await donation.connext()).to.be.eq(CONNEXT);
      expect(await donation.weth()).to.be.eq(WETH);
      expect(await donation.donationAddress()).to.be.eq(DONATION_ADDRESS);
      expect(await donation.donationAsset()).to.be.eq(DONATION_ASSET);
      expect(await donation.donationDomain()).to.be.eq(+DONATION_DOMAIN);
  
      // Ensure deployer whitelisted
      expect(await donation.sweepers(wallet.address)).to.be.true;
  
      // Ensure decimals set properly
      expect(await donation.donationAssetDecimals()).to.be.eq(DONATION_ASSET_DECIMALS);

      // Ensure whale is okay
      expect(whale.address).to.be.eq(WHALE);
    });
  })

  describe("receiving funds", () => {
    it("should be able to receive eth", async () => {
      // Get initial balances
      const initialWallet = await wallet.getBalance();
      const initialDonation = await ethers.provider.getBalance(donation.address);
      
      // Send funds to the contract
      const receipt = await fund(constants.AddressZero, 1, wallet, donation.address);
      const deducted = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice).add(1)

      // Check balances
      expect((await wallet.getBalance()).toString()).to.be.eq(initialWallet.sub(deducted).toString());
      expect((await ethers.provider.getBalance(donation.address)).toString()).to.be.eq(initialDonation.add(1).toString());
    });

    it("should be able to receive donating asset", async () => {
      // Get initial balances
      const initialWallet = await donationToken.balanceOf(whale.address);
      const initialDonation = await donationToken.balanceOf(donation.address);

      // Send funds to the contract
      const amount = utils.parseUnits("1", DONATION_ASSET_DECIMALS);
      await fund(donationToken.address, amount, whale, donation.address);

      // Check balances
      expect((await donationToken.balanceOf(whale.address)).toString()).to.be.eq(initialWallet.sub(amount).toString());
      expect((await donationToken.balanceOf(donation.address)).toString()).to.be.eq(initialDonation.add(amount).toString());
    });

    it("should be able to receive random token", async () => {
      // Get initial balances
      const initialWallet = await randomToken.balanceOf(whale.address);
      const initialDonation = await randomToken.balanceOf(donation.address);

      // Send funds to the contract
      const amount = utils.parseUnits("1", DONATION_ASSET_DECIMALS);
      await fund(randomToken.address, amount, whale, donation.address);

      // Check balances
      expect((await randomToken.balanceOf(whale.address)).toString()).to.be.eq(initialWallet.sub(amount).toString());
      expect((await randomToken.balanceOf(donation.address)).toString()).to.be.eq(initialDonation.add(amount).toString());
    })
  })

  describe("controlling sweeper whitelist", () => {
    it("should fail to add sweeper if caller is not sweeper", async () => {
      await expect(donation.connect(whale).addSweeper(whale.address)).to.be.revertedWith("!sweeper")
    });

    it("should fail to add sweeper if already sweeper", async () => {
      await expect(donation.connect(wallet).addSweeper(wallet.address)).to.be.revertedWith("approved")
    });

    it("should fail to remove sweeper if caller is not sweeper", async () => {
      await expect(donation.connect(whale).removeSweeper(whale.address)).to.be.revertedWith("!sweeper")
    });

    it("should fail to remove sweeper if not sweeper", async () => {
      await expect(donation.connect(wallet).removeSweeper(whale.address)).to.be.revertedWith("!approved")
    });

    it("should be able to add / remove sweeper", async () => {
      // Add whale
      await expect(donation.connect(wallet).addSweeper(whale.address)).to.emit(donation, "SweeperAdded").withArgs(whale.address, wallet.address)

      expect(await donation.sweepers(whale.address)).to.be.true;

      // Remove whale
      await expect(donation.connect(wallet).removeSweeper(whale.address)).to.emit(donation, "SweeperRemoved").withArgs(whale.address, wallet.address)

      expect(await donation.sweepers(whale.address)).to.be.false;
    });
  })

  describe("sweeping", () => {
    it("should fail with invalid inputs (amount > 0, slippages >= min)", async () => {
      const minSlippage = await donation.MIN_SLIPPAGE();
      await expect(
        donation.connect(wallet).functions["sweep(address,uint24,uint256)"](
          randomToken.address,
          100,
          constants.Zero,
        )
      ).to.be.revertedWith("!amount")

      await expect(
        donation.connect(wallet).functions["sweep(address,uint24,uint256,uint256,uint256)"](
          randomToken.address,
          100,
          constants.One,
          constants.Zero,
          minSlippage
        )
      ).to.be.revertedWith("!uniswapSlippage")

      await expect(
        donation.connect(wallet).functions["sweep(address,uint24,uint256,uint256,uint256)"](
          randomToken.address,
          100,
          constants.One,
          constants.Zero,
          minSlippage
        )
      ).to.be.revertedWith("!uniswapSlippage")

    })

    it("should fail if not permissioned", async () => {
      await expect(
        donation.connect(whale).functions["sweep(address,uint24,uint256)"](
          randomToken.address,
          100,
          constants.One,
        )
      ).to.be.revertedWith("!sweeper")
    })
  })
});
