// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface ILPTokenFactory {
    function create(string memory, string memory) external returns(address);
}