---
sidebar_position: 1
---

# Risks and Limitations

## Unsupported Token Types

The plugin is designed for standard ERC-20 tokens. The following token types will cause incorrect accounting or loss of funds:

| Token type | Risk |
|------------|------|
| **Fee-on-transfer** | `amount0` / `amount1` passed to internal accounting differ from what actually arrives in the contract. LP token issuance will be overstated. |
| **Rebasing tokens** | Supply changes outside of deposit/withdraw operations will silently shift the value backing all LP tokens. |
| **ERC-777 / callback tokens** | Re-entrancy during `transferFrom` could manipulate the pool state before the plugin records its cache. |

## Concentrated Liquidity Price Range Risk

LPTokens represent a share of a concentrated liquidity position within a fixed tick range. If the pool price moves outside that range:

- **No fees accrue** — the position earns no swap fees while out of range.
- **Single-asset exposure** — the position is composed 100% of the cheaper token at the range boundary.
- **LP tokens still hold value** — they represent the underlying token balance, but it may be worth less than the original deposit if impermanent loss is large.

LPToken holders bear the same impermanent loss exposure as direct LP positions in that range.

## First-Deposit Mechanics

The first depositor into any tick range receives exactly `10^32` LPTokens regardless of the amount deposited. This has two implications:

1. A malicious first depositor cannot manipulate the initial price to dilute subsequent depositors (the fixed initial mint prevents zero-value exploits of the kind seen in early ERC-4626 vaults).
2. The absolute token amount deposited in the first transaction has no effect on the exchange rate — only subsequent depositors use the proportional formula.

## Withdrawal When Supply Is Zero

If all LP tokens are burned, the total supply reaches zero. The next deposit treats the range as new and mints `10^32` LP tokens again. Any funds remaining in the pool position from rounding or dust would be claimable only by the next depositor into that range.

## Plugin Fee

The plugin applies an additional fee on every swap. This fee accrues in the plugin contract and is only collectable by the `LPPluginFactory` owner. LP token holders do not directly receive this fee — it is separate from the pool fees that are proportionally distributed on withdrawal.

## Admin Key Risk

`LPPluginFactory` is `Ownable`. The owner can:

- Adjust the plugin fee rate (up to 25% of the base fee).
- Collect accumulated plugin fees.
- Replace the active plugin on any pool.
- Set tick spacing.

Compromise of the owner key is the primary trust assumption. Review the multisig or governance setup for `LPPluginFactory` before integrating.

## `setFee` Is Disabled

`LPPluginFactory.setFee()` always reverts. The pool fee is entirely controlled by the dynamic plugin fee mechanism. Calls to this function will fail.

## Out-of-Range Token Refunds (NFT Migration Only)

During NFT migration via `onERC721Received`, tokens not consumed by `LPCallback.mint()` are refunded to the sender. During a direct `deposit()` call, unconsumed token amounts remain in the plugin contract and are not automatically returned. Size inputs to minimise this residual.
