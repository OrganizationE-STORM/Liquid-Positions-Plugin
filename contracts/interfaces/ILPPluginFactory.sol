// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

interface ILPPluginFactory {
    function registry(address) external returns (bool);
    function WNativeToken() external returns (address);
    function lpTokenFactory() external returns(address);
}
