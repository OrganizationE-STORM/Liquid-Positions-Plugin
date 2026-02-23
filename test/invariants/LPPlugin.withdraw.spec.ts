import { ethers } from 'hardhat';
import { setup } from '../utils/setup';
import { expect } from "chai";
import { ContractTransactionReceipt } from 'ethers';
import { LPCallback } from '../../typechain-types';

const NUM_FUZZ_RUNS = process.env.CI ? 10 : 2;
const TIMEOUT_TESTS = 100_000_000_000_000;

describe("LPPlugin", () => {
    const generateParamsForTest = () => {
        const tickA_ = Math.floor(Math.random() * 200001) - 100000;
        const tickA = tickA_ - (tickA_ % 60);

        const tickB_ = Math.floor(Math.random() * 200001) - 100000;
        const tickB = tickB_ - (tickB_ % 60);

        const amount0Desired = ethers.parseEther('1');
        const amount1Desired = ethers.parseEther('1');

        const [tickLower, tickUpper] = [Math.min(tickA, tickB), Math.max(tickA, tickB)];

        return {
            tickLower,
            tickUpper,
            amount0Desired,
            amount1Desired
        }
    }

    const readNewAmountsFromMintEvent = (
        receipt: ContractTransactionReceipt | null,
        lpcallback: LPCallback
    ) => {
        let amount0, amount1, liquidity;
        for (const log of receipt!.logs) {
            try {
                const parsed = lpcallback.interface.parseLog(log);
                if (parsed && parsed.name === "PositionMinted") {
                    amount0 = BigInt(parsed.args.amount0 ?? parsed.args[0]);
                    amount1 = BigInt(parsed.args.amount1 ?? parsed.args[1]);
                    liquidity = BigInt(parsed.args.liquidity ?? parsed.args[2]);
                }
            } catch { }
        }
        if (amount0 == undefined || amount1 == undefined || liquidity == undefined) {
            throw new Error(`No amounts found in event`)
        }
        return { amount0, amount1, liquidity }
    }

    describe('#withdraw', async () => {
        it('should withdraw X% of the position', async () => {
            let currentTest = 0;

            for (let i = 0; i < NUM_FUZZ_RUNS; i++) {
                const usersInTest = 3
                const vars = await setup(usersInTest);
                const { callback, plugin, signers, token0, token1, pool, utils } = vars
                const { tickLower, tickUpper, amount0Desired: amount0, amount1Desired: amount1 } = generateParamsForTest()

                for (let i = 1; i <= usersInTest; ++i) {
                    await token0.connect(signers[i]).approve(callback, ethers.MaxUint256);
                    await token1.connect(signers[i]).approve(callback, ethers.MaxUint256);

                    const tx = await callback.connect(signers[i]).mint(
                        signers[i].address,
                        tickLower,
                        tickUpper,
                        amount0,
                        amount1
                    );

                    const state = await pool.globalState()
                    const { liquidity } = readNewAmountsFromMintEvent(await tx.wait(), callback)
                    const amountsForLiquidityDelta = await utils.getAmountsForLiquidity2(
                        tickLower,
                        tickUpper,
                        liquidity,
                        state.tick,
                        state.price
                    )

                    const lpTokenAddress = await plugin.lpTokenByTicks(tickLower, tickUpper)
                    const lpToken = await ethers.getContractAt("LPToken", lpTokenAddress)

                    const lpUserBalanceBeforeWithdraw = await lpToken.balanceOf(signers[i])
                    const tokensToBurn = BigInt(Math.floor(Math.random() * Number(lpUserBalanceBeforeWithdraw)));

                    const balanceToken0PreWithdraw = await token0.balanceOf(signers[i].address)
                    const balanceToken1PreWithdraw = await token1.balanceOf(signers[i].address)

                    await lpToken.connect(signers[i]).approve(await plugin.getAddress(), tokensToBurn)
                    await plugin.connect(signers[i]).withdraw(
                        signers[i].address,
                        tickLower,
                        tickUpper,
                        tokensToBurn
                    )

                    const balanceToken0AfterWithdraw = await token0.balanceOf(signers[i].address)
                    const balanceToken1AfterWithdraw = await token1.balanceOf(signers[i].address)

                    const expectedAmount0 = (amountsForLiquidityDelta.amount0 * tokensToBurn) / lpUserBalanceBeforeWithdraw;
                    const expectedAmount1 = (amountsForLiquidityDelta.amount1 * tokensToBurn) / lpUserBalanceBeforeWithdraw;

                    expect(await lpToken.balanceOf(signers[i].address)).to.be.equals(lpUserBalanceBeforeWithdraw - tokensToBurn);
                    const tolerance = 2n;
                    expect(balanceToken0AfterWithdraw).to.be.closeTo(balanceToken0PreWithdraw + expectedAmount0, tolerance);
                    expect(balanceToken1AfterWithdraw).to.be.closeTo(balanceToken1PreWithdraw + expectedAmount1, tolerance);
                }
                currentTest++
                console.log(`${currentTest}/${NUM_FUZZ_RUNS}  [${tickLower}/${tickUpper}]`)
            }
        }).timeout(TIMEOUT_TESTS);
        it('throws when user wants to withdraw more than his balance', async () => {
            let currentTest = 0;

            for (let i = 0; i < NUM_FUZZ_RUNS; i++) {
                const usersInTest = 3
                const vars = await setup(usersInTest);
                const { callback, plugin, signers, token0, token1 } = vars
                const { tickLower, tickUpper, amount0Desired: amount0, amount1Desired: amount1 } = generateParamsForTest()

                for (let i = 1; i <= usersInTest; ++i) {
                    await token0.connect(signers[i]).approve(callback, ethers.MaxUint256);
                    await token1.connect(signers[i]).approve(callback, ethers.MaxUint256);

                    await callback.connect(signers[i]).mint(
                        signers[i].address,
                        tickLower,
                        tickUpper,
                        amount0,
                        amount1
                    );

                    const lpTokenAddress = await plugin.lpTokenByTicks(tickLower, tickUpper)
                    const lpToken = await ethers.getContractAt("LPToken", lpTokenAddress)

                    await expect(
                        plugin.connect(signers[i]).withdraw(
                            signers[i].address,
                            tickLower,
                            tickUpper,
                            await lpToken.balanceOf(signers[i]) + BigInt(1)
                        )
                    ).to.be.reverted
                }
                currentTest++
                console.log(`${currentTest}/${NUM_FUZZ_RUNS}  [${tickLower}/${tickUpper}]`)
            }
        }).timeout(TIMEOUT_TESTS)
    })
})