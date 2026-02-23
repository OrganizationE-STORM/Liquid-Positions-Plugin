import { ContractTransactionReceipt, EventLog, ZeroAddress } from 'ethers';
import { ethers } from 'hardhat';
import { setup } from '../utils/setup';
import { expect } from "chai";
import { LPCallback } from '../../typechain-types';

const NUM_FUZZ_RUNS = process.env.CI ? 10 : 2;
const TIMEOUT_TESTS = 100_000_000_000_000;

describe("LPPlugin", () => {
    let currentTest = 0;
    const generateParamsForTest = (tickPrice: number) => {
        const MIN_TICK = -887272;
        const MAX_TICK = 887272;
        const TICK_SPACING = 60;

        const getRandomInt = (min: number, max: number) => {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }

        let tickLower = getRandomInt(MIN_TICK, tickPrice);
        tickLower = tickLower - (tickLower % TICK_SPACING);
        if (tickLower < 0 && (tickLower % TICK_SPACING) !== 0) {
            tickLower -= (TICK_SPACING + (tickLower % TICK_SPACING));
        }

        const lowerBoundForUpper = Math.max(tickPrice, tickLower) + TICK_SPACING;
        let tickUpper = getRandomInt(lowerBoundForUpper, MAX_TICK);
        tickUpper = tickUpper - (tickUpper % TICK_SPACING);


        if (tickLower >= tickUpper) {
            tickLower = tickPrice - (tickPrice % TICK_SPACING) - TICK_SPACING;
            tickUpper = tickPrice - (tickPrice % TICK_SPACING) + TICK_SPACING;
        }

        const amount0Desired = ethers.parseEther('1');
        const amount1Desired = ethers.parseEther('1');

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
        let amount0, amount1;
        for (const log of receipt!.logs) {
            try {
                const parsed = lpcallback.interface.parseLog(log);
                if (parsed && parsed.name === "PositionMinted") {
                    amount0 = BigInt(parsed.args.amount0 ?? parsed.args[0]);
                    amount1 = BigInt(parsed.args.amount1 ?? parsed.args[1]);
                }
            } catch { }
        }
        if (amount0 == undefined || amount1 == undefined) {
            throw new Error(`No amounts found in event`)
        }
        return { amount0, amount1 }
    }


    describe('#Swaps', async () => {
        it('should generate correct fees after a swap', async function () {
            for (let i = 0; i < NUM_FUZZ_RUNS; i++) {
                const users = 2
                const { plugin, callback, pool, token0, token1, signers, swapRouter, pluginFactory } = await setup(users);
                const state = await pool.globalState()
                const { tickLower, tickUpper, amount0Desired, amount1Desired } = generateParamsForTest(Number(state.tick))

                for (let i = 1; i < users; ++i) {
                    await token0.connect(signers[i]).approve(callback, ethers.MaxUint256);
                    await token1.connect(signers[i]).approve(callback, ethers.MaxUint256);

                    const firstUserToken1BalanceBeforeMint = await token1.balanceOf(signers[i].address)

                    const mintTx = await callback.connect(signers[i]).mint(
                        signers[i].address,
                        tickLower,
                        tickUpper,
                        amount0Desired,
                        amount1Desired
                    );
                    const mintReceipt = await mintTx.wait();
                    const { amount0 } = readNewAmountsFromMintEvent(mintReceipt, callback)

                    await token0.connect(signers[i + 1]).approve(await swapRouter.getAddress(), ethers.MaxUint256);

                    // Calculate amountIn as a random fraction (1% to 50%) of the available liquidity
                    const swapFraction = BigInt(Math.floor(Math.random() * 50) + 1);
                    const amountIn = (amount0 * swapFraction) / 100n;

                    const slippageBps = 5;
                    const limitSqrtPrice = (state.price * BigInt(10 - slippageBps)) / BigInt(10);

                    const lpTokenAddress = await plugin.lpTokenByTicks(tickLower, tickUpper)
                    const lpToken = await ethers.getContractAt("LPToken", lpTokenAddress)

                    const firstUserToken0BalanceBeforeSwap = await token0.balanceOf(signers[i].address)

                    const trx = await swapRouter
                        .connect(signers[i + 1])
                        .exactInputSingle({
                            tokenIn: await token0.getAddress(), // plugin receives fees with this
                            tokenOut: await token1.getAddress(),
                            deployer: await pluginFactory.getAddress(),
                            recipient: signers[i + 1].address,
                            deadline: Math.floor(Date.now() / 1000) + 999999,
                            amountIn,
                            amountOutMinimum: 0n,
                            limitSqrtPrice
                        });
                    await trx.wait()

                    // first user withdraws everything
                    await plugin.connect(signers[i]).withdraw(
                        signers[i].address,
                        tickLower,
                        tickUpper,
                        await lpToken.balanceOf(signers[i].address)
                    )

                    expect(await token0.balanceOf(await plugin.getAddress())).to.be.greaterThan(0)
                    expect(await token0.balanceOf(signers[i].address)).to.be.greaterThan(firstUserToken0BalanceBeforeSwap)
                    expect(await token1.balanceOf(signers[i].address)).to.be.lessThan(firstUserToken1BalanceBeforeMint)
                }
                currentTest++
                console.log(`${currentTest}/${NUM_FUZZ_RUNS}  [${tickLower}/${tickUpper}]`)
            }
        }).timeout(TIMEOUT_TESTS);
    })
})