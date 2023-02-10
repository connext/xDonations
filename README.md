# xDonations

## Background

The `xDonation` contract is a simple contract designed to help NGOs accept donations across multiple chains.

Many NGOs are limited to accepting donations on a single chain when receiving crypto donations. This makes it difficult for potential donors to contribute if they exist on a different chain.

Using `xDonation.sol` allows anyone to donate funds, regardless of what chain they are on. Donors send funds to the contract, and at any point an approved `sweeper` can call `sweep` which will swap into the donation asset and send the funds to the specified address and chain.

### Why whitelist the sweeper?

The sweeper has the ability to set slippage on the funds sent to the donation address. While it is not strictly required to whitelist the caller of this function, using a whitelist provides an additional layer of protection that ensures slippage is reasonable and no malicious tokens are interacted with. They _CANNOT_ change where the funds are sent, or which asset is donated.

## Security

These contracts have been audited twice:

- By [Macro](https://0xmacro.com/): https://github.com/connext/xDonations/blob/main/audits/MacroAudit.pdf
- By [Salus](https://salusec.io/): https://github.com/connext/xDonations/blob/main/audits/SalusAudit.pdf

## Development

- Build:

  ```sh
  npm i && npm run build
  ```

- Copy the `.env.example` into a `.env` and populate

- Deploy using `hardhat`:

  ```sh
  npx hardhat deploy --network <NETWORK>
  ```

  This will also verify the contracts if the API keys are configured.

## Sweeping

To sweep the funds to the donation address on the specified domain, you will need to execute the following function from a registered `sweeper`:

```js
/// @notice Moves funds from this contract to the `donationAddress` on the specified `domain`. Swaps into `donationAddress` if needed.
/// @param fromAsset The asset to move to mainnet
/// @param poolFee The `poolFee` on the uniswap `fromAsset` <> `donationAsset` pool
/// @param amountIn The amount of asset to move to mainnet
/// @param amountOutMin The minimum amount out
/// @param connextSlippage The allowed slippage on the Connext transfer in bps
function sweep(
    address fromAsset,
    uint24 poolFee,
    uint256 amountIn,
    uint256 amountOutMin,
    uint256 connextSlippage
)
```

### Sweeping from explorer using EOA

_Finding the `fromAsset`_

This parameter is simply the token address of the asset you are trying to sweep to the donation address. This asset will be swapped (if needed) into the donation asset, and bridged across chains using Connext.

If you are using the native asset, this value will be `0x0000000000000000000000000000000000000000`.

_Finding the `poolFee`_

This parameter represents the pool fee taken during the swap from the sweeping asset into the donation asset. If you are sweeping the donation asset, use a `poolFee` of `0`. Otherwise:

1. Navigate to the [Pools section on the Uniswap Info Page](https://info.uniswap.org/#/pools)
2. Select the network you will be sweeping from
3. Find the pool for the correct `fromAsset` <> `USDC` (or the appropriate donation asset).
4. The pool fee should be shown as a percentage next to the asset symbols within the pool. To convert this pool fee to the appropriate explorer input, use the following table:

| Pool Fee Percentage | Input |
| ------------------- | ----- |
| 0.01%               | 100   |
| 0.05%               | 500   |
| 0.3%                | 3000  |

_Finding the `amountIn`_

This parameter represents the wei value of the token you are swapping (if needed) and sending to the donation address.

If you want to sweep the entire balance of the donation contract:

1. Navigate to the token page for the asset you want to sweep on the explorer. You can do this from the donation contract by clicking on the drop down token links and clicking on the `Contract` link on the top right.
2. Select the `Contract` tab, and click on the `Read Contract` section.
3. Paste the donation contract address from [`deployments.json](./deployments.json) into the `balanceOf` function and click `Query`.
4. The returned response should represent the wei balance of the contract.

If you want to sweep a smaller amount than the total balance:

1. Navigate to the token page for the asset you want to sweep on the explorer. You can do this from the donation contract by clicking on the drop down token links and clicking on the `Contract` link on the top right.
2. Select the `Contract` tab, and click on the `Read Contract` section.
3. Find the `decimals` value of the contract.
4. Convert the amount you want to transfer to wei using the pulled `decimals`. For example, if I want to transfer 180 USDC and USDC has 6 decimals, I would use `180000000` for the `amountIn`.

_Finding the `amountOutMin`_

This parameter represents the minimum amount you will receive from a swap of the asset you are sweeping into the donating asset. If you are sweeping the donating asset, this should be the same value as `amountIn`. Otherwise, calculate this value by:

1. Navigating to the [Uniswap app interface]()
2. Selecting the proper network from the networks dropdown
3. Inputting the correct swap assets, and the `amountIn` in normal units. Do not put in the wei value, use the normal value (i.e. if I want to swap 10 ether, I would put 10 into the swap not 10000000000000000000)
4. Expand the swap information using the arrow to the left of the price conversion display at the bottom of the swap entry
5. Copy the `Minimum received after slippage` value
6. Find the decimals of the donation asset by navigating to the donation contract, clicking `Code` then `Read Contract`, and finding the value for the `donationAssetDecimals`. (NOTE: USDC is 6 decimals on all chains except binance)
7. Convert the amount to wei using the `decimals` of the donation asset. For example, if the value is 180 USDC and USDC has 6 decimals, I would use `180000000`.

_Finding the `connextSlippage`_

This parameter represents the BPS slippage you are willing to take when bridging the asset. The appropriate value depends on the liquidity available of the donating asset within connext. To find the best value to use here:

1. Navigate to the [Pools page of Connextscan](https://bridge.connext.network/pools)
2. Find the liquidity for the donation asset on the chain you are sweeping from.
3. Use your best judgment to select from these options:

| Slippage | Input | When to use                                                     |
| -------- | ----- | --------------------------------------------------------------- |
| 3%       | 300   | High amount relative to liquidity; imbalanced                   |
| 1%       | 100   | Moderate amount relative to liquidity; lightly imbalanced       |
| 0.5%     | 50    | Low amount relative to liquidity; balanced or excess next asset |

_Submitting the transaction_

1. Find all of the relevant values as described above.
2. Navigate to the contract on the explorer. Contract addresses across all chains can be found in [`deployments.json`](./deployments.json).
3. Connect your wallet to the explorer. Ensure the connected wallet is a registered sweeper.
4. Input all of the parameter values.
5. Use ~$15 worth of eth for the input fees. This amount is adjustable, so you can always use $0 and update (see the monitoring section below).
6. Click `Write` and sign the transaction on metamask.

**NOTE:** If the gas estimation fails on metamask, it likely means the `amountOutMin` has been updated.

_Monitoring the crosschain transaction_

It is easy to monitor the status of the crosschain transaction using [Connextscan](https://connextscan.io/):

1. Find the transaction hash for the `sweep` transaction you wish to monitor
2. Navigate to [Connextscan](https://connextscan.io/)
3. Search for the transaction hash on the explorer
4. If there is a `Receive` transaction available, it should show funds being sent to the donation address. You may also see an `Action Required` window prompting you to bump the fees for the crosschain transaction. This window should prompt you to submit another transaction on the chain you swept from and will occur if the fees used on `sweep` are too low.

### Sweeping from a hardhat task using EOA

TODO
