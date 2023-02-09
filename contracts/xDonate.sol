// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;
import {IConnext} from "@connext/smart-contracts/contracts/core/connext/interfaces/IConnext.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';

/**
    @notice The xDonate contract helps you accept donations from any chain to a pre-specified
            donationAddress and donationDomain.

            The contract expects users to transfer tokens to it, and then implements a single 
            onlyOwner function, sweep, that swaps the token on uniswap if fromAsset and donationAsset
            are different, then xcalls donationAsset to the donation address/domain.
 */

contract xDonate is Ownable {
    ISwapRouter public immutable swapRouter;
    IConnext public immutable connext;

    address public immutable donationAddress;
    uint32 public immutable donationDomain;

    uint24 public constant poolFee = 3000;
    
    constructor(
        ISwapRouter _swapRouter,
        IConnext _connext,
        address _donationAddress,
        uint32 _donationDomain
    ) {
        swapRouter = _swapRouter;
        connext = _connext;
        donationAddress = _donationAddress;
        donationDomain = _donationDomain;
    }

    function sweep (
        address fromAsset,
        uint256 amountIn,
        address donationAsset,
        uint256 uniswapSlippage,
        uint256 connextSlippage
    ) external payable onlyOwner {
        _sweep (
            fromAsset,
            amountIn,
            donationAsset,
            uniswapSlippage,
            connextSlippage
        );
    }

    function sweep (
        address fromAsset,
        uint256 amountIn,
        address donationAsset
    ) external payable onlyOwner {
        _sweep (
            fromAsset,
            amountIn,
            donationAsset,
            30, // 0.3% default max slippage
            100 // 1% default max slippage
        );
    }

    function _sweep (
        address fromAsset,
        uint256 amountIn,
        address donationAsset,
        uint256 uniswapSlippage,
        uint256 connextSlippage
    ) internal {
        uint256 amountOut = amountIn;
        if (fromAsset != donationAsset) {
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
                    amountOutMinimum: amountIn * (10000 - uniswapSlippage) / 10000,
                    sqrtPriceLimitX96: 0
                });

            // The call to `exactInputSingle` executes the swap.
            amountOut = swapRouter.exactInputSingle(params);
        }
        // Approve connext to bridge donationAsset.
        TransferHelper.safeApprove(donationAsset, address(connext), amountOut);

            connext.xcall{value: msg.value}(   
                donationDomain,         // _destination: Domain ID of the destination chain      
                donationAddress,        // _to: address receiving the funds on the destination      
                donationAsset,          // _asset: address of the token contract      
                donationAddress,        // _delegate: address that can revert or forceLocal on destination      
                IERC20(donationAsset).balanceOf(address(this)),            // _amount: amount of tokens to transfer      
                connextSlippage,                     // _slippage: the maximum amount of slippage the user will accept in BPS      
                "0x"                    // _callData: empty bytes because we're only sending funds    
            );
    }
}
