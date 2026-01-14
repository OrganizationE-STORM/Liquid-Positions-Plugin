// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ILPTokenFactory} from "./interfaces/ILPTokenFactory.sol";
import {LPToken} from "./LPToken.sol";
import "hardhat/console.sol";

contract LPTokenFactory is ILPTokenFactory {
    constructor() {}

    function create(string memory symbol, string memory name) external returns(address) {
        LPToken token = new LPToken(symbol, name);
        token.transferOwnership(msg.sender);
        return address(token);
    }
}