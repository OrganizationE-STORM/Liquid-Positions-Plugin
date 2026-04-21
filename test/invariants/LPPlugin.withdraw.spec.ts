import { ethers } from 'hardhat';
import { setup } from '../utils/setup';
import { expect } from "chai";
import { ContractTransactionReceipt } from 'ethers';
import { LPCallback } from '../../typechain-types';

const NUM_FUZZ_RUNS = process.env.CI ? 10 : 2;
const TIMEOUT_TESTS = 100_000_000_000_000;
const MINIMUM_LIQUIDITY = 1000n;
const FULL_RANGE_TICK_LOWER = -887220;
const FULL_RANGE_TICK_UPPER = 887220;
const FULL_RANGE_DEPOSIT = ethers.parseEther('0.1');
const DONATED_FEE_0 = ethers.parseEther('0.003');
const DONATED_FEE_1 = ethers.parseEther('0.003');

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

    const getPositionKey = (owner: string, tickLower: number, tickUpper: number) => {
        const encoded =
            (BigInt(owner) << 48n) |
            (BigInt.asUintN(24, BigInt(tickLower)) << 24n) |
            BigInt.asUintN(24, BigInt(tickUpper));

        return ethers.zeroPadValue(
            ethers.toBeHex(encoded & ((1n << 256n) - 1n)),
            32
        );
    }

    describe('#withdraw', async () => {
        it('should withdraw X% of the position', async () => {
            let currentTest = 0;

            for (let i = 0; i < NUM_FUZZ_RUNS; i++) {
                const usersInTest = 3
                const vars = await setup(usersInTest);
                const { callback, pluginAddr, plugin, signers, token0, token1, pool, utils } = vars
                const { tickLower, tickUpper, amount0Desired: amount0, amount1Desired: amount1 } = generateParamsForTest()

                for (let i = 1; i <= usersInTest; ++i) {
                    await token0.connect(signers[i]).approve(pluginAddr, ethers.MaxUint256);
                    await token1.connect(signers[i]).approve(pluginAddr, ethers.MaxUint256);
;
                    const tx = await plugin.connect(signers[i]).deposit(
                        signers[i].address,
                        tickLower,
                        tickUpper,
                        amount0,
                        amount1,
                        0,
                        Number.MAX_SAFE_INTEGER
                    )

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
                        tokensToBurn,
                        0,
                        0
                    )

                    const balanceToken0AfterWithdraw = await token0.balanceOf(signers[i].address)
                    const balanceToken1AfterWithdraw = await token1.balanceOf(signers[i].address)

                    const expectedAmount0 = (amountsForLiquidityDelta.amount0 * tokensToBurn) / lpUserBalanceBeforeWithdraw;
                    const expectedAmount1 = (amountsForLiquidityDelta.amount1 * tokensToBurn) / lpUserBalanceBeforeWithdraw;

                    expect(await lpToken.balanceOf(signers[i].address)).to.be.equals(lpUserBalanceBeforeWithdraw - tokensToBurn);
                    const tolerance = 2_000n;
                    expect(balanceToken0AfterWithdraw).to.be.closeTo(balanceToken0PreWithdraw + expectedAmount0, tolerance);
                    expect(balanceToken1AfterWithdraw).to.be.closeTo(balanceToken1PreWithdraw + expectedAmount1, tolerance);
                }
                currentTest++
                console.log(`${currentTest}/${NUM_FUZZ_RUNS}  [${tickLower}/${tickUpper}]`)
            }
        }).timeout(TIMEOUT_TESTS);
        it('should revert when lpTokensToBurn is zero', async function () {
            // Prepare: deposit to initialise the LP token, then try to withdraw 0
            const { plugin, pluginAddr, token0, token1, signers } = await setup(1);
            await token0.connect(signers[1]).approve(pluginAddr, ethers.MaxUint256);
            await token1.connect(signers[1]).approve(pluginAddr, ethers.MaxUint256);
            await plugin.connect(signers[1]).deposit(
                signers[1].address, -60, 60,
                ethers.parseEther('1'), ethers.parseEther('1'),
                0, Number.MAX_SAFE_INTEGER
            );

            // Act + Check
            await expect(
                plugin.connect(signers[1]).withdraw(signers[1].address, -60, 60, 0, 0, 0)
            ).to.be.revertedWith('Invalid LP tokens value');
        });

        it('should revert when amount0 received is less than amount0Min', async function () {
            // Prepare: deposit into in-range position
            const { plugin, pluginAddr, token0, token1, signers } = await setup(1);
            await token0.connect(signers[1]).approve(pluginAddr, ethers.MaxUint256);
            await token1.connect(signers[1]).approve(pluginAddr, ethers.MaxUint256);
            await plugin.connect(signers[1]).deposit(
                signers[1].address, -60, 60,
                ethers.parseEther('1'), ethers.parseEther('1'),
                0, Number.MAX_SAFE_INTEGER
            );

            const lpTokenAddress = await plugin.lpTokenByTicks(-60, 60);
            const lpToken = await ethers.getContractAt('LPToken', lpTokenAddress);
            const lpBalance = await lpToken.balanceOf(signers[1].address);
            await lpToken.connect(signers[1]).approve(await plugin.getAddress(), lpBalance);

            // Act + Check: amount0Min set impossibly high
            await expect(
                plugin.connect(signers[1]).withdraw(
                    signers[1].address, -60, 60, lpBalance,
                    ethers.parseEther('1000'), 0
                )
            ).to.be.revertedWith('Slippage: insufficient token0');
        });

        it('should revert when amount1 received is less than amount1Min', async function () {
            // Prepare: deposit into in-range position
            const { plugin, pluginAddr, token0, token1, signers } = await setup(1);
            await token0.connect(signers[1]).approve(pluginAddr, ethers.MaxUint256);
            await token1.connect(signers[1]).approve(pluginAddr, ethers.MaxUint256);
            await plugin.connect(signers[1]).deposit(
                signers[1].address, -60, 60,
                ethers.parseEther('1'), ethers.parseEther('1'),
                0, Number.MAX_SAFE_INTEGER
            );

            const lpTokenAddress = await plugin.lpTokenByTicks(-60, 60);
            const lpToken = await ethers.getContractAt('LPToken', lpTokenAddress);
            const lpBalance = await lpToken.balanceOf(signers[1].address);
            await lpToken.connect(signers[1]).approve(await plugin.getAddress(), lpBalance);

            // Act + Check: amount1Min set impossibly high
            await expect(
                plugin.connect(signers[1]).withdraw(
                    signers[1].address, -60, 60, lpBalance,
                    0, ethers.parseEther('1000')
                )
            ).to.be.revertedWith('Slippage: insufficient token1');
        });

        it('throws when user wants to withdraw more than his balance', async () => {
            let currentTest = 0;

            for (let i = 0; i < NUM_FUZZ_RUNS; i++) {
                const usersInTest = 3
                const vars = await setup(usersInTest);
                const { plugin, signers, token0, pluginAddr, token1, pool } = vars
                const { tickLower, tickUpper, amount0Desired: amount0, amount1Desired: amount1 } = generateParamsForTest()

                for (let i = 1; i <= usersInTest; ++i) {
                    await token0.connect(signers[i]).approve(pluginAddr, ethers.MaxUint256);
                    await token1.connect(signers[i]).approve(pluginAddr, ethers.MaxUint256);

                    const depositTx = await plugin.connect(signers[i]).deposit(
                        signers[i].address,
                        tickLower,
                        tickUpper,
                        amount0,
                        amount1,
                        0,
                        Number.MAX_SAFE_INTEGER
                    )
                    await depositTx.wait()

                    const lpTokenAddress = await plugin.lpTokenByTicks(tickLower, tickUpper)
                    const lpToken = await ethers.getContractAt("LPToken", lpTokenAddress)

                    await expect(
                        plugin.connect(signers[i]).withdraw(
                            signers[i].address,
                            tickLower,
                            tickUpper,
                            await lpToken.balanceOf(signers[i]) + BigInt(1),
                            0,
                            0
                        )
                    ).to.be.reverted
                }
                currentTest++
                console.log(`${currentTest}/${NUM_FUZZ_RUNS}  [${tickLower}/${tickUpper}]`)
            }
        }).timeout(TIMEOUT_TESTS)

        it('collects newly realized fees on a full user withdraw and leaves only locked minimum liquidity', async function () {
            const { callback, pool, plugin, pluginAddr, token0, token1, signers } = await setup(3);
            const victim = signers[1];
            const donor = signers[2];

            await token0.connect(victim).approve(pluginAddr, ethers.MaxUint256);
            await token1.connect(victim).approve(pluginAddr, ethers.MaxUint256);

            const depositTx = await plugin.connect(victim).deposit(
                victim.address,
                FULL_RANGE_TICK_LOWER,
                FULL_RANGE_TICK_UPPER,
                FULL_RANGE_DEPOSIT,
                FULL_RANGE_DEPOSIT,
                0,
                Number.MAX_SAFE_INTEGER
            );

            const { amount0: amount0Used, amount1: amount1Used } = readNewAmountsFromMintEvent(
                await depositTx.wait(),
                callback
            );

            const lpTokenAddress = await plugin.lpTokenByTicks(
                FULL_RANGE_TICK_LOWER,
                FULL_RANGE_TICK_UPPER
            );
            const lpToken = await ethers.getContractAt('LPToken', lpTokenAddress);
            const positionKey = getPositionKey(
                pluginAddr,
                FULL_RANGE_TICK_LOWER,
                FULL_RANGE_TICK_UPPER
            );

            await token0.connect(donor).transfer(await pool.getAddress(), DONATED_FEE_0);
            await token1.connect(donor).transfer(await pool.getAddress(), DONATED_FEE_1);

            const [, , , preWithdrawFees0, preWithdrawFees1] = await pool.positions(positionKey);
            expect(preWithdrawFees0 + preWithdrawFees1).to.equal(0n);

            const victim0Before = await token0.balanceOf(victim.address);
            const victim1Before = await token1.balanceOf(victim.address);
            const victimLpBalance = await lpToken.balanceOf(victim.address);

            await plugin.connect(victim).withdraw(
                victim.address,
                FULL_RANGE_TICK_LOWER,
                FULL_RANGE_TICK_UPPER,
                victimLpBalance,
                0,
                0
            );

            const victim0After = await token0.balanceOf(victim.address);
            const victim1After = await token1.balanceOf(victim.address);
            const { price } = await pool.globalState();
            const [liquidityAfter, , , fees0After, fees1After] = await pool.positions(positionKey);

            expect(victim0After - victim0Before).to.be.closeTo(
                amount0Used + DONATED_FEE_0,
                2_000n
            );
            expect(victim1After - victim1Before).to.be.closeTo(
                amount1Used + DONATED_FEE_1,
                2_000n
            );
            expect(liquidityAfter).to.be.greaterThan(0n);
            expect(await lpToken.totalSupply()).to.equal(MINIMUM_LIQUIDITY);
            expect(fees0After).to.be.closeTo(0n, 20n);
            expect(fees1After).to.be.closeTo(0n, 20n);
            expect(
                await plugin.positionValue(
                    FULL_RANGE_TICK_LOWER,
                    FULL_RANGE_TICK_UPPER,
                    price
                )
            ).to.be.greaterThan(0n);
        });

        it('does not leave stealable value for the next depositor after the last LP exits', async function () {
            const { pool, plugin, pluginAddr, token0, token1, signers } = await setup(3);
            const victim = signers[1];
            const donor = signers[2];
            const attacker = signers[3];

            for (const user of [victim, attacker]) {
                await token0.connect(user).approve(pluginAddr, ethers.MaxUint256);
                await token1.connect(user).approve(pluginAddr, ethers.MaxUint256);
            }

            await plugin.connect(victim).deposit(
                victim.address,
                FULL_RANGE_TICK_LOWER,
                FULL_RANGE_TICK_UPPER,
                FULL_RANGE_DEPOSIT,
                FULL_RANGE_DEPOSIT,
                0,
                Number.MAX_SAFE_INTEGER
            );

            const lpTokenAddress = await plugin.lpTokenByTicks(
                FULL_RANGE_TICK_LOWER,
                FULL_RANGE_TICK_UPPER
            );
            const lpToken = await ethers.getContractAt('LPToken', lpTokenAddress);
            const positionKey = getPositionKey(
                pluginAddr,
                FULL_RANGE_TICK_LOWER,
                FULL_RANGE_TICK_UPPER
            );

            await token0.connect(donor).transfer(await pool.getAddress(), DONATED_FEE_0);
            await token1.connect(donor).transfer(await pool.getAddress(), DONATED_FEE_1);

            const victimLpBalance = await lpToken.balanceOf(victim.address);
            await plugin.connect(victim).withdraw(
                victim.address,
                FULL_RANGE_TICK_LOWER,
                FULL_RANGE_TICK_UPPER,
                victimLpBalance,
                0,
                0
            );

            const { price } = await pool.globalState();
            expect(
                await plugin.positionValue(
                    FULL_RANGE_TICK_LOWER,
                    FULL_RANGE_TICK_UPPER,
                    price
                )
            ).to.be.greaterThan(0n);

            const [liquidityAfterVictimExit, , , fees0AfterVictimExit, fees1AfterVictimExit] =
                await pool.positions(positionKey);
            expect(liquidityAfterVictimExit).to.be.greaterThan(0n);
            expect(fees0AfterVictimExit).to.be.closeTo(0n, 20n);
            expect(fees1AfterVictimExit).to.be.closeTo(0n, 20n);

            const attacker0Before = await token0.balanceOf(attacker.address);
            const attacker1Before = await token1.balanceOf(attacker.address);

            await plugin.connect(attacker).deposit(
                attacker.address,
                FULL_RANGE_TICK_LOWER,
                FULL_RANGE_TICK_UPPER,
                1n,
                1n,
                0,
                Number.MAX_SAFE_INTEGER
            );

            const attackerLpBalance = await lpToken.balanceOf(attacker.address);
            expect(attackerLpBalance).to.be.greaterThan(0n);

            await plugin.connect(attacker).withdraw(
                attacker.address,
                FULL_RANGE_TICK_LOWER,
                FULL_RANGE_TICK_UPPER,
                attackerLpBalance,
                0,
                0
            );

            const attacker0After = await token0.balanceOf(attacker.address);
            const attacker1After = await token1.balanceOf(attacker.address);
            const attackerNet = (attacker0After - attacker0Before) + (attacker1After - attacker1Before);

            expect(attackerNet).to.be.closeTo(0n, 2_000n);
        });
    })
})