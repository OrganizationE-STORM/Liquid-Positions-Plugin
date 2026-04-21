import { ethers } from "hardhat";
import { expect } from "chai";
import { setup } from "../utils/setup";

describe("LPPlugin deposit permanent lock", () => {
    it("locks the unused excess even for an in-range imbalanced deposit", async function () {
        this.timeout(100_000_000);

        const { plugin, pluginAddr, callback, token0, token1, signers } = await setup(1);
        const user = signers[1];
        const tickLower = -60;
        const tickUpper = 60;
        const amount0 = ethers.parseEther("100");
        const amount1 = ethers.parseEther("1");

        await token0.connect(user).approve(pluginAddr, ethers.MaxUint256);
        await token1.connect(user).approve(pluginAddr, ethers.MaxUint256);

        const user0Before = await token0.balanceOf(user.address);
        const user1Before = await token1.balanceOf(user.address);

        const depositTx = await plugin.connect(user).deposit(
            user.address,
            tickLower,
            tickUpper,
            amount0,
            amount1,
            0,
            Number.MAX_SAFE_INTEGER
        );
        const depositReceipt = await depositTx.wait();

        let amount0Used = 0n;
        let amount1Used = 0n;
        for (const log of depositReceipt!.logs) {
            try {
                const parsed = callback.interface.parseLog(log);
                if (parsed && parsed.name === "PositionMinted") {
                    amount0Used = BigInt(parsed.args.amount0 ?? parsed.args[0]);
                    amount1Used = BigInt(parsed.args.amount1 ?? parsed.args[1]);
                }
            } catch {}
        }

        const lpTokenAddress = await plugin.lpTokenByTicks(tickLower, tickUpper);
        const lpToken = await ethers.getContractAt("LPToken", lpTokenAddress);
        const lpBalance = await lpToken.balanceOf(user.address);

        await plugin.connect(user).withdraw(
            user.address,
            tickLower,
            tickUpper,
            lpBalance,
            0,
            0
        );

        const user0After = await token0.balanceOf(user.address);
        const user1After = await token1.balanceOf(user.address);
        const plugin0After = await token0.balanceOf(pluginAddr);
        const plugin1After = await token1.balanceOf(pluginAddr);

        expect(amount0Used).to.equal(amount1);
        expect(amount1Used).to.equal(amount1);
        expect(user0Before - user0After).to.equal(amount0 - amount1 + 1n);
        expect(user1Before - user1After).to.equal(1n);
        expect(plugin0After).to.equal(amount0 - amount1);
        expect(plugin1After).to.equal(0n);
    });
});