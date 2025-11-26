```javascript
// === Global Mappings ===
global var ERC20ByTicks = tickLower -> tickUpper -> ERC20Address;
global var tokenIdByTicks = tickLower -> tickUpper -> tokenId;

PLUGIN_ADDRESS = address(this);


// === Hook: beforeModifyPosition ===
FUNCTION beforeModifyPosition(pool, positionManager, tickLower, tickUpper, liquidityDelta, data):    
    isPluginApproved = positionManager.isApprovedForAll(tx.origin, PLUGIN_ADDRESS);

    // If the plugin is not approved, continue without action
    if(NOT isPluginApproved): return (IAlgebraPlugin.beforeModifyPosition.selector, pluginFee);

	if (liquidityDelta < 0):
		return _burnLogic(positionManager, tickLower, tickUpper, liquidityDelta);
	else:
		return (IAlgebraPlugin.beforeModifyPosition.selector, pluginFee);
END_FUNCTION


// === Burn Logic ===
FUNCTION _burnLogic(positionManager, tickLower, tickUpper, liquidityDelta):
    _burnERC20(tx.origin, tickLower, tickUpper, liquidityDelta);

    // Give temporary approval to the user
    positionManager.approve(tx.origin, tokenIdByTicks[tickLower][tickUpper]);

    return (IAlgebraPlugin.beforeModifyPosition.selector, pluginFee);
END_FUNCTION


// === Burn ERC20 Tokens ===
FUNCTION _burnERC20(user, tickLower, tickUpper, liquidityDelta):
	require(ERC20BalanceOf(user) >= liquidityDelta);
	ERC20.burn(user, ERC20ByTicks[tickLower][tickUpper], liquidityDelta);
END_FUNCTION


// === Hook: afterModifyPosition ===
FUNCTION afterModifyPosition(pool, positionManager, tickLower, tickUpper, liquidityDelta, amount0, amount1, data):
    isPluginApproved = positionManager.isApprovedForAll(tx.origin, PLUGIN_ADDRESS)

    if(NOT isPluginApproved): return IAlgebraPlugin.beforeModifyPosition.selector;

	if (liquidityDelta < 0):
		unchecked {
			// Revoke approval (cleanup)
			positionManager.revoke(tx.origin, tokenIdByTicks[tickLower][tickUpper]);
		}
		return IAlgebraPlugin.afterModifyPosition.selector;

	else:
		// Get last token owned by user (assumes newest NFT is last)
		///IMPORTANT: tx.origin USED HERE
		/// This call trigger a require in ERC721Enumerable.sol line 38
		/// require(index < ERC721.balanceOf(owner), "ERC721Enumerable: owner index out of bounds");
		lastTokenId = positionManager.tokenOfOwnerByIndex(tx.origin, -1);

		// Transfer the NFT to plugin (plugin must be approved manually!)
		///IMPORTANT: tx.origin USED HERE
        /// This call trigger a require in ERC721.sol line 360
        /// require(ERC721.ownerOf(tokenId) == from, "ERC721: transfer from incorrect owner");
		/// from = tx.origin
		positionManager.safeTransferFrom(tx.origin, PLUGIN_ADDRESS, lastTokenId);

		if((NOT EXISTS tokenIdByTicks[tickLower][tickUpper]) OR (ERC20ByTicks[tickLower][tickUpper] == Address(0))):
			// First time for this position range: record token ID
			tokenIdByTicks[tickLower][tickUpper] = lastTokenId;

			// Create ERC20 token for the position
            ERC20ByTicks[tickLower][tickUpper] = _createERC20(tickLower, tickUpper);

            // Mint ERC20 tokens for the position
            _mintERC20(ERC20ByTicks[tickLower][tickUpper], tx.origin, liquidityDelta);

		else:
			// Already existing position:
			// - Withdraw liquidity from user's NFT
            (amount0, amount1) = positionManager.decreaseLiquidity(lastTokenId, liquidityDelta, 0, 0, deadline: ????);
            positionManager.collect(lastTokenId, PLUGIN_ADDRESS, amount0, amount1);

            // - Increase liquidity in plugin's NFT
            token0 = pool.token0;
            token1 = pool.token1;
            token0.allowance(PLUGIN_ADDRESS, amount0);
            token1.allowance(PLUGIN_ADDRESS, amount1);
            positionManager.increaseLiquidity(
                tokenIdByTicks[tickLower][tickUpper],
                tickLower,
                tickUpper,
                liquidityDelta,
                amount0,
                amount1
            );

            // - Mint ERC20 tokens for the position
            _mintERC20(ERC20ByTicks[tickLower][tickUpper], tx.origin, liquidityDelta);

		return IAlgebraPlugin.afterModifyPosition.selector;
END_FUNCTION
```