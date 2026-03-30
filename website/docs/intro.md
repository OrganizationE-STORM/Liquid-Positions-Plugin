---
id: intro
slug: /
sidebar_position: 1
---

# Introduction

**Liquid Positions** is an [Algebra Integral](https://docs.algebra.finance/) plugin that transforms non-fungible concentrated liquidity positions (NFTs) into fungible ERC-20 tokens.

## The Problem

In concentrated liquidity DEXs, each liquidity position is represented as a unique NFT tied to a specific tick range. This creates real friction:

- Positions cannot be split or combined without interacting with the position manager directly.
- Capital from different users targeting the same price range cannot be pooled together.
- LP shares cannot be used as collateral, deposited into vaults, or traded on secondary markets without unwrapping.

## What Liquid Positions Does

The plugin intercepts Algebra pool lifecycle events and sits between liquidity providers and the underlying pool. Instead of holding individual NFTs:

1. Users deposit tokens (or send an existing NFT) into the plugin.
2. The plugin manages one aggregated position per tick range on behalf of all depositors.
3. Each depositor receives **LPTokens** — standard ERC-20 tokens proportional to their share of the aggregated position.

LPTokens can be freely transferred, sold, used as collateral, or deposited into yield aggregators — just like any other ERC-20.

To exit, users burn their LPTokens and receive their proportional share of the underlying tokens plus any accrued fees.

## Key Properties

| Property | Detail |
|---|---|
| LP token standard | ERC-20 |
| One LP token per | Tick range (`tickLower`, `tickUpper`) |
| Value accounting | Token1-denominated at current pool price |
| First deposit | Mints a fixed `10^32` LP tokens |
| Subsequent deposits | Proportional to `depositValue / positionValue * totalSupply` |
| Plugin fee | Configurable, applied on swaps (in addition to the pool's base fee) |
| Fee-on-transfer tokens | **Not supported** |
| Rebasing tokens | **Not supported** |

## Who Is It For

- **Liquidity providers** who want fungible, transferable LP shares without managing NFTs.
- **DeFi protocols** (lending markets, vaults, yield aggregators) that want to accept LP positions as deposits.
- **DEX operators** deploying Algebra Integral pools who want to offer a streamlined LP experience with built-in fee capture.
