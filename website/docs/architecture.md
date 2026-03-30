---
sidebar_position: 2
---

# Architecture

The system is composed of five contracts that work together. The diagram below shows how they relate to each other and to the Algebra Integral protocol.

```
User / DeFi Protocol
        │
        │  deposit() / withdraw() / safeTransferFrom(NFT)
        ▼
  ┌─────────────┐       hooks (beforeSwap, beforeModifyPosition,
  │  LPPlugin   │◄──────afterModifyPosition, beforeInitialize)
  │  (per pool) │◄──────────────────────────────────────────── AlgebraPool
  └──────┬──────┘
         │ deploys                    mints/burns
         │         ┌────────────┐ ◄──────────────── LPPlugin (onlyOwner)
         │         │  LPToken   │
         │         │ (per range)│
         │         └────────────┘
         │
         │ creates via
         ▼
  ┌──────────────────┐          deploys
  │  LPTokenFactory  │◄──────────────────── LPPlugin (_mintLPTokens)
  └──────────────────┘
         ▲
         │ authorises
  ┌──────────────────┐
  │ LPPluginFactory  │── owns/configures ──► LPPlugin instances
  │   (singleton)    │── createCustomPool ──► AlgebraPool + LPPlugin
  └──────────────────┘
         │ deploys per plugin
         ▼
  ┌──────────────┐
  │  LPCallback  │◄── mint() called by LPPlugin
  │  (per pool)  │──► algebraMintCallback() called by AlgebraPool
  └──────────────┘
```

## Contract Roles

### LPPlugin

The core contract. One instance is deployed per Algebra pool. It:

- Hooks into pool position and swap events via the Algebra plugin interface.
- Maintains a mapping from tick ranges to their corresponding LPToken addresses (`lpTokenByTicks`).
- Accepts direct token deposits (`deposit`) and NFT migrations (`onERC721Received`).
- Manages withdrawals (`withdraw`), burning LP tokens and returning underlying assets plus fees.
- Applies a configurable plugin fee on every swap.

### LPPluginFactory

The singleton deployment and administration contract. It:

- Creates Algebra pools and their bound `LPPlugin` instances via `createCustomPool`.
- Maintains a `registry` of valid plugin addresses (used for authorization).
- Provides owner-gated controls: tick spacing, plugin replacement, fee configuration, and fee collection.

### LPCallback

A helper deployed once per `LPPlugin` during construction. It implements Algebra's `IAlgebraMintCallback` interface, handling the token transfer to the pool when a new position is opened. Only the owning `LPPlugin` can call `mint()` on it.

### LPToken

A standard ERC-20 representing shares in one specific tick range. One `LPToken` is deployed the first time liquidity is deposited into a given `(tickLower, tickUpper)` pair. Mint and burn are restricted to the owning `LPPlugin`.

**Naming convention:**
- Name: `LPToken {token0Symbol}-{token1Symbol} {tickLower}-{tickUpper}`
- Symbol: `{token0Symbol}-{token1Symbol} {tickLower}-{tickUpper}`

Example for an ETH/USDC pool at ticks −60 to 60: name = `LPToken ETH-USDC -60-60`, symbol = `ETH-USDC -60-60`.

### LPTokenFactory

A stateless factory that deploys `LPToken` instances and immediately transfers ownership to the calling `LPPlugin`. Calls to `create()` are gated to addresses registered in `LPPluginFactory.registry`.

## Lifecycle of a Deposit

```
1. User calls LPPlugin.deposit(recipient, tickLower, tickUpper, amount0, amount1, ...)
2. Plugin pulls tokens from msg.sender and approves LPCallback.
3. Plugin calls LPCallback.mint(recipient, tickLower, tickUpper, amount0, amount1).
4. LPCallback computes optimal liquidity and calls AlgebraPool.mint().
5. AlgebraPool calls LPCallback.algebraMintCallback() — tokens are transferred to the pool.
6. AlgebraPool triggers LPPlugin.beforeModifyPosition():
   └─ Plugin snapshots current position value (initialValue) and sqrt price.
7. AlgebraPool triggers LPPlugin.afterModifyPosition():
   └─ Plugin calls _mintLPTokens():
      ├─ First deposit for this range → deploys new LPToken, mints 10^32 shares.
      └─ Subsequent deposits → mints shares = depositValue × totalSupply / initialValue.
8. LP tokens land in the plugin; plugin transfers them to recipient.
```

## Lifecycle of a Withdrawal

```
1. User calls LPPlugin.withdraw(recipient, tickLower, tickUpper, lpTokensToBurn, ...)
2. Plugin burns lpTokensToBurn from msg.sender.
3. Plugin reads current liquidity and accrued fees from AlgebraPool.positions().
4. Plugin calls AlgebraPool.burn() removing proportional liquidity.
5. Plugin calls AlgebraPool.collect() to claim principal + proportional fees.
6. Tokens are sent to recipient; slippage bounds checked.
```

## Plugin Fee Mechanism

On every swap, `beforeSwap` is triggered. The plugin returns a dynamic fee:

```
pluginFee = baseFee × pluginFeeRate / 1_000_000
```

`pluginFeeRate` is expressed in parts per million (PPM). The default is `50_000` (5% of the base fee). The maximum allowed is `250_000` (25%). Collected fees accumulate inside the plugin and are withdrawable only by the `LPPluginFactory` owner via `collectFee`.
