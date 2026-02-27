// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {ILPTokenFactory} from "./interfaces/ILPTokenFactory.sol";
import {ILPPluginFactory} from "./interfaces/ILPPluginFactory.sol";
import {LPToken} from "./LPToken.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract LPTokenFactory is ILPTokenFactory, Ownable {
    address lpPluginFactory;
    event PluginFactorySet(address);

    constructor() Ownable(msg.sender) {}

    function create(
        string memory name,
        string memory symbol
    ) external returns (address) {
        require(lpPluginFactory != address(0), "LPPluginFactory address not set");
        require(ILPPluginFactory(lpPluginFactory).registry(msg.sender), "Unauthorized");
        LPToken token = new LPToken(name, symbol);
        token.transferOwnership(msg.sender);
        return address(token);
    }

    function setPluginFactory(address factory) onlyOwner external {
        lpPluginFactory = factory;
        emit PluginFactorySet(factory);
    }
}