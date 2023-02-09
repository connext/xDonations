// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

interface IWeth {
    function deposit() external payable;
    function withdraw(uint256 value) external;
}