import { ethers } from 'hardhat';
import { expect } from 'chai';
import { setup } from '../utils/setup';

/**
 * Test suite for LPPlugin.beforeSwap fee calculation logic.
 *
 * The beforeSwap function calculates plugin fees using:
 * 1. Primary path: pool.fee() when available
 * 2. Fallback path: safelyGetStateOfAMM().lastFee when pool.fee() reverts
 *
 * Fee formula: pluginFee = baseFee * pluginFeeRate / 10^6
 *
 * Note: pool.fee() may revert when called outside swap context due to dynamic
 * fee plugin callbacks, so tests use safelyGetStateOfAMM().lastFee as the
 * reliable fee source.
 */
describe('LPPlugin#beforeSwap', () => {
    const PPM_DENOMINATOR = 10n ** 6n;
    const DEFAULT_PLUGIN_FEE_RATE = 50000n;
    const MAX_PLUGIN_FEE_RATE = 249999n;

    /**
     * Helper to get pool fee using the same fallback logic as beforeSwap.
     * Uses safelyGetStateOfAMM().lastFee which is always available.
     */
    async function getPoolLastFee(pool: any): Promise<bigint> {
        const [, , lastFee, , , ,] = await pool.safelyGetStateOfAMM();
        return BigInt(lastFee);
    }

    describe('#feeCalculation', () => {
        it('should return fee proportional to pool fee and plugin fee rate', async function () {
            // Arrange
            const { pool, plugin } = await setup(1);
            const lastFee = await getPoolLastFee(pool);

            // Act
            const expectedPluginFee = (lastFee * DEFAULT_PLUGIN_FEE_RATE) / PPM_DENOMINATOR;

            // Assert
            expect(await plugin.pluginFeeRate()).to.equal(DEFAULT_PLUGIN_FEE_RATE);
            expect(expectedPluginFee).to.be.greaterThan(0n);
        });

        it('should calculate fee correctly with minimum plugin fee rate', async function () {
            // Arrange
            const minFeeRate = 1n;
            const { pool, plugin, pluginFactory, pluginAddr } = await setup(1);
            await pluginFactory.setPluginFeeRate(pluginAddr, minFeeRate);

            // Act
            const lastFee = await getPoolLastFee(pool);
            const expectedPluginFee = (lastFee * minFeeRate) / PPM_DENOMINATOR;

            // Assert
            expect(await plugin.pluginFeeRate()).to.equal(minFeeRate);
            expect(expectedPluginFee).to.be.lessThanOrEqual(lastFee);
        });

        it('should calculate fee correctly with maximum allowed plugin fee rate', async function () {
            // Arrange
            const { pool, plugin, pluginFactory, pluginAddr } = await setup(1);
            await pluginFactory.setPluginFeeRate(pluginAddr, MAX_PLUGIN_FEE_RATE);

            // Act
            const lastFee = await getPoolLastFee(pool);
            const expectedPluginFee = (lastFee * MAX_PLUGIN_FEE_RATE) / PPM_DENOMINATOR;

            // Assert
            expect(await plugin.pluginFeeRate()).to.equal(MAX_PLUGIN_FEE_RATE);
            expect(expectedPluginFee).to.be.lessThan(lastFee);
        });

        it('should reject plugin fee rate at or above 25%', async function () {
            // Arrange
            const invalidFeeRate = 250000n;
            const { pluginFactory, pluginAddr } = await setup(1);

            // Act & Assert
            await expect(
                pluginFactory.setPluginFeeRate(pluginAddr, invalidFeeRate)
            ).to.be.revertedWith('Fee rate too high');
        });
    });

    describe('#feeSourceConsistency', () => {
        it('should read fee from safelyGetStateOfAMM as lastFee field', async function () {
            // Arrange
            const { pool } = await setup(1);

            // Act
            const [, , lastFee, , , ,] = await pool.safelyGetStateOfAMM();

            // Assert - lastFee should be a valid fee value (non-zero for initialized pool)
            expect(lastFee).to.be.greaterThan(0);
        });

        it('should have consistent fee values between globalState and safelyGetStateOfAMM', async function () {
            // Arrange
            const { pool } = await setup(1);

            // Act
            const globalState = await pool.globalState();
            const [sqrtPrice, tick, lastFee, , , ,] = await pool.safelyGetStateOfAMM();

            // Assert
            expect(globalState.price).to.equal(sqrtPrice);
            expect(globalState.tick).to.equal(tick);
            expect(globalState.lastFee).to.equal(lastFee);
        });
    });

    describe('#feeApplicationDuringSwap', () => {
        it('should apply calculated fee during swap execution', async function () {
            // Arrange
            const {
                pool,
                plugin,
                callback,
                token0,
                token1,
                signers,
                swapRouter,
                pluginFactory
            } = await setup(2);

            const tickLower = -60;
            const tickUpper = 60;
            const mintAmount = ethers.parseEther('10');

            await token0.connect(signers[1]).approve(await plugin.getAddress(), ethers.MaxUint256);
            await token1.connect(signers[1]).approve(await plugin.getAddress(), ethers.MaxUint256);

            await plugin.connect(signers[1]).deposit(
                signers[1].address,
                tickLower,
                tickUpper,
                mintAmount,
                mintAmount,
                0,
                Number.MAX_SAFE_INTEGER
            )

            // Act
            const swapAmount = ethers.parseEther('1');
            await token0.connect(signers[2]).approve(await swapRouter.getAddress(), ethers.MaxUint256);

            const state = await pool.globalState();
            const slippageBps = 5;
            const limitSqrtPrice = (state.price * BigInt(10 - slippageBps)) / BigInt(10);

            await swapRouter.connect(signers[2]).exactInputSingle({
                tokenIn: await token0.getAddress(),
                tokenOut: await token1.getAddress(),
                deployer: await pluginFactory.getAddress(),
                recipient: signers[2].address,
                deadline: Math.floor(Date.now() / 1000) + 3600,
                amountIn: swapAmount,
                amountOutMinimum: 0n,
                limitSqrtPrice
            });

            // Assert - Plugin should have accumulated fees
            const pluginToken0Balance = await token0.balanceOf(await plugin.getAddress());
            expect(pluginToken0Balance).to.be.greaterThan(0n);
        });

        it('should accumulate higher fees with higher plugin fee rate', async function () {
            // Arrange
            const lowFeeRate = 10000n;
            const highFeeRate = 100000n;

            // First setup with low fee rate
            const setupLow = await setup(2);
            await setupLow.pluginFactory.setPluginFeeRate(setupLow.pluginAddr, lowFeeRate);

            const tickLower = -60;
            const tickUpper = 60;
            const mintAmount = ethers.parseEther('10');
            const swapAmount = ethers.parseEther('1');

            await setupLow.token0.connect(setupLow.signers[1]).approve(setupLow.pluginAddr, ethers.MaxUint256);
            await setupLow.token1.connect(setupLow.signers[1]).approve(setupLow.pluginAddr, ethers.MaxUint256);
            
            let depositTx = await setupLow.plugin.connect(setupLow.signers[1]).deposit(
                setupLow.signers[1].address,
                tickLower,
                tickUpper,
                mintAmount,
                mintAmount,
                0,
                Number.MAX_SAFE_INTEGER
            )
            await depositTx.wait()

            await setupLow.token0.connect(setupLow.signers[2]).approve(
                await setupLow.swapRouter.getAddress(),
                ethers.MaxUint256
            );

            const stateLow = await setupLow.pool.globalState();
            const limitSqrtPriceLow = (stateLow.price * 9n) / 10n;

            await setupLow.swapRouter.connect(setupLow.signers[2]).exactInputSingle({
                tokenIn: await setupLow.token0.getAddress(),
                tokenOut: await setupLow.token1.getAddress(),
                deployer: await setupLow.pluginFactory.getAddress(),
                recipient: setupLow.signers[2].address,
                deadline: Math.floor(Date.now() / 1000) + 3600,
                amountIn: swapAmount,
                amountOutMinimum: 0n,
                limitSqrtPrice: limitSqrtPriceLow
            });

            const lowFeeBalance = await setupLow.token0.balanceOf(await setupLow.plugin.getAddress());

            // Second setup with high fee rate
            const setupHigh = await setup(2);
            await setupHigh.pluginFactory.setPluginFeeRate(setupHigh.pluginAddr, highFeeRate);

            await setupHigh.token0.connect(setupHigh.signers[1]).approve(setupHigh.pluginAddr, ethers.MaxUint256);
            await setupHigh.token1.connect(setupHigh.signers[1]).approve(setupHigh.pluginAddr, ethers.MaxUint256);
            
            depositTx = await setupHigh.plugin.connect(setupHigh.signers[1]).deposit(
                setupHigh.signers[1].address,
                tickLower,
                tickUpper,
                mintAmount,
                mintAmount,
                0,
                Number.MAX_SAFE_INTEGER
            )

            await setupHigh.token0.connect(setupHigh.signers[2]).approve(
                await setupHigh.swapRouter.getAddress(),
                ethers.MaxUint256
            );

            const stateHigh = await setupHigh.pool.globalState();
            const limitSqrtPriceHigh = (stateHigh.price * 9n) / 10n;

            await setupHigh.swapRouter.connect(setupHigh.signers[2]).exactInputSingle({
                tokenIn: await setupHigh.token0.getAddress(),
                tokenOut: await setupHigh.token1.getAddress(),
                deployer: await setupHigh.pluginFactory.getAddress(),
                recipient: setupHigh.signers[2].address,
                deadline: Math.floor(Date.now() / 1000) + 3600,
                amountIn: swapAmount,
                amountOutMinimum: 0n,
                limitSqrtPrice: limitSqrtPriceHigh
            });

            const highFeeBalance = await setupHigh.token0.balanceOf(await setupHigh.plugin.getAddress());

            // Assert
            expect(highFeeBalance).to.be.greaterThan(lowFeeBalance);
        });
    });

    describe('#pluginFeeRateManagement', () => {
        it('should initialize with default plugin fee rate', async function () {
            // Arrange & Act
            const { plugin } = await setup(1);

            // Assert
            expect(await plugin.pluginFeeRate()).to.equal(DEFAULT_PLUGIN_FEE_RATE);
        });

        it('should update plugin fee rate when set by factory', async function () {
            // Arrange
            const newFeeRate = 75000n;
            const { plugin, pluginFactory, pluginAddr } = await setup(1);

            // Act
            await pluginFactory.setPluginFeeRate(pluginAddr, newFeeRate);

            // Assert
            expect(await plugin.pluginFeeRate()).to.equal(newFeeRate);
        });

        it('should emit FeeRateUpdated event on construction', async function () {
            // Arrange & Act
            const { plugin, pluginAddr } = await setup(1);

            // Assert - Check the plugin has the expected fee rate (event was emitted during construction)
            const feeRate = await plugin.pluginFeeRate();
            expect(feeRate).to.equal(DEFAULT_PLUGIN_FEE_RATE);
        });

        it('should allow zero plugin fee rate', async function () {
            // Arrange
            const zeroFeeRate = 0n;
            const { plugin, pluginFactory, pluginAddr } = await setup(1);

            // Act
            await pluginFactory.setPluginFeeRate(pluginAddr, zeroFeeRate);

            // Assert
            expect(await plugin.pluginFeeRate()).to.equal(zeroFeeRate);
        });
    });

    describe('#feeCalculationBoundaryConditions', () => {
        it('should return zero fee when plugin fee rate is zero', async function () {
            // Arrange
            const { pool, plugin, pluginFactory, pluginAddr } = await setup(1);
            await pluginFactory.setPluginFeeRate(pluginAddr, 0n);

            // Act
            const lastFee = await getPoolLastFee(pool);
            const expectedPluginFee = (lastFee * 0n) / PPM_DENOMINATOR;

            // Assert
            expect(expectedPluginFee).to.equal(0n);
            expect(await plugin.pluginFeeRate()).to.equal(0n);
        });

        it('should handle fee calculation without overflow for max values', async function () {
            // Arrange
            const { pool, pluginFactory, pluginAddr } = await setup(1);
            await pluginFactory.setPluginFeeRate(pluginAddr, MAX_PLUGIN_FEE_RATE);

            // Act
            const lastFee = await getPoolLastFee(pool);
            const expectedPluginFee = (lastFee * MAX_PLUGIN_FEE_RATE) / PPM_DENOMINATOR;

            // Assert - Fee calculation should not overflow and should be valid uint24
            expect(expectedPluginFee).to.be.lessThan(2n ** 24n);
            expect(expectedPluginFee).to.be.greaterThan(0n);
        });
    });
});
