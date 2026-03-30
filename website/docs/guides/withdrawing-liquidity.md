---
sidebar_position: 2
---

# Withdrawing Liquidity

Call `LPPlugin.withdraw()` to burn LPTokens and receive the proportional share of pooled tokens and accrued fees.

## Function Signature

```solidity
function withdraw(
    address recipient,
    int24   tickLower,
    int24   tickUpper,
    uint128 lpTokensToBurn,
    uint256 amount0Min,
    uint256 amount1Min
) external returns (uint256 amount0, uint256 amount1)
```

| Parameter | Description |
|-----------|-------------|
| `recipient` | Address that receives the withdrawn tokens. Can differ from `msg.sender`. |
| `tickLower` | Lower tick of the range to withdraw from. |
| `tickUpper` | Upper tick of the range to withdraw from. |
| `lpTokensToBurn` | Number of LPTokens to redeem. Must be ≤ `msg.sender`'s balance. |
| `amount0Min` | Minimum `token0` to receive. Reverts on slippage. |
| `amount1Min` | Minimum `token1` to receive. Reverts on slippage. |

Returns the actual amounts of `token0` and `token1` sent to `recipient`.

## Step-by-Step

### 1. Find the LP token address

```solidity
address lpTokenAddr = plugin.lpTokenByTicks(tickLower, tickUpper);
```

### 2. Check your balance

```solidity
uint256 myBalance = IERC20(lpTokenAddr).balanceOf(msg.sender);
```

### 3. Approve the plugin to burn your tokens

The plugin calls `lpToken.burn(msg.sender, amount)` which requires the plugin to be the LPToken owner — this approval is implicit (the plugin is the token owner). No `approve` call from the user is needed.

### 4. Call `withdraw`

```solidity
(uint256 received0, uint256 received1) = plugin.withdraw(
    msg.sender,       // recipient
    tickLower,
    tickUpper,
    uint128(lpTokensToBurn),
    amount0Min,
    amount1Min
);
```

## What Do I Get Back?

Your withdrawal covers two components:

**1. Proportional principal** — your share of the liquidity currently in the pool position:

```
liquidityToRemove = lpTokensToBurn × positionLiquidity / totalLPSupply
```

**2. Proportional accrued fees** — your share of uncollected fees sitting in the position:

```
fees0Share = lpTokensToBurn × accruedFees0 / totalLPSupply
fees1Share = lpTokensToBurn × accruedFees1 / totalLPSupply
```

Both are collected in the same transaction and sent to `recipient`.

## Partial Withdrawals

You do not need to burn your entire balance. Burn any fraction to receive the proportional share:

```solidity
uint256 half = IERC20(lpTokenAddr).balanceOf(msg.sender) / 2;
plugin.withdraw(recipient, tickLower, tickUpper, uint128(half), 0, 0);
```

## Estimating Output Before Withdrawing

```typescript
const lpToken    = await ethers.getContractAt('IERC20', lpTokenAddr);
const totalSupply = await lpToken.totalSupply();

const [liquidity,,, fees0, fees1] = await pool.positions(
  getPositionKey(pluginAddr, tickLower, tickUpper)
);

const sqrtPrice = (await pool.safelyGetStateOfAMM()).sqrtPrice;
const [amount0, amount1] = LiquidityAmounts.getAmountsForLiquidity(
  sqrtPrice,
  getSqrtRatioAtTick(tickLower),
  getSqrtRatioAtTick(tickUpper),
  (lpTokensToBurn * liquidity) / totalSupply
);

const total0 = amount0 + (lpTokensToBurn * fees0) / totalSupply;
const total1 = amount1 + (lpTokensToBurn * fees1) / totalSupply;
```

Apply a slippage buffer (e.g. 0.5%) before passing `amount0Min` / `amount1Min`.
