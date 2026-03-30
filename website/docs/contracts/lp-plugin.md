---
sidebar_position: 1
---

# LPPlugin

**File:** `contracts/LPPlugin.sol`
**Inherits:** `AbstractPlugin`, `IERC721Receiver`

The core contract. One instance is deployed per Algebra pool. It hooks into pool lifecycle events and owns the aggregated liquidity position on behalf of all depositors.

## Immutables

| Name | Type | Description |
|------|------|-------------|
| `pool` | `address` | The Algebra pool this plugin is bound to (set by `AbstractPlugin`). |
| `pluginFactory` | `address` | The `LPPluginFactory` that deployed this plugin. |
| `callback` | `address` | The `LPCallback` contract deployed in the constructor. |

## State Variables

| Name | Type | Description |
|------|------|-------------|
| `pluginFeeRate` | `uint24` | Fee rate in PPM applied on swaps. Default: `50_000`. Max: `250_000`. |
| `nonFungiblePositionManager` | `address` | Set once by the factory. Required for NFT migration. Starts as `address(0)`. |
| `lpTokenByTicks` | `mapping(int24 => mapping(int24 => address))` | Maps `(tickLower, tickUpper)` to the LPToken address for that range. `address(0)` if no deposit has been made in that range yet. |

## Constants

| Name | Value | Description |
|------|-------|-------------|
| `defaultPluginConfig` | `AFTER_POSITION_MODIFY_FLAG \| BEFORE_SWAP_FLAG \| BEFORE_POSITION_MODIFY_FLAG \| DYNAMIC_FEE` | Plugin hook flags registered with the pool on initialisation. |
| `INITIAL_LP_TOKEN_TO_MINT` | `10^32` | Fixed amount minted to the first depositor in a new range. |

## User-Facing Functions

### `deposit`

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

Pulls `amount0` and `amount1` from `msg.sender`, invests them into the shared position for `(tickLower, tickUpper)`, and transfers the resulting LPTokens to `recipient`.

Reverts if:
- `block.timestamp > deadline`
- LPTokens minted < `minLPTokens`

See [Depositing Liquidity](../guides/depositing-liquidity.md) for a full walkthrough.

---

### `withdraw`

```solidity
function withdraw(
    address recipient,
    int24   tickLower,
    int24   tickUpper,
    uint128 lpTokensToBurn,
    uint256 amount0Min,
    uint256 amount1Min
) public returns (uint256 amount0, uint256 amount1)
```

Burns `lpTokensToBurn` LP tokens from `msg.sender` and sends the proportional share of principal and accrued fees to `recipient`.

Reverts if:
- `lpTokensToBurn == 0`
- `msg.sender` balance < `lpTokensToBurn`
- `amount0 < amount0Min` or `amount1 < amount1Min`

---

### `onERC721Received`

```solidity
function onERC721Received(
    address,
    address from,
    uint256 tokenId,
    bytes calldata data
) external override returns (bytes4)
```

ERC-721 callback. Called when the `NonfungiblePositionManager` sends an NFT to this contract. Migrates the NFT's liquidity into the shared position and sends LPTokens to `from`.

`data` must be ABI-encoded as `(uint256 amount0Min, uint256 amount1Min, uint256 deadline, uint256 minLPTokens)`.

Reverts if:
- `msg.sender != nonFungiblePositionManager`
- NFT tokens do not match the pool
- `block.timestamp > deadline`
- LPTokens minted < `minLPTokens`

---

## View Functions

### `positionValue`

```solidity
function positionValue(
    int24  tickLower,
    int24  tickUpper,
    uint160 price
) public view returns (uint256 value)
```

Returns the total value of the plugin's position for a given range, denominated in `token1`, at the given `sqrtPriceX96`. Includes both principal amounts and accrued fees.

Useful for off-chain LP token issuance estimation.

---

### `convertToken0ToToken1`

```solidity
function convertToken0ToToken1(
    uint256 amount0,
    uint160 sqrtPriceX96
) public pure returns (uint256 token0InToken1)
```

Converts a `token0` amount to its `token1` equivalent at the given sqrt price. Returns `0` if either input is zero.

---

### `getCurrentFee`

```solidity
function getCurrentFee() external view returns (uint16)
```

Returns the pool's current base fee (before the plugin fee multiplier is applied).

## Admin Functions

### `setPluginFeeRate`

```solidity
function setPluginFeeRate(uint24 newFeeRate) external
```

Updates the plugin fee rate. Only callable by `pluginFactory`.

`newFeeRate` must be < `250_000` PPM.

---

### `setNonFungiblePositionManager`

```solidity
function setNonFungiblePositionManager(address manager) external
```

Sets the NFT position manager address. Only callable by `pluginFactory`. Can only be called once — reverts if already set.

## Plugin Hooks

These are called automatically by the Algebra pool and should not be invoked directly.

| Hook | Behaviour |
|------|-----------|
| `beforeInitialize` | Registers `defaultPluginConfig` with the pool. |
| `beforeModifyPosition` | When the plugin itself is adding liquidity, snapshots the current position value and sqrt price into a temporary cache. |
| `afterModifyPosition` | When the plugin itself has added liquidity, mints the proportional LPTokens to the depositor. |
| `beforeSwap` | Returns the dynamic plugin fee: `baseFee × pluginFeeRate / 1_000_000`. |

## Events

| Event | Parameters | Emitted When |
|-------|------------|--------------|
| `TokenCreated` | `int24 tickLower, int24 tickUpper, address addr` | A new LPToken is deployed for a previously unseen tick range. |
| `FeeRateUpdated` | `uint24 newFeeRate` | `setPluginFeeRate` is called (also emitted on construction). |
| `NonFungiblePositionManagerSet` | `address manager` | `setNonFungiblePositionManager` is called. |
