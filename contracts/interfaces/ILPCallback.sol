// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@cryptoalgebra/integral-core/contracts/interfaces/callback/IAlgebraMintCallback.sol";
import "../libraries/CallbackStructs.sol";

interface ILPCallback is IAlgebraMintCallback {

    function mint(
        address leftoversRecipient,
        int24 tickLower,
        int24 tickUpper,
        uint256 amount0,
        uint256 amount1
    ) external returns (uint256, uint256, uint128);

}