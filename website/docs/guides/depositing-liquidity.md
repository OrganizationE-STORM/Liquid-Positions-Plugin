---
sidebar_position: 1
---

# Depositing Liquidity

Users deposit tokens directly into the plugin using `LPPlugin.deposit()`. In return they receive LPTokens representing their share of the aggregated position for that tick range.

## Function Signature

```solidity
function deposit(
    address recipient,
    int24   tickLower,
    int24   tickUpper,
    uint256 amount0,
    uint256 amount1,
    uint256 minLPTokens,
    uint256 deadline
) external
```

| Parameter | Description |
|-----------|-------------|
| `recipient` | Address that will receive the minted LPTokens. Can differ from `msg.sender`. |
| `tickLower` | Lower tick of the price range to deposit into. Must be a valid Algebra tick. |
| `tickUpper` | Upper tick of the price range to deposit into. |
| `amount0` | Amount of `token0` to deposit. |
| `amount1` | Amount of `token1` to deposit. |
| `minLPTokens` | Minimum LPTokens to receive. Reverts if fewer are minted (slippage protection). |
| `deadline` | Unix timestamp after which the transaction reverts. |

## Step-by-Step

### 1. Approve the plugin

The plugin pulls tokens from `msg.sender` using `transferFrom`. Approve both tokens before calling `deposit`:

```solidity
IERC20(token0).approve(pluginAddress, amount0);
IERC20(token1).approve(pluginAddress, amount1);
```

### 2. Call `deposit`

```solidity
plugin.deposit(
    msg.sender,   // recipient of LP tokens
    tickLower,
    tickUpper,
    amount0,
    amount1,
    minLPTokens,
    block.timestamp + 300  // 5-minute deadline
);
```

### 3. Receive LPTokens

After the call, `recipient` holds LPTokens for the `(tickLower, tickUpper)` range. You can query the LP token address with:

```solidity
address lpTokenAddr = plugin.lpTokenByTicks(tickLower, tickUpper);
uint256 balance = IERC20(lpTokenAddr).balanceOf(recipient);
```

## How Many LPTokens Will I Receive?

### First deposit into a new range

The first depositor into any tick range receives exactly `10^32` LPTokens, regardless of the amounts deposited. This establishes the baseline supply.

### Subsequent deposits into an existing range

LPTokens are minted proportionally to the value contributed relative to the current position value, both denominated in `token1` at the current pool price:

```
lpTokensToMint = depositValue × totalSupply / positionValueBeforeDeposit
```

Where `depositValue = amount1 + convertToken0ToToken1(amount0, sqrtPrice)`.

This formula ensures that a depositor who doubles the pool's value receives exactly half of the resulting supply — no dilution or inflation regardless of entry timing.

## Unused Tokens

The plugin computes the maximum liquidity achievable from `(amount0, amount1)` given the current pool price and tick range. Because concentrated liquidity positions are constrained by the price range, one token may be the binding constraint and a small residual of the other remains in the plugin contract. Pass amounts sized appropriately for the current price to minimise leftover.

:::tip
If the current price is entirely outside the tick range you are depositing into, only one token will be consumed. The other will remain in the plugin. Use the `positionValue` view function to estimate the current range value and size inputs accordingly.
:::

## Estimating `minLPTokens`

Query the current LP token supply and position value off-chain before submitting:

```typescript
const lpTokenAddr = await plugin.lpTokenByTicks(tickLower, tickUpper);
const totalSupply = await lpToken.totalSupply();
const sqrtPrice   = (await pool.safelyGetStateOfAMM()).sqrtPrice;
const posValue    = await plugin.positionValue(tickLower, tickUpper, sqrtPrice);

const depositValue = amount1 + convertToken0ToToken1(amount0, sqrtPrice);
const expected     = depositValue * totalSupply / posValue;
const minLPTokens  = expected * 99n / 100n; // 1% slippage tolerance
```
