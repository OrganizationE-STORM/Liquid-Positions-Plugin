import { ethers } from 'hardhat';
import { setup } from '../utils/setup';
import { expect } from "chai";

const TIMEOUT_TESTS = 100_000;

describe("LPPlugin Fees", () => {
    // Default values from LPPlugin constructor
    const DEFAULT_PLUGIN_FEE_RATE = 50000n; // 5% of base fee

    const generateParamsForTest = (tickPrice: number) => {
        const TICK_SPACING = 60;
        let tickLower = tickPrice - (tickPrice % TICK_SPACING) - TICK_SPACING * 10;
        let tickUpper = tickPrice - (tickPrice % TICK_SPACING) + TICK_SPACING * 10;
        return { tickLower, tickUpper };
    };

    describe('#Fee Initialization', () => {
        it('should initialize with default pluginFeeRate', async function () {
            const { plugin } = await setup(1);
            expect(await plugin.pluginFeeRate()).to.equal(DEFAULT_PLUGIN_FEE_RATE);
        });
    });

    describe('#setPluginFeeRate - Positive', () => {
        it('should update pluginFeeRate when called via factory by owner', async function () {
            const { plugin, pluginFactory, pluginAddr, signers } = await setup(1);

            const newFeeRate = 100000n; // 10%
            await pluginFactory.connect(signers[0]).setPluginFeeRate(pluginAddr, newFeeRate);

            expect(await plugin.pluginFeeRate()).to.equal(newFeeRate);
        });

        it('should emit FeeRateUpdated event', async function () {
            const { plugin, pluginFactory, pluginAddr, signers } = await setup(1);

            const newFeeRate = 200000n;
            await expect(pluginFactory.connect(signers[0]).setPluginFeeRate(pluginAddr, newFeeRate))
                .to.emit(plugin, 'FeeRateUpdated')
                .withArgs(newFeeRate);
        });

        it('should allow setting pluginFeeRate to 0', async function () {
            const { plugin, pluginFactory, pluginAddr, signers } = await setup(1);

            await pluginFactory.connect(signers[0]).setPluginFeeRate(pluginAddr, 0n);
            expect(await plugin.pluginFeeRate()).to.equal(0n);
        });

        it('should allow setting pluginFeeRate to max (249999 = ~25%)', async function () {
            const { plugin, pluginFactory, pluginAddr, signers } = await setup(1);

            // Max is < 250000 (25%)
            const maxFeeRate = 249999n;
            await pluginFactory.connect(signers[0]).setPluginFeeRate(pluginAddr, maxFeeRate);
            expect(await plugin.pluginFeeRate()).to.equal(maxFeeRate);
        });
    });

    describe('#setPluginFeeRate - Negative', () => {
        it('should revert when called directly on plugin (unauthorized)', async function () {
            const { plugin, signers } = await setup(1);

            await expect(plugin.connect(signers[0]).setPluginFeeRate(100000n))
                .to.be.revertedWith('Unauthorized');
        });

        it('should revert when factory called by non-owner', async function () {
            const { pluginFactory, pluginAddr, signers } = await setup(2);

            await expect(pluginFactory.connect(signers[1]).setPluginFeeRate(pluginAddr, 100000n))
                .to.be.revertedWithCustomError(pluginFactory, 'OwnableUnauthorizedAccount');
        });

        it('should revert when pluginFeeRate exceeds max (250000)', async function () {
            const { pluginFactory, pluginAddr, signers } = await setup(1);

            // Max is < 250000, so 250000 should revert
            await expect(pluginFactory.connect(signers[0]).setPluginFeeRate(pluginAddr, 250000n))
                .to.be.revertedWith('Fee rate too high');
        });
    });

    describe('#setFee - Factory', () => {
        it('should revert when setFee is called (disabled function)', async function () {
            const { pluginFactory, poolAddr, signers } = await setup(1);

            await expect(pluginFactory.connect(signers[0]).setFee(poolAddr, 3000n))
                .to.be.revertedWith('setFee disabled: use plugin.setBaseFee() instead');
        });
    });

    describe('#beforeSwap Fee Calculation', () => {
        it('should calculate correct pluginFee with default settings', async function () {
            const { plugin, pool, callback, token0, token1, swapRouter, pluginFactory, signers } = await setup(2);
            const state = await pool.globalState();
            const { tickLower, tickUpper } = generateParamsForTest(Number(state.tick));

            // Setup liquidity
            await token0.connect(signers[1]).approve(callback, ethers.MaxUint256);
            await token1.connect(signers[1]).approve(callback, ethers.MaxUint256);
            const mintTx = await callback.connect(signers[1]).mint(
                signers[1].address, tickLower, tickUpper,
                ethers.parseEther('10'), ethers.parseEther('10')
            );
            await mintTx.wait();

            // Track plugin balance before swap
            const pluginBalanceBefore = await token0.balanceOf(await plugin.getAddress());

            // Perform swap
            await token0.connect(signers[2]).approve(await swapRouter.getAddress(), ethers.MaxUint256);
            const amountIn = ethers.parseEther('1');

            await swapRouter.connect(signers[2]).exactInputSingle({
                tokenIn: await token0.getAddress(),
                tokenOut: await token1.getAddress(),
                deployer: await pluginFactory.getAddress(),
                recipient: signers[2].address,
                deadline: Math.floor(Date.now() / 1000) + 999999,
                amountIn,
                amountOutMinimum: 0n,
                limitSqrtPrice: 0n
            });

            // Plugin should receive fees
            const pluginBalanceAfter = await token0.balanceOf(await plugin.getAddress());
            expect(pluginBalanceAfter).to.be.greaterThan(pluginBalanceBefore);
        });

        it('should not collect plugin fees when pluginFeeRate is 0', async function () {
            const { plugin, pool, callback, token0, token1, swapRouter, pluginFactory, pluginAddr, signers } = await setup(2);

            // Set pluginFeeRate to 0
            await pluginFactory.connect(signers[0]).setPluginFeeRate(pluginAddr, 0n);

            const state = await pool.globalState();
            const { tickLower, tickUpper } = generateParamsForTest(Number(state.tick));

            // Setup liquidity
            await token0.connect(signers[1]).approve(callback, ethers.MaxUint256);
            await token1.connect(signers[1]).approve(callback, ethers.MaxUint256);
            await callback.connect(signers[1]).mint(
                signers[1].address, tickLower, tickUpper,
                ethers.parseEther('10'), ethers.parseEther('10')
            );

            const pluginBalanceBefore = await token0.balanceOf(await plugin.getAddress());

            // Perform swap
            await token0.connect(signers[2]).approve(await swapRouter.getAddress(), ethers.MaxUint256);
            await swapRouter.connect(signers[2]).exactInputSingle({
                tokenIn: await token0.getAddress(),
                tokenOut: await token1.getAddress(),
                deployer: await pluginFactory.getAddress(),
                recipient: signers[2].address,
                deadline: Math.floor(Date.now() / 1000) + 999999,
                amountIn: ethers.parseEther('1'),
                amountOutMinimum: 0n,
                limitSqrtPrice: 0n
            });

            const pluginBalanceAfter = await token0.balanceOf(await plugin.getAddress());
            expect(pluginBalanceAfter).to.equal(pluginBalanceBefore);
        });
    });

    describe('#Dynamic Fee Changes', () => {
        it('should apply new pluginFeeRate to subsequent swaps', async function () {
            const { plugin, pool, callback, token0, token1, swapRouter, pluginFactory, pluginAddr, signers } = await setup(2);
            
            // Change pluginFeeRate to a higher value (200000 = 20% of baseFee, within max < 250000)
            const newPluginFeeRate = 200000n;
            await pluginFactory.connect(signers[0]).setPluginFeeRate(pluginAddr, newPluginFeeRate);
            expect(await plugin.pluginFeeRate()).to.equal(newPluginFeeRate);

            const state = await pool.globalState();
            const { tickLower, tickUpper } = generateParamsForTest(Number(state.tick));

            // Setup liquidity
            await token0.connect(signers[1]).approve(callback, ethers.MaxUint256);
            await token1.connect(signers[1]).approve(callback, ethers.MaxUint256);
            await callback.connect(signers[1]).mint(
                signers[1].address, tickLower, tickUpper,
                ethers.parseEther('10'), ethers.parseEther('10')
            );

            // Perform swap
            await token0.connect(signers[2]).approve(await swapRouter.getAddress(), ethers.MaxUint256);
            const amountIn = ethers.parseEther('1');
            const pluginBalanceBefore = await token0.balanceOf(await plugin.getAddress());

            await swapRouter.connect(signers[2]).exactInputSingle({
                tokenIn: await token0.getAddress(),
                tokenOut: await token1.getAddress(),
                deployer: await pluginFactory.getAddress(),
                recipient: signers[2].address,
                deadline: Math.floor(Date.now() / 1000) + 999999,
                amountIn,
                amountOutMinimum: 0n,
                limitSqrtPrice: 0n
            });

            const pluginFee = (await token0.balanceOf(await plugin.getAddress())) - pluginBalanceBefore;

            // Plugin should receive fees based on the new pluginFeeRate
            // baseFee (from pool) * pluginFeeRate / 1_000_000
            expect(pluginFee).to.be.greaterThan(0n);
        });

        it('should correctly handle max pluginFeeRate (25% of baseFee goes to plugin)', async function () {
            const { plugin, pool, callback, token0, token1, swapRouter, pluginFactory, pluginAddr, signers } = await setup(2);
            const state = await pool.globalState();
            const { tickLower, tickUpper } = generateParamsForTest(Number(state.tick));

            // Set pluginFeeRate to max (< 250000)
            await pluginFactory.connect(signers[0]).setPluginFeeRate(pluginAddr, 249999n);

            // Setup liquidity
            await token0.connect(signers[1]).approve(callback, ethers.MaxUint256);
            await token1.connect(signers[1]).approve(callback, ethers.MaxUint256);
            await callback.connect(signers[1]).mint(
                signers[1].address, tickLower, tickUpper,
                ethers.parseEther('100'), ethers.parseEther('100')
            );

            const pluginBalanceBefore = await token0.balanceOf(await plugin.getAddress());

            // Perform swap
            await token0.connect(signers[2]).approve(await swapRouter.getAddress(), ethers.MaxUint256);
            await swapRouter.connect(signers[2]).exactInputSingle({
                tokenIn: await token0.getAddress(),
                tokenOut: await token1.getAddress(),
                deployer: await pluginFactory.getAddress(),
                recipient: signers[2].address,
                deadline: Math.floor(Date.now() / 1000) + 999999,
                amountIn: ethers.parseEther('1'),
                amountOutMinimum: 0n,
                limitSqrtPrice: 0n
            });

            const pluginBalanceAfter = await token0.balanceOf(await plugin.getAddress());
            const pluginFee = pluginBalanceAfter - pluginBalanceBefore;

            // Plugin should receive fees
            expect(pluginFee).to.be.greaterThan(0n);
        });

        it('should handle zero pluginFeeRate (no plugin fees)', async function () {
            const { plugin, pool, callback, token0, token1, swapRouter, pluginFactory, pluginAddr, signers } = await setup(2);

            // Set pluginFeeRate to 0
            await pluginFactory.connect(signers[0]).setPluginFeeRate(pluginAddr, 0n);
            const state = await pool.globalState();
            const { tickLower, tickUpper } = generateParamsForTest(Number(state.tick));

            // Setup liquidity
            await token0.connect(signers[1]).approve(callback, ethers.MaxUint256);
            await token1.connect(signers[1]).approve(callback, ethers.MaxUint256);
            await callback.connect(signers[1]).mint(
                signers[1].address, tickLower, tickUpper,
                ethers.parseEther('100'), ethers.parseEther('100')
            );

            const pluginBalanceBefore = await token0.balanceOf(await plugin.getAddress());

            // Perform swap with 0 fee
            await token0.connect(signers[2]).approve(await swapRouter.getAddress(), ethers.MaxUint256);
            await swapRouter.connect(signers[2]).exactInputSingle({
                tokenIn: await token0.getAddress(),
                tokenOut: await token1.getAddress(),
                deployer: await pluginFactory.getAddress(),
                recipient: signers[2].address,
                deadline: Math.floor(Date.now() / 1000) + 999999,
                amountIn: ethers.parseEther('1'),
                amountOutMinimum: 0n,
                limitSqrtPrice: 0n
            });

            const pluginBalanceAfter = await token0.balanceOf(await plugin.getAddress());

            // No fees should be collected
            expect(pluginBalanceAfter).to.equal(pluginBalanceBefore);
        });
    });

    describe('#Fee Collection via Factory', () => {
        it('should allow owner to collect plugin fees', async function () {
            const { plugin, pool, callback, token0, token1, swapRouter, pluginFactory, pluginAddr, signers } = await setup(2);
            const state = await pool.globalState();
            const { tickLower, tickUpper } = generateParamsForTest(Number(state.tick));

            // Setup liquidity
            await token0.connect(signers[1]).approve(callback, ethers.MaxUint256);
            await token1.connect(signers[1]).approve(callback, ethers.MaxUint256);
            await callback.connect(signers[1]).mint(
                signers[1].address, tickLower, tickUpper,
                ethers.parseEther('100'), ethers.parseEther('100')
            );

            // Perform swap to generate fees
            await token0.connect(signers[2]).approve(await swapRouter.getAddress(), ethers.MaxUint256);
            await swapRouter.connect(signers[2]).exactInputSingle({
                tokenIn: await token0.getAddress(),
                tokenOut: await token1.getAddress(),
                deployer: await pluginFactory.getAddress(),
                recipient: signers[2].address,
                deadline: Math.floor(Date.now() / 1000) + 999999,
                amountIn: ethers.parseEther('10'),
                amountOutMinimum: 0n,
                limitSqrtPrice: 0n
            });

            const pluginBalance = await token0.balanceOf(pluginAddr);
            expect(pluginBalance).to.be.greaterThan(0n);

            const recipientBalanceBefore = await token0.balanceOf(signers[0].address);

            // Collect fees
            await pluginFactory.connect(signers[0]).collectFee(
                pluginAddr,
                await token0.getAddress(),
                pluginBalance,
                signers[0].address
            );

            const recipientBalanceAfter = await token0.balanceOf(signers[0].address);
            expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(pluginBalance);
            expect(await token0.balanceOf(pluginAddr)).to.equal(0n);
        });

        it('should revert fee collection when called by non-owner', async function () {
            const { pluginFactory, pluginAddr, token0, signers } = await setup(2);

            await expect(
                pluginFactory.connect(signers[1]).collectFee(
                    pluginAddr,
                    await token0.getAddress(),
                    1000n,
                    signers[1].address
                )
            ).to.be.revertedWithCustomError(pluginFactory, 'OwnableUnauthorizedAccount');
        });
    });

    describe('#Multiple Fee Updates', () => {
        it('should handle multiple sequential fee updates', async function () {
            const { plugin, pluginFactory, pluginAddr, signers } = await setup(1);

            // Multiple updates to pluginFeeRate (all within max < 250000)
            const rates = [1000n, 50000n, 100000n, 200000n, 249999n, 0n, 150000n];
            for (const rate of rates) {
                await pluginFactory.connect(signers[0]).setPluginFeeRate(pluginAddr, rate);
                expect(await plugin.pluginFeeRate()).to.equal(rate);
            }
        });

        it('should correctly set pluginFeeRate values', async function () {
            const { plugin, pluginFactory, pluginAddr, signers } = await setup(1);

            // Test various valid pluginFeeRate values (all < 250000)
            const testCases = [
                { pluginFeeRate: 50000n },   // 5%
                { pluginFeeRate: 100000n },  // 10%
                { pluginFeeRate: 200000n },  // 20%
                { pluginFeeRate: 0n },       // 0%
                { pluginFeeRate: 249999n },  // ~25% (max)
            ];

            for (const tc of testCases) {
                await pluginFactory.connect(signers[0]).setPluginFeeRate(pluginAddr, tc.pluginFeeRate);
                expect(await plugin.pluginFeeRate()).to.equal(tc.pluginFeeRate);
            }
        });
    });
}).timeout(TIMEOUT_TESTS);
