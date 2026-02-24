import { ethers } from 'hardhat';
import { setup } from '../utils/setup';
import { expect } from "chai";

/**
 * PoC: convertToken0ToToken1 computes amount0 * sqrt(P) instead of amount0 * P.
 *
 * The pool stores sqrtPriceX96 = sqrt(P) * 2^96. Correct conversion requires
 * squaring: amount0 * sqrtPriceX96^2 / 2^192. The implementation applies only
 * a single division by 2^96, yielding sqrt(P) instead of P. This systematically
 * undervalues token0 when P > 1 and corrupts LP token minting ratios.
 */
describe("POC: Incorrect convertToken0ToToken1", () => {
    const Q96 = 2n ** 96n;

    it("price=4, returns 2 instead of 4", async function () {
        this.timeout(100_000_000);
        const { plugin } = await setup(1);

        const sqrtPriceX96 = 2n * Q96; // sqrt(4) = 2
        const amount0 = ethers.parseEther("1");

        const result = await plugin.convertToken0ToToken1(amount0, sqrtPriceX96);

        // BUG: returns amount0 * sqrt(P) = 1 * 2 = 2, correct would be 1 * 4 = 4
        expect(result).to.equal(ethers.parseEther("2"));
    });

    it("price=100, returns 10 instead of 100", async function () {
        this.timeout(100_000_000);
        const { plugin } = await setup(1);

        const sqrtPriceX96 = 10n * Q96; // sqrt(100) = 10
        const amount0 = ethers.parseEther("1");

        const result = await plugin.convertToken0ToToken1(amount0, sqrtPriceX96);

        // BUG: returns amount0 * sqrt(P) = 1 * 10 = 10, correct would be 1 * 100 = 100
        expect(result).to.equal(ethers.parseEther("10"));
    });

    it("ETH/USDC price~2000: returns ~44.72 instead of ~2000", async function () {
        this.timeout(100_000_000);
        const { plugin } = await setup(1);

        // sqrt(2000) ≈ 44.721359549995793
        const sqrtPrice = 44721359549995793n;
        const sqrtPriceX96 = (sqrtPrice * Q96) / (10n ** 15n);
        const amount0 = ethers.parseEther("1");

        const result = await plugin.convertToken0ToToken1(amount0, sqrtPriceX96);

        // BUG: returns sqrt(2000) ≈ 44.72, correct would be 2000
        const resultNum = Number(ethers.formatEther(result));
        expect(resultNum).to.be.closeTo(44.72, 0.1);
    });

    it("demonstrates unfair LP token distribution at realistic prices", async function () {
        this.timeout(100_000_000);
        const { plugin } = await setup(1);

        // sqrt(2000) ≈ 44.721359549995793
        const sqrtPrice = 44721359549995793n;
        const sqrtPriceX96 = (sqrtPrice * Q96) / (10n ** 15n);

        // User A deposits: 1 ETH + 2000 USDC → real value $4000
        const userA_eth = ethers.parseEther("1");
        const userA_usdc = ethers.parseEther("2000");

        // User B deposits: 2 ETH + 0 USDC → real value $4000
        const userB_eth = ethers.parseEther("2");
        const userB_usdc = ethers.parseEther("0");

        const ethValueA = await plugin.convertToken0ToToken1(userA_eth, sqrtPriceX96);
        const ethValueB = await plugin.convertToken0ToToken1(userB_eth, sqrtPriceX96);

        const valueA = userA_usdc + ethValueA; // 2000 + 44.72 = 2044.72
        const valueB = userB_usdc + ethValueB; // 0 + 89.44 = 89.44

        const ratio = Number(valueA) / Number(valueB);

        // Both deposited $4000 of real value, but the formula sees User A as ~23x more valuable
        expect(ratio).to.be.greaterThan(20);
    });
});
