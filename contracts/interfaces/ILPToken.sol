// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";

interface ILPToken is IERC20 {
    function mint(address, uint256) external;
    function burn(address, uint256) external;
    function transferOwnership(address newOwner) external;
}