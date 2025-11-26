// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;
import "@cryptoalgebra/integral-core/contracts/libraries/LiquidityMath.sol";

contract TestUtils {
    constructor() {}
    
    function getAmountsForLiquidity2(
        int24 bottomTick,
        int24 topTick,
        int128 liquidityDelta,
        int24 currentTick,
        uint160 currentPrice
    )
        external
        pure
        returns (uint256 amount0, uint256 amount1, int128 globalLiquidityDelta)
    {
        return LiquidityMath.getAmountsForLiquidity(
            bottomTick,
            topTick,
            liquidityDelta,
            currentTick,
            currentPrice
        );
    }
}
