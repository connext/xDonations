// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import {IConnext} from "@connext/smart-contracts/contracts/core/connext/interfaces/IConnext.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

import {IWeth} from "./interfaces/IWeth.sol";

/// @title xDonate
/// @author Connext Labs
/// @notice The xDonate contract helps you accept donations from any chain to a pre-specified
///         donationAddress and donationDomain.
///
///         The contract expects users to transfer tokens to it, and then implements a single 
///         admin function, `sweep`, that swaps the token on uniswap if `fromAsset` and `donationAsset`
///         are different, then `xcall`s the `donationAsset` to the `donationAddress` / `domain`.
/// @dev The domains hosting this contract *MUST* support Uniswap V3
contract xDonate {
    //////////////////// Events
    /// @notice Emitted when funds are sent to the donation domain
    event Swept(bytes32 indexed crosschainId, address donationAsset, uint256 donationAmount, uint256 relayerFee, address sweeper);

    /// @notice Emitted when a sweeper is added to the whitelist
    /// @param added The sweeper added
    /// @param caller Who added the sweeper
    event SweeperAdded(address indexed added, address indexed caller);

    /// @notice Emitted when a sweeper is removed from the whitelist
    /// @param removed The sweeper removed
    /// @param caller Who removed the sweeper
    event SweeperRemoved(address indexed removed, address indexed caller);

    //////////////////// Constants
    /// @notice Stores the UINT.MAX for infinite approvals
    uint256 public constant MAX_INT = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;

    /// @notice Stores the lower bound for slippage used in sweep as sanity check
    uint256 public constant MIN_SLIPPAGE = 10; // 0.01% is min slippage

    //////////////////// Storage
    /// @notice UniswapV3 swap router contract to swap into `donationAsset`
    ISwapRouter public immutable swapRouter;

    /// @notice Connext contract used to send assets across chains
    IConnext public immutable connext;

    /// @notice WETH address to handle native assets before swapping / sending. 
    IWeth public immutable weth;

    /// @notice Address on the specified domain to send funds to
    address public immutable donationAddress;

    /// @notice Domain the `donationAddress` lives on
    uint32 public immutable donationDomain;

    /// @notice Asset to send to the specified address. Must be asset on the chain the contract
    ///         is deployed to
    address public immutable donationAsset;

    /// @notice Stores whether or not the donation asset has been approved to Connext.
    ///         Uses infinite approval.
    bool public approvedDonationAsset;

    /// @notice Caches the decimals for the donation address.
    /// @dev Used to generate the minimum amount out when swapping into donation address on `sweep`
    uint8 public immutable donationAssetDecimals;

    /// @notice Mapping that contains addresses permissioned to edit the whitelist / sweep
    mapping(address => bool) public sweepers;
    
    //////////////////// Constructor
    constructor(
        ISwapRouter _swapRouter,
        IConnext _connext,
        IWeth _weth,
        address _donationAddress,
        address _donationAsset,
        uint32 _donationDomain
    ) {
        swapRouter = _swapRouter;
        connext = _connext;
        weth = _weth;
        donationAsset = _donationAsset;
        donationAddress = _donationAddress;
        donationDomain = _donationDomain;
        // initialize deployer as sweeper
        _addSweeper(msg.sender);
        // initialize decimals
        donationAssetDecimals = IERC20Metadata(_donationAsset).decimals();
    }

    //////////////////// Modifiers

    /// @notice Ensures the msg.sender is a whitelisted sweeper
    modifier onlySweeper {
        require(sweepers[msg.sender], "!sweeper");
        _;
    }

    //////////////////// Payable
    receive() external payable {}

    //////////////////// Public functions

    /// @notice Adds a sweeper to the whitelist. Callable by an existing whitelisted agent.
    /// @param sweeper The address to add
    function addSweeper(address sweeper) external onlySweeper {
        _addSweeper(sweeper);
    }

    /// @notice Removes a sweeper to the whitelist. Callable by an existing whitelisted agent.
    /// @param sweeper The address to remove
    function removeSweeper(address sweeper) external onlySweeper {
        require(sweepers[sweeper], "!approved");
        sweepers[sweeper] = false;
        emit SweeperRemoved(sweeper, msg.sender);
    }

    /// @notice Moves funds from this contract to the `donationAddress` on the specified
    ///         `domain`. Swaps into `donationAddress` if needed.
    /// @param fromAsset The asset to move to mainnet
    /// @param poolFee The `poolFee` on the uniswap `fromAsset` <> `donationAsset` pool
    /// @param amountIn The amount of asset to move to mainnet
    /// @param uniswapSlippage The allowed slippage on uniswap pool bps (i.e. 1% is 100)
    /// @param connextSlippage The allowed slippage on the Connext transfer in bps
    function sweep(
        address fromAsset,
        uint24 poolFee,
        uint256 amountIn,
        uint256 uniswapSlippage,
        uint256 connextSlippage
    ) external payable onlySweeper {
        _sweep (
            fromAsset,
            poolFee,
            amountIn,
            uniswapSlippage,
            connextSlippage
        );
    }

    /// @notice Moves funds from this contract to the `donationAddress` on the specified
    ///         `domain`. Swaps into `donationAddress` if needed. Defaults slippage to 1%.
    /// @param fromAsset The asset to move to mainnet
    /// @param poolFee The `poolFee` on the uniswap `fromAsset` <> `donationAsset` pool
    /// @param amountIn The amount of asset to move to mainnet
    function sweep(
        address fromAsset,
        uint24 poolFee,
        uint256 amountIn
    ) external payable onlySweeper {
        _sweep (
            fromAsset,
            poolFee,
            amountIn,
            100, // 1% default max slippage
            100 // 1% default max slippage
        );
    }

    /// @notice Moves funds from this contract to the `donationAddress` on the specified
    ///         `domain`. Swaps into `donationAddress` if needed.
    /// @param fromAsset The asset to move to mainnet
    /// @param poolFee The `poolFee` on the uniswap `fromAsset` <> `donationAsset` pool
    /// @param amountIn The amount of asset to move to mainnet
    /// @param uniswapSlippage The allowed slippage on uniswap pool bps (i.e. 1% is 100)
    /// @param connextSlippage The allowed slippage on the Connext transfer in bps
    function _sweep(
        address fromAsset,
        uint24 poolFee,
        uint256 amountIn,
        uint256 uniswapSlippage,
        uint256 connextSlippage
    ) internal {
        // Sanity check: amounts above mins
        require(amountIn > 0, "!amount");
        require(uniswapSlippage >= MIN_SLIPPAGE, "!uniswapSlippage");
        require(connextSlippage >= MIN_SLIPPAGE, "!connextSlippage");

        uint256 amountOut = amountIn;

        // wrap origin asset if needed
        if (fromAsset == address(0)) {
            weth.deposit{value: amountIn}();
            fromAsset = address(weth);
        }

        // swap to donation asset if needed
        if (fromAsset != donationAsset) {
            // Approve the uniswap router to spend fromAsset.
            TransferHelper.safeApprove(fromAsset, address(swapRouter), amountIn);

            // Convert in -> out decimals
            uint256 amountInNormalized = _normalizeDecimals(IERC20Metadata(fromAsset).decimals(), donationAssetDecimals, amountIn);

            // Set up uniswap swap params.
            ISwapRouter.ExactInputSingleParams memory params =
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: fromAsset,
                    tokenOut: donationAsset,
                    fee: poolFee,
                    recipient: address(this),
                    deadline: block.timestamp,
                    amountIn: amountIn,
                    amountOutMinimum: amountInNormalized * (10_000 - uniswapSlippage) / 10_000,
                    sqrtPriceLimitX96: 0
                });

            // The call to `exactInputSingle` executes the swap.
            amountOut = swapRouter.exactInputSingle(params);
        }

        // Approve connext to bridge donationAsset.
        if (!approvedDonationAsset) {
            approvedDonationAsset = true;
            // use max approval for assset
            TransferHelper.safeApprove(donationAsset, address(connext), MAX_INT);
        }

        // Perform connext transfer
        bytes32 transferId = connext.xcall{value: msg.value}(   
            donationDomain,         // _destination: Domain ID of the destination chain      
            donationAddress,        // _to: address receiving the funds on the destination      
            donationAsset,          // _asset: address of the token contract      
            msg.sender,             // _delegate: address that can revert or forceLocal on destination      
            amountOut,              // _amount: amount of tokens to transfer      
            connextSlippage,        // _slippage: the maximum amount of slippage the user will accept in BPS      
            bytes("")               // _callData: empty bytes because we're only sending funds    
        );
        emit Swept(transferId, donationAsset, amountOut, msg.value, msg.sender);
    }

    //////////////////// Internal functions

    function _addSweeper(address _sweeper) internal {
        require(!sweepers[_sweeper], "approved");
        sweepers[_sweeper] = true;
        emit SweeperAdded(_sweeper, msg.sender);
    }

    function _normalizeDecimals(
        uint8 _in,
        uint8 _out,
        uint256 _amount
    ) internal pure returns (uint256) {
        if (_in == _out) {
            return _amount;
        }
        // Convert this value to the same decimals as _out
        uint256 normalized = _in < _out ? _amount * (10**(_out - _in)) : _amount / (10**(_in - _out));
        return normalized;
    }
}
