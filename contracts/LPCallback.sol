// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol";
import "./interfaces/ILPPluginFactory.sol";
import "@cryptoalgebra/integral-periphery/contracts/interfaces/external/IWNativeToken.sol";
import "@cryptoalgebra/integral-periphery/contracts/libraries/TransferHelper.sol";
import "@cryptoalgebra/integral-periphery/contracts/libraries/LiquidityAmounts.sol";
import "@cryptoalgebra/integral-core/contracts/libraries/TickMath.sol";
import "./interfaces/ILPCallback.sol";

contract LPCallback is ILPCallback {
    address public immutable pool;
    address internal immutable pluginFactory;
    address public immutable plugin;
    PoolAddress.PoolKey internal poolKey;

    event PositionMinted(uint256 amount0, uint256 amount1, uint128 liquidity);

    constructor(address _pool, address _pluginFactory, address _plugin) {
        pool = _pool;
        pluginFactory = _pluginFactory;
        plugin = _plugin;
        poolKey = PoolAddress.PoolKey({
            deployer: address(0),
            token0: address(0),
            token1: address(0)
        });
    }

    function algebraMintCallback(
        uint256 amount0Owed,
        uint256 amount1Owed,
        bytes calldata data
    ) external override {
        CallbackStructs.MintCallbackData memory decoded = abi.decode(
            data,
            (CallbackStructs.MintCallbackData)
        );
        require(msg.sender == pool, "Invalid caller of callback");
        IAlgebraPool algebraPool = IAlgebraPool(pool);

        if (amount0Owed > 0)
            TransferHelper.safeTransferFrom(algebraPool.token0(), decoded.payer, msg.sender, amount0Owed);
        if (amount1Owed > 0)
            TransferHelper.safeTransferFrom(algebraPool.token1(), decoded.payer, msg.sender, amount1Owed);
    }

    function mint(
        address leftoversRecipient,
        int24 tickLower,
        int24 tickUpper,
        uint256 amount0,
        uint256 amount1
    )
        external
        override
        returns (
            uint256 amount0Returned,
            uint256 amount1Returned,
            uint128 returnedLiquidity
        )
    {
        (uint160 price, , , , , ) = IAlgebraPool(pool).globalState();
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            price,
            TickMath.getSqrtRatioAtTick(tickLower),
            TickMath.getSqrtRatioAtTick(tickUpper),
            amount0,
            amount1
        );

        (amount0Returned, amount1Returned, returnedLiquidity) = IAlgebraPool(
            pool
        ).mint(
                leftoversRecipient,
                plugin,
                tickLower,
                tickUpper,
                liquidity,
                abi.encode(
                    CallbackStructs.MintCallbackData({
                        poolKey: poolKey,
                        payer: msg.sender
                    })
                )
            );

        emit PositionMinted(
            amount0Returned,
            amount1Returned,
            returnedLiquidity
        );
    }
}
