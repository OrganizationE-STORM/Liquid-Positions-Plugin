import { ethers } from 'hardhat';
import { setup } from '../utils/setup';
import { expect } from "chai";

describe("Regression: First-Depositor Inflation Attack", () => {
    const TICK_LOWER = -887220; // near full-range (tick spacing = 60)
    const TICK_UPPER = 887220;

    it("rejects the dust initializer and prevents a free large LP share", async function () {
        this.timeout(100_000_000);

        const { plugin, token0, token1, signers } = await setup(3);
        const [, attacker, victim] = signers;

        for (const user of [attacker, victim]) {
            await token0.connect(user).approve(plugin, ethers.MaxUint256);
            await token1.connect(user).approve(plugin, ethers.MaxUint256);
        }

        await expect(
            plugin.connect(attacker).deposit(
                attacker.address,
                TICK_LOWER,
                TICK_UPPER,
                1n,
                1n,
                0,
                Number.MAX_SAFE_INTEGER
            )
        ).to.be.revertedWith("Initial value too low");

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

        const lpTokenAddr = await plugin.lpTokenByTicks(TICK_LOWER, TICK_UPPER);
        const lpToken = await ethers.getContractAt("LPToken", lpTokenAddr);
        const victimLP = await lpToken.balanceOf(victim.address);
        expect(victimLP).to.be.greaterThan(0n);

        const attacker0Before = await token0.balanceOf(attacker.address);
        const attacker1Before = await token1.balanceOf(attacker.address);

        await plugin.connect(attacker).deposit(
            attacker.address,
            TICK_LOWER,
            TICK_UPPER,
            1n,
            1n,
            0,
            Number.MAX_SAFE_INTEGER
        )

        const attackerLP = await lpToken.balanceOf(attacker.address);
        const totalSupply = await lpToken.totalSupply();
        expect(attackerLP).to.be.greaterThan(0n);
        expect(attackerLP * 10_000n / totalSupply).to.be.lessThan(1n);

        await plugin.connect(attacker).withdraw(attacker.address, TICK_LOWER, TICK_UPPER, attackerLP, 0, 0);

        const delta0 = (await token0.balanceOf(attacker.address)) - attacker0Before;
        const delta1 = (await token1.balanceOf(attacker.address)) - attacker1Before;
        expect(delta0 + delta1).to.be.closeTo(0n, 2_000n);
    });
});
