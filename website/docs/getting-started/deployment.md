---
sidebar_position: 1
---

# Deployment

This guide covers how to deploy the full Liquid Positions plugin system against an existing Algebra Integral deployment.

## Prerequisites

- An Algebra Integral `AlgebraFactory` and `IAlgebraCustomPoolEntryPoint` already deployed on your target network.
- The address of the Wrapped Native Token (e.g. WETH, WMATIC) on the network.
- An account with enough gas to deploy four contracts and run several configuration transactions.

## Deployment Order

The contracts must be deployed in the following order because each step depends on the previous one.

### 1. Deploy `LPTokenFactory`

`LPTokenFactory` has no constructor arguments.

```solidity
LPTokenFactory lpTokenFactory = new LPTokenFactory();
```

At this point `lpTokenFactory` does not yet know the plugin factory address — that is set in step 3.

### 2. Deploy `LPPluginFactory`

```solidity
LPPluginFactory pluginFactory = new LPPluginFactory(
    entryPoint,       // IAlgebraCustomPoolEntryPoint address
    WNativeToken,     // Wrapped native token address (e.g. WETH)
    address(lpTokenFactory)
);
```

The deploying account becomes the owner of `LPPluginFactory`.

### 3. Wire `LPTokenFactory` to `LPPluginFactory`

```solidity
lpTokenFactory.setPluginFactory(address(pluginFactory));
```

This step authorises registered `LPPlugin` instances to call `LPTokenFactory.create()`. It must be called before any pool is created.

### 4. Create a Pool

Each pool has its own `LPPlugin` instance. The pool and plugin are created together in one call:

```solidity
address pool = pluginFactory.createCustomPool(
    creator,   // address credited as the pool creator (can be address(0))
    tokenA,
    tokenB,
    bytes("")  // optional extra data passed to the entry point
);
```

Internally this calls `IAlgebraCustomPoolEntryPoint.createCustomPool`, which deploys the `AlgebraPool` and triggers `_createPlugin` on the factory. `_createPlugin` deploys a new `LPPlugin` (which in turn deploys its own `LPCallback`) and records it in `registry`.

To retrieve the plugin address after creation:

```solidity
address pluginAddr = IAlgebraPool(pool).plugin();
```

### 5. Initialize the Pool

The Algebra pool must be initialized with a starting price before liquidity can be added.

```solidity
// encodePriceSqrt(amountToken1, amountToken0) gives the sqrt price as a Q64.96 fixed-point number.
// For a 1:1 starting price:
uint160 initialSqrtPrice = 79228162514264337593543950336; // sqrt(1) * 2^96

IAlgebraPool(pool).initialize(initialSqrtPrice);
```

### 6. Set the NFT Position Manager

This step is required to enable the NFT migration path (`onERC721Received`). It can only be called once per plugin and is gated to the factory owner.

```solidity
pluginFactory.setNonFungiblePositionManager(
    nftPositionManagerAddress,
    pluginAddr
);
```

Once set, the `nonFungiblePositionManager` address in the plugin is immutable.

## Post-Deployment Configuration

### Adjusting the Plugin Fee Rate

The default plugin fee rate is `50_000` PPM (5% of the pool's base fee). To change it:

```solidity
// newFeeRate must be < 250_000 PPM (25% of base fee)
pluginFactory.setPluginFeeRate(pluginAddr, newFeeRate);
```

### Adjusting Tick Spacing

```solidity
pluginFactory.setTickSpacing(pool, newTickSpacing);
```

## Deployment Summary

| Step | Call | Who |
|------|------|-----|
| 1 | `new LPTokenFactory()` | Deployer |
| 2 | `new LPPluginFactory(entryPoint, WNativeToken, lpTokenFactory)` | Deployer |
| 3 | `lpTokenFactory.setPluginFactory(pluginFactory)` | `LPTokenFactory` owner |
| 4 | `pluginFactory.createCustomPool(creator, tokenA, tokenB, data)` | `LPPluginFactory` owner |
| 5 | `pool.initialize(sqrtPriceX96)` | Anyone |
| 6 | `pluginFactory.setNonFungiblePositionManager(nftManager, plugin)` | `LPPluginFactory` owner |
