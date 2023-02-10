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
