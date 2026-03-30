---
sidebar_position: 5
---

# LPCallback

**File:** `contracts/LPCallback.sol`
**Implements:** `ILPCallback` (`IAlgebraMintCallback`)

A lightweight helper deployed once per `LPPlugin` at construction time. It holds no state beyond its three immutable addresses. Its sole purpose is to act as the payer when the Algebra pool requests tokens during a mint operation.

:::note
End users never interact with `LPCallback` directly. All calls flow through `LPPlugin`.
:::

## Immutables

| Name | Type | Description |
|------|------|-------------|
| `pool` | `address` | The Algebra pool this callback serves. |
| `pluginFactory` | `address` | The factory that owns the system (stored for context; not used in access control here). |
| `plugin` | `address` | The `LPPlugin` that owns this callback. Only this address may call `mint()`. |

## Functions

### `mint`

```solidity
function mint(
    address leftoversRecipient,
    int24   tickLower,
    int24   tickUpper,
    uint256 amount0,
    uint256 amount1
) external returns (uint256 amount0Returned, uint256 amount1Returned, uint128 returnedLiquidity)
```

Calculates the maximum liquidity achievable from `amount0` and `amount1` at the current pool price, then calls `AlgebraPool.mint()` with the resulting liquidity amount.

- `leftoversRecipient` is passed as the `recipient` argument to `pool.mint()` — the Algebra pool uses this address for any leftover amounts in edge cases.
- Returns the actual amounts consumed and the liquidity added.

**Access control:** Only callable by the owning `LPPlugin`. Reverts with `"Only plugin"` otherwise.

---

### `algebraMintCallback`

```solidity
function algebraMintCallback(
    uint256 amount0Owed,
    uint256 amount1Owed,
    bytes calldata data
) external override
```

Called by `AlgebraPool` during `pool.mint()` to request payment. The callback decodes the payer address from `data` and transfers `amount0Owed` and `amount1Owed` from the payer (the `LPPlugin`) to the pool.

**Access control:** Only callable by the pool. Reverts with `"Invalid caller of callback"` otherwise.

The payer (`LPPlugin`) must have pre-approved `LPCallback` to spend both tokens before calling `mint()`.

## Events

| Event | Parameters | Emitted When |
|-------|------------|--------------|
| `PositionMinted` | `uint256 amount0, uint256 amount1, uint128 liquidity` | A successful `mint()` completes. |
