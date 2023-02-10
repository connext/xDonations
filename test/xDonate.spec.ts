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

// These are the topics[0] for given events
// src: https://dashboard.tenderly.co/tx/optimistic/0xb0c1a0a5accb79ee72ba62226898bfc9957ec0a22695cd45b080a9462b7062f0/logs
const SWAP_SIG = "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67"
const XCALL_SIG = "0xed8e6ba697dd65259e5ce532ac08ff06d1a3607bcec58f8f0937fe36a5666c54"
const SWEPT_SIG = "0xed8e6ba697dd65259e5ce532ac08ff06d1a3607bcec58f8f0937fe36a5666c54"
// src: https://optimistic.etherscan.io/tx/0xa50d4a2774326ccff37cf89d90dfbef006a40ceea63da2b6aa1f25f2cf65a0c0#eventlog
const DEPOSIT_SIG = "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c"

describe("xDonate", function () {
  // Set up constants (will mirror what deploy fixture uses)
  const [CONNEXT, WETH, DONATION_ADDRESS, DONATION_ASSET, DONATION_DOMAIN] = DEFAULT_ARGS[31337];
  const UNISWAP_SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564"
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

    describe("should work with slippage defaults", () => {
      before(async () => {
        // fund the donation contract with eth, random token, and donation asset
        await fund(constants.AddressZero, utils.parseEther("1"), wallet, donation.address);

        await fund(DONATION_ASSET, utils.parseUnits("1", DONATION_ASSET_DECIMALS), whale, donation.address);

        await fund(randomToken.address, utils.parseUnits("1", await randomToken.decimals()), whale, donation.address);
      });

      it("should work for donation asset", async () => {
        // get initial connext balances
        const initConnext = await donationToken.balanceOf(CONNEXT);

        // send sweep tx
        const sweeping = await donationToken.balanceOf(donation.address);
        await expect(donation.connect(wallet).functions["sweep(address,uint24,uint256)"](DONATION_ASSET, 0, sweeping)).to.emit(donation, "Swept");

        // Ensure tokens got sent to connext
        expect((await donationToken.balanceOf(donation.address)).toString()).to.be.eq("0")
        expect((await donationToken.balanceOf(CONNEXT)).toString()).to.be.eq(initConnext.add(sweeping));
      });

      // FIXME: throws -- likely due to error in slippage calc that will
      // be reported in audit
      it.skip("should work for random token", async () => {
        // get initial connext balances
        const initConnext = await donationToken.balanceOf(CONNEXT);

        // send sweep tx
        const sweeping = await randomToken.balanceOf(donation.address);
        const tx = await donation.connect(wallet).functions["sweep(address,uint24,uint256)"](randomToken.address, 0, sweeping);
        const receipt = await tx.wait();

        // TODO: check events (expecting swap, xcall, swept)
        const emittedTopics = receipt.events.map(e => e.topics[0]);
        expect(emittedTopics.includes(SWEPT_SIG)).to.be.true;
        expect(emittedTopics.includes(XCALL_SIG)).to.be.true;
        expect(emittedTopics.includes(SWAP_SIG)).to.be.true;

        // Ensure tokens got sent to connext
        expect((await randomToken.balanceOf(donation.address)).toString()).to.be.eq("0")
        // Only asserting balance increased
        expect((await donationToken.balanceOf(CONNEXT)).gt(initConnext)).to.be.true;
      });

      // FIXME: throws -- likely due to error in slippage calc that will
      // be reported in audit
      it.skip("should work for native asset", async () => {
        // get initial connext balances
        const initConnext = await donationToken.balanceOf(CONNEXT);

        // send sweep tx
        const sweeping = await ethers.provider.getBalance(donation.address);
        const tx = await donation.connect(wallet).functions["sweep(address,uint24,uint256)"](constants.AddressZero, 0, sweeping);
        const receipt = await tx.wait();

        // TODO: check events (expecting swap, xcall, swept)
        const emittedTopics = receipt.events.map(e => e.topics[0]);
        expect(emittedTopics.includes(SWEPT_SIG)).to.be.true;
        expect(emittedTopics.includes(XCALL_SIG)).to.be.true;
        expect(emittedTopics.includes(DEPOSIT_SIG)).to.be.true;
        expect(emittedTopics.includes(SWAP_SIG)).to.be.true;

        // Ensure tokens got sent to connext
        expect((await randomToken.balanceOf(donation.address)).toString()).to.be.eq("0")
        // Only asserting balance increased
        expect((await donationToken.balanceOf(CONNEXT)).gt(initConnext)).to.be.true;
      })
    })

    describe("should work with specified slippage", async () => {
      before(async () => {
        // fund the donation contract with eth, random token, and donation asset
        await fund(constants.AddressZero, utils.parseEther("1"), wallet, donation.address);

        await fund(DONATION_ASSET, utils.parseUnits("1", DONATION_ASSET_DECIMALS), whale, donation.address);

        await fund(randomToken.address, utils.parseUnits("1", await randomToken.decimals()), whale, donation.address);
      });

      it("should work for donation asset", async () => {
        // get initial connext balances
        const initConnext = await donationToken.balanceOf(CONNEXT);

        // send sweep tx
        const sweeping = await donationToken.balanceOf(donation.address);
        await expect(donation.connect(wallet).functions["sweep(address,uint24,uint256,uint256,uint256)"](DONATION_ASSET, 0, sweeping, 100, 100)).to.emit(donation, "Swept");

        // Ensure tokens got sent to connext
        expect((await donationToken.balanceOf(donation.address)).toString()).to.be.eq("0")
        expect((await donationToken.balanceOf(CONNEXT)).toString()).to.be.eq(initConnext.add(sweeping));
      });

      it("should work for random token", async () => {
        // get initial connext balances
        const initConnext = await donationToken.balanceOf(CONNEXT);

        // send sweep tx
        const sweeping = await randomToken.balanceOf(donation.address);
        // NOTE: using 50% slippage
        const tx = await donation.connect(wallet).functions["sweep(address,uint24,uint256,uint256,uint256)"](randomToken.address, 3000, sweeping, 5000, 1000);
        const receipt = await tx.wait();

        const emittedTopics = receipt.events.map(e => e.topics[0]);
        expect(emittedTopics.includes(SWEPT_SIG)).to.be.true;
        expect(emittedTopics.includes(XCALL_SIG)).to.be.true;
        expect(emittedTopics.includes(SWAP_SIG)).to.be.true;

        // Ensure tokens got sent to connext
        expect((await randomToken.balanceOf(donation.address)).toString()).to.be.eq("0")
        // Only asserting balance increased
        expect((await donationToken.balanceOf(CONNEXT)).gt(initConnext)).to.be.true;
      });

      it("should work for native asset", async () => {
        // get initial connext balances
        const initConnext = await donationToken.balanceOf(CONNEXT);

        // send sweep tx
        const sweeping = await ethers.provider.getBalance(donation.address);
        // NOTE: using 50% slippage
        const tx = await donation.connect(wallet).functions["sweep(address,uint24,uint256,uint256,uint256)"](constants.AddressZero, 3000, sweeping, 5000, 100);
        const receipt = await tx.wait();

        const emittedTopics = receipt.events.map(e => e.topics[0]);
        expect(emittedTopics.includes(SWEPT_SIG)).to.be.true;
        expect(emittedTopics.includes(XCALL_SIG)).to.be.true;
        expect(emittedTopics.includes(DEPOSIT_SIG)).to.be.true;
        expect(emittedTopics.includes(SWAP_SIG)).to.be.true;

        // Ensure tokens got sent to connext
        expect((await ethers.provider.getBalance(donation.address)).toString()).to.be.eq("0")
        // Only asserting balance increased
        expect((await donationToken.balanceOf(CONNEXT)).gt(initConnext)).to.be.true;
      })
    })
  })
});
