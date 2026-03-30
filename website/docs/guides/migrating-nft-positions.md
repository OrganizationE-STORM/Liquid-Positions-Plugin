---
sidebar_position: 3
---

# Migrating Existing NFT Positions

If you already hold an Algebra Integral position NFT minted by the `NonfungiblePositionManager`, you can migrate it into the plugin in a single transaction. The plugin burns the NFT, extracts all liquidity and fees, reinvests into the shared position, and sends you LPTokens.

:::info Prerequisite
The `nonFungiblePositionManager` must be set on the plugin before NFT migration is available. See [Deployment → Step 6](../getting-started/deployment.md#6-set-the-nft-position-manager).
:::

## How It Works

Sending an NFT to the plugin via `safeTransferFrom` triggers `onERC721Received`. The plugin then:

1. Reads the NFT's tick range and validates the tokens match the pool.
2. Calls `decreaseLiquidity` to remove all liquidity from the NFT.
3. Calls `collect` to claim both principal and any accrued fees (using `type(uint128).max`).
4. Burns the NFT — it no longer exists after this call.
5. Reinvests the collected tokens into the shared pool position via `LPCallback.mint()`.
6. Transfers the minted LPTokens to the original NFT sender (`from`).
7. Refunds any tokens not consumed by the mint (dust from one-sided ranges) back to `from`.

## Encoding the `data` Parameter

`safeTransferFrom(from, to, tokenId, data)` accepts a `bytes` payload. The plugin decodes it as:

```solidity
(uint256 amount0Min, uint256 amount1Min, uint256 deadline, uint256 minLPTokens)
    = abi.decode(data, (uint256, uint256, uint256, uint256));
```

| Field | Description |
|-------|-------------|
| `amount0Min` | Minimum `token0` from `decreaseLiquidity` (slippage on removal). |
| `amount1Min` | Minimum `token1` from `decreaseLiquidity` (slippage on removal). |
| `deadline` | Absolute Unix timestamp. The transaction reverts if `block.timestamp > deadline`. Also used as a relative offset for the internal `decreaseLiquidity` call deadline. |
| `minLPTokens` | Minimum LPTokens to receive. Reverts if the mint produces fewer. |

## Example

```typescript
import { AbiCoder } from 'ethers';

const abiCoder = AbiCoder.defaultAbiCoder();

const data = abiCoder.encode(
  ['uint256', 'uint256', 'uint256', 'uint256'],
  [
    amount0Min,                   // e.g. 0 for no slippage protection on removal
    amount1Min,                   // e.g. 0
    Math.floor(Date.now() / 1000) + 300,  // 5-minute deadline
    minLPTokens,                  // e.g. 0 for no LP slippage protection
  ]
);

await nftPositionManager.connect(user)['safeTransferFrom(address,address,uint256,bytes)'](
  user.address,
  pluginAddress,
  tokenId,
  data
);
```

After this call, the NFT is gone and `user` holds LPTokens for the migrated tick range.

## After Migration

You can check the LPTokens received:

```typescript
const lpTokenAddr = await plugin.lpTokenByTicks(tickLower, tickUpper);
const balance = await IERC20(lpTokenAddr).balanceOf(user.address);
```

To exit, use [`withdraw`](./withdrawing-liquidity.md) normally.

## Notes

- The plugin only accepts NFTs from the address set as `nonFungiblePositionManager`. Any other NFT transfer will revert with `"Invalid NFT manager"`.
- The NFT's tokens must match the pool's `token0` and `token1`. Sending an NFT from a different pool will revert with `"Tokens do not match"`.
- All liquidity is removed from the NFT — partial migration is not supported.
- The NFT is permanently burned; you cannot recover it.
