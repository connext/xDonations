// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;
import {IConnext} from "@connext/smart-contracts/contracts/core/connext/interfaces/IConnext.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

import {IWeth} from "./interfaces/IWeth.sol";

/**
    @notice The xDonate contract helps you accept donations from any chain to a pre-specified
            donationAddress and donationDomain.

            The contract expects users to transfer tokens to it, and then implements a single 
            onlyOwner function, sweep, that swaps the token on uniswap if fromAsset and donationAsset
            are different, then xcalls donationAsset to the donation address/domain.
 */

contract xDonate {
    uint256 public constant MAX_INT = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;
    uint256 public constant MIN_SLIPPAGE = 10; // 0.1% is min slippage
    event Swept(bytes32 indexed crosschainId, address donationAsset, uint256 donationAmount, uint256 relayerFee, address sweeper);
    event SweeperAdded(address indexed added, address indexed caller);
    event SweeperRemoved(address indexed removed, address indexed caller);

    ISwapRouter public immutable swapRouter;
    IConnext public immutable connext;
    IWeth public immutable weth;

    address public immutable donationAddress;
    address public immutable donationAsset; // should be USDC
    uint32 public immutable donationDomain;

    bool public approvedDonationAsset;
    uint8 public immutable donationAssetDecimals;

    mapping(address => bool) public sweepers;
    
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

    modifier onlySweeper {
        require(sweepers[msg.sender], "!sweeper");
        _;
    }

    function addSweeper(address _sweeper) external onlySweeper {
        _addSweeper(_sweeper);
    }

    function _addSweeper(address _sweeper) internal {
        require(!sweepers[_sweeper], "approved");
        sweepers[_sweeper] = true;
        emit SweeperAdded(_sweeper, msg.sender);
    }

    function removeSweeper(address _sweeper) external onlySweeper {
        require(sweepers[_sweeper], "!approved");
        sweepers[_sweeper] = false;
        emit SweeperRemoved(_sweeper, msg.sender);
    }

    function sweep (
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

    function sweep (
        address fromAsset,
        uint24 poolFee,
        uint256 amountIn
    ) external payable onlySweeper {
        _sweep (
            fromAsset,
            poolFee,
            amountIn,
            1000, // 1% default max slippage
            100 // 1% default max slippage
        );
    }

    function _sweep (
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
            uint256 amountInNormalized = normalizeDecimals(IERC20Metadata(fromAsset).decimals(), donationAssetDecimals, amountIn);

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

    function normalizeDecimals(
        uint8 _in,
        uint8 _out,
        uint256 _amount
    ) internal pure returns (uint256) {
        if (_in == _out) {
            return _amount;
        }
        // Convert this value to the same decimals as _out
        uint256 normalized;
        if (_in < _out) {
            normalized = _amount * (10**(_out - _in));
        } else {
            normalized = _amount / (10**(_in - _out));
        }
        return normalized;
    }

    receive() external payable {}
}
