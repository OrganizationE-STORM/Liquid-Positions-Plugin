---
sidebar_position: 4
---

# LPTokenFactory

**File:** `contracts/LPTokenFactory.sol`
**Inherits:** `ILPTokenFactory`, `Ownable`

A stateless factory that deploys `LPToken` instances on demand. It acts as a security checkpoint: only `LPPlugin` addresses registered in `LPPluginFactory.registry` can call `create()`.

## Deployment and Wiring

`LPTokenFactory` is deployed independently and then wired to `LPPluginFactory` in two steps:

1. Deploy `LPTokenFactory`.
2. Call `LPTokenFactory.setPluginFactory(lpPluginFactoryAddress)` (owner only).

Without step 2, any call to `create()` will revert with `"LPPluginFactory address not set"`.

## Functions

### `create`

```solidity
function create(
    string memory name,
    string memory symbol
) external returns (address)
```

Deploys a new `LPToken(name, symbol)`, then immediately transfers its ownership to `msg.sender` (the calling `LPPlugin`).

**Access control:** `msg.sender` must be registered in `LPPluginFactory.registry`. Reverts with `"Unauthorized"` otherwise.

Called internally by `LPPlugin._mintLPTokens()` when liquidity is first deposited into a new tick range.

---

### `setPluginFactory` _(onlyOwner)_

```solidity
function setPluginFactory(address factory) external onlyOwner
```

Sets the `LPPluginFactory` address used for registry lookups. Must be called once after deployment before any pools are created.

## Events

| Event | Parameters | Emitted When |
|-------|------------|--------------|
| `PluginFactorySet` | `address factory` | `setPluginFactory` is called. |
