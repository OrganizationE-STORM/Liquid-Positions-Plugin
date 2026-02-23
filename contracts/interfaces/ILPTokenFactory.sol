// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ILPTokenFactory {
    function create(string memory, string memory) external returns(address);
}