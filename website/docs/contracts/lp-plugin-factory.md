---
sidebar_position: 2
---

# LPPluginFactory

**File:** `contracts/LPPluginFactory.sol`
**Inherits:** `ILPPluginFactory`, `AbstractCustomPluginFactory`, `Ownable`

The singleton deployment and administration contract. Owns and controls all `LPPlugin` instances it creates.

## Constructor

```solidity
constructor(
    address _entryPoint,
    address _WNativeToken,
    address _lpTokenFactory
)
```

| Parameter | Description |
|-----------|-------------|
| `_entryPoint` | `IAlgebraCustomPoolEntryPoint` — the Algebra entry point contract for custom pools. |
| `_WNativeToken` | Address of the Wrapped Native Token (e.g. WETH). Stored but not used by this contract directly; available to plugin logic. |
| `_lpTokenFactory` | Address of the deployed `LPTokenFactory`. |

The deploying account becomes the `Ownable` owner.

## Immutables

| Name | Type | Description |
|------|------|-------------|
| `WNativeToken` | `address` | Wrapped native token address. |
| `lpTokenFactory` | `address` | The `LPTokenFactory` used to deploy LP token contracts. |

## State Variables

| Name | Type | Description |
|------|------|-------------|
| `registry` | `mapping(address => bool)` | Tracks valid `LPPlugin` addresses. Set to `true` when a plugin is deployed via `_createPlugin`. Used as an authorisation guard on `setPlugin`, `collectFee`, and `setPluginFeeRate`. |

## Functions

### `createCustomPool` _(onlyOwner)_

```solidity
function createCustomPool(
    address creator,
    address tokenA,
    address tokenB,
    bytes calldata data
) external onlyOwner returns (address customPool)
```

Creates a new Algebra pool and a bound `LPPlugin` through the entry point. Internally calls `_createPlugin`, which deploys the plugin and registers it in `registry`.

---

### `setNonFungiblePositionManager` _(onlyOwner)_

```solidity
function setNonFungiblePositionManager(
    address manager,
    address plugin
) external onlyOwner
```

Sets the NFT position manager on the given plugin. Can only be called once per plugin.

---

### `setPluginFeeRate` _(onlyOwner)_

```solidity
function setPluginFeeRate(address plugin, uint24 newFeeRate) external onlyOwner
```

Updates the plugin fee rate. `plugin` must be in `registry`. `newFeeRate` must be < `250_000` PPM.

---

### `collectFee` _(onlyOwner)_

```solidity
function collectFee(
    address plugin,
    address token,
    uint256 maxAmount,
    address recipient
) external onlyOwner
```

Withdraws accumulated plugin fees from a registered plugin contract. Sends up to `maxAmount` of `token` to `recipient`. If the plugin's balance is less than `maxAmount`, the full balance is sent.

---

### `setPlugin` _(onlyOwner)_

```solidity
function setPlugin(address pool, address newPluginAddress) external onlyOwner
```

Replaces the active plugin on a pool. The new plugin address must be in `registry`.

---

### `setTickSpacing` _(onlyOwner)_

```solidity
function setTickSpacing(address pool, int24 newTickSpacing) external onlyOwner
```

Updates the tick spacing for a pool via the entry point.

---

### `setPluginConfig` _(onlyOwner)_

```solidity
function setPluginConfig(address pool, uint8 newConfig) external onlyOwner
```

Updates the active plugin configuration flags for a pool.

---

### `setFee`

```solidity
function setFee(address pool, uint16 newFee) external view onlyOwner
```

:::caution
This function always reverts. The pool fee is managed dynamically by the plugin via `beforeSwap`. Direct fee overrides are intentionally disabled.
:::

## Events

| Event | Parameters | Emitted When |
|-------|------------|--------------|
| `PluginDeployed` | `address indexed pool, address indexed plugin, address indexed deployer` | A new plugin is created via `_createPlugin`. |
