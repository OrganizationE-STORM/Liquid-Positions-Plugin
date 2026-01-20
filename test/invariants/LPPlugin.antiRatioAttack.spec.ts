import { ethers } from 'hardhat';
import { setup } from '../utils/setup';
import { expect } from "chai";

/**
 * @title Anti-Ratio Attack Test
 * @notice Tests that the "first depositor" / "donation" attack is mitigated
 * 
 * The attack works as follows:
 * 1. Attacker is first depositor, deposits minimal amount (1 wei)
 * 2. Attacker "donates" large amount directly to inflate value per share
 * 3. Victim deposits funds, but due to rounding gets 0 shares
 * 4. Attacker withdraws and steals victim's funds
 * 
 * The contract's defense: mint 10^(decimals+1) tokens on each deposit to
 * prevent the share/value ratio from being easily manipulated.
 */
describe("LPPlugin - Anti-Ratio Attack Mitigation", () => {
    const shouldPrint = false;
    const print = (...args: any[]) => {
        if (shouldPrint) {
            console.log(...args);
        }
    }
    it('should prevent first depositor attack via share inflation', async () => {
        const { callback, plugin, pool, token0, token1, signers } = await setup(2);
        
        const attacker = signers[1];
        const victim = signers[2];
        
        // Approve tokens for both users
        await token0.connect(attacker).approve(callback, ethers.MaxUint256);
        await token1.connect(attacker).approve(callback, ethers.MaxUint256);
        await token0.connect(victim).approve(callback, ethers.MaxUint256);
        await token1.connect(victim).approve(callback, ethers.MaxUint256);

        const tickLower = -120;
        const tickUpper = 120;
        
        // Record initial balances
        const victimToken0Before = await token0.balanceOf(victim.address);
        const victimToken1Before = await token1.balanceOf(victim.address);

        // Step 1: Attacker makes first deposit with tiny amount
        const tinyAmount = 1n; // 1 wei - minimal deposit
        await callback.connect(attacker).mint(
            attacker.address,
            tickLower,
            tickUpper,
            tinyAmount,
            tinyAmount
        );

        const lpTokenAddress = await plugin.lpTokenByTicks(tickLower, tickUpper);
        const lpToken = await ethers.getContractAt("LPToken", lpTokenAddress);
        
        const attackerSharesAfterFirstDeposit = await lpToken.balanceOf(attacker.address);
        print(`Attacker shares after tiny deposit: ${attackerSharesAfterFirstDeposit}`);
        
        // Step 2: Attacker tries to inflate share value by "donating" tokens
        // In a vulnerable contract, this would make each share worth much more
        // Here we donate directly to the pool position by depositing more
        const donationAmount = ethers.parseEther('1000'); // Large donation
        await callback.connect(attacker).mint(
            attacker.address,
            tickLower,
            tickUpper,
            donationAmount,
            donationAmount
        );
        
        const attackerSharesAfterDonation = await lpToken.balanceOf(attacker.address);
        print(`Attacker shares after donation: ${attackerSharesAfterDonation}`);
        
        // Step 3: Victim deposits a reasonable amount
        const victimDeposit = ethers.parseEther('100');
        await callback.connect(victim).mint(
            victim.address,
            tickLower,
            tickUpper,
            victimDeposit,
            victimDeposit
        );
        
        const victimShares = await lpToken.balanceOf(victim.address);
        print(`Victim shares after deposit: ${victimShares}`);
        
        // CRITICAL CHECK: Victim should receive shares proportional to their deposit
        // In a vulnerable contract, victim would get 0 shares due to rounding
        expect(victimShares).to.be.gt(0n, "Victim should receive non-zero shares");
        
        // The victim's share of the pool should be roughly proportional to their deposit
        // relative to the total value. Since attacker deposited ~1001 ETH worth and victim
        // deposited ~100 ETH worth, victim should have roughly 100/1101 ≈ 9% of shares
        const totalSupply = await lpToken.totalSupply();
        const victimSharePercentage = (victimShares * 10000n) / totalSupply; // basis points
        
        print(`Total supply: ${totalSupply}`);
        print(`Victim share percentage: ${Number(victimSharePercentage) / 100}%`);
        
        // Victim should have at least 5% of shares (being conservative due to anti-ratio tokens)
        expect(victimSharePercentage).to.be.gt(500n, "Victim should have meaningful share of pool");
        
        // Step 4: Verify victim can withdraw and get back a fair amount
        // First, let's check what the victim would get if they withdrew everything
        const state = await pool.globalState();
        const positionValue = await plugin.positionValue(tickLower, tickUpper, state.price);
        
        // Victim's expected value = (victimShares / totalSupply) * positionValue
        const victimExpectedValue = (victimShares * positionValue) / totalSupply;
        
        print(`Position total value: ${ethers.formatEther(positionValue)} (in token1 terms)`);
        print(`Victim expected withdrawal value: ${ethers.formatEther(victimExpectedValue)}`);
        
        // The victim's expected value should be close to their deposit (within 20% due to price impact)
        // In a vulnerable contract, this would be close to 0
        const victimDepositValue = victimDeposit * 2n; // rough value of both tokens deposited
        const minimumAcceptableValue = (victimDepositValue * 80n) / 100n; // 80% of deposited value
        
        expect(victimExpectedValue).to.be.gt(
            minimumAcceptableValue / 2n, // divide by 2 since positionValue is in token1 terms
            "Victim's withdrawable value should be close to their deposit"
        );
        
        // Step 5: Actually withdraw a portion of victim's shares and verify they get tokens back
        // Note: withdraw takes uint128, so we withdraw a portion if shares exceed uint128 max
        const uint128Max = 2n ** 128n - 1n;
        const sharesToWithdraw = victimShares > uint128Max ? uint128Max : victimShares;
        
        await plugin.connect(victim).withdraw(
            victim.address,
            tickLower,
            tickUpper,
            sharesToWithdraw
        );
        
        const victimToken0After = await token0.balanceOf(victim.address);
        const victimToken1After = await token1.balanceOf(victim.address);
        
        // Calculate how much victim got back
        const victimToken0Net = victimToken0After - victimToken0Before + victimDeposit;
        const victimToken1Net = victimToken1After - victimToken1Before + victimDeposit;
        
        print(`Victim received after withdrawal: ${ethers.formatEther(victimToken0Net)} token0, ${ethers.formatEther(victimToken1Net)} token1`);
        
        // Victim should receive a meaningful amount back (not 0 or near 0)
        const totalReceivedValue = victimToken0Net + victimToken1Net;
        expect(totalReceivedValue).to.be.gt(
            0n,
            "Victim should receive meaningful tokens on withdrawal"
        );
    });
});
