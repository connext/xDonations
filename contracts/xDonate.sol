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

    //////////////////// Constants
    /// @notice Stores the UINT.MAX for infinite approvals
    uint256 public constant MAX_INT = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;

    /// @notice Stores the lower bound for slippage used in sweep as sanity check
    uint256 public constant MIN_SLIPPAGE = 10; // 0.1% is min slippage

    //////////////////// Storage
    /// @notice UniswapV3 swap router contract to swap into `donationAsset`
    /// @dev If deploying to celo, change hardcoded address. see https://docs.uniswap.org/contracts/v3/reference/deployments
    ISwapRouter public immutable swapRouter = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);

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

    /// @notice Caches the decimals for the donation address.
    /// @dev Used to generate the minimum amount out when swapping into donation address on `sweep`
    uint8 public immutable donationAssetDecimals;

    /// @notice Mapping that contains addresses permissioned to edit the whitelist / sweep
    mapping(address => bool) public sweepers;
    
    //////////////////// Constructor
    constructor(
        IConnext _connext,
        IWeth _weth,
        address _donationAddress,
        address _donationAsset,
        uint32 _donationDomain
    ) {
        connext = _connext;
        weth = _weth;
        donationAddress = _donationAddress;
        donationAsset = _donationAsset;
        donationDomain = _donationDomain;
        // initialize deployer as sweeper
        _addSweeper(msg.sender);
        // initialize decimals
        donationAssetDecimals = IERC20Metadata(_donationAsset).decimals();
        // set max approval of connext to spend assset
        TransferHelper.safeApprove(donationAsset, address(connext), MAX_INT);
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

    /// @notice Moves funds from this contract to the `donationAddress` on the specified
    ///         `domain`. Swaps into `donationAddress` if needed.
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
    ) external payable onlySweeper {
        // Sanity check: amounts above mins
        require(amountIn > 0, "!amount");
        require(amountOutMin > 0, "!amountOut");
        require(connextSlippage >= MIN_SLIPPAGE, "!connextSlippage");

        uint256 amountOut = amountIn;

        // wrap origin asset if needed
        if (fromAsset == address(0)) {
            weth.deposit{value: amountIn}();
            fromAsset = address(weth);
        }

        // swap to donation asset if needed
        if (fromAsset != donationAsset) {
            amountOut = _swapForDonationAsset(fromAsset, poolFee, amountOutMin, amountIn);
        }

        // NOTE: max approval done in constructor

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

    function _swapForDonationAsset(
        address fromAsset,
        uint24 poolFee,
        uint256 amountOutMin,
        uint256 amountIn
    ) internal returns (uint256) {
        // Approve the uniswap router to spend fromAsset.
        TransferHelper.safeApprove(fromAsset, address(swapRouter), amountIn);

        // Set up uniswap swap params.
        ISwapRouter.ExactInputSingleParams memory params =
            ISwapRouter.ExactInputSingleParams({
                tokenIn: fromAsset,
                tokenOut: donationAsset,
                fee: poolFee,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: amountOutMin,
                sqrtPriceLimitX96: 0
            });

        // The call to `exactInputSingle` executes the swap.
        return swapRouter.exactInputSingle(params);
    }

    function _addSweeper(address sweeper) internal {
        require(!sweepers[sweeper], "approved");
        sweepers[sweeper] = true;
        emit SweeperAdded(sweeper, msg.sender);
    }
}
