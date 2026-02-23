// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ILPTokenFactory} from "./interfaces/ILPTokenFactory.sol";
import {LPToken} from "./LPToken.sol";

contract LPTokenFactory is ILPTokenFactory {
    constructor() {}

    function create(string memory name, string memory symbol) external returns(address) {
        LPToken token = new LPToken(name, symbol);
        token.transferOwnership(msg.sender);
        return address(token);
    }
}