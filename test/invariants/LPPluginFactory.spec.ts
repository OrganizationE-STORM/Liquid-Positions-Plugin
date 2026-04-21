import { ethers } from 'hardhat';
import { setup } from '../utils/setup';
import { expect } from "chai";

const NUM_FUZZ_RUNS = process.env.CI ? 10 : 2;
const TIMEOUT_TESTS = 100_000_000_000_000;

describe("LPPluginFactory", () => {

    describe('#registry', async () => {
        it('should register plugin when created via createCustomPool', async function () {
            const { pluginFactory, pluginAddr } = await setup(1);

            // Plugin created during setup should be registered
            // We can verify this by calling a function that requires registry
            // If it doesn't revert, the plugin is registered
            await expect(
                pluginFactory.setPluginFeeRate(pluginAddr, 50000)
            ).to.not.be.reverted;
        });

        it('should revert setPlugin for non-registered plugin', async function () {
            const { pluginFactory, poolAddr, signers } = await setup(1);

            // Use a random address that is not registered
            const fakePluginAddr = signers[1].address;

            await expect(
                pluginFactory.setPlugin(poolAddr, fakePluginAddr)
            ).to.be.revertedWith('plugin not registered');
        });

        it('should revert collectFee for non-registered plugin', async function () {
            const { pluginFactory, token0, signers } = await setup(1);

            // Use a random address that is not registered
            const fakePluginAddr = signers[1].address;
            const token0Addr = await token0.getAddress();

            await expect(
                pluginFactory.collectFee(fakePluginAddr, token0Addr, 1000, signers[0].address)
            ).to.be.revertedWith('plugin not registered');
        });

        it('should revert setPluginFeeRate for non-registered plugin', async function () {
            const { pluginFactory, signers } = await setup(1);

            // Use a random address that is not registered
            const fakePluginAddr = signers[1].address;

            await expect(
                pluginFactory.setPluginFeeRate(fakePluginAddr, 50000)
            ).to.be.revertedWith('plugin not registered');
        });

        it('should pass registry check for registered plugin in setPlugin', async function () {
            const { pluginFactory, poolAddr, pluginAddr } = await setup(1);

            await expect(
                pluginFactory.setPlugin(poolAddr, pluginAddr)
            ).to.not.be.revertedWith('plugin not registered');
        });
    });

    describe('#onlyOwner', async () => {
        it('should revert setPluginFeeRate when called by non-owner', async function () {
            const { pluginFactory, pluginAddr, signers } = await setup(1);

            await expect(
                pluginFactory.connect(signers[1]).setPluginFeeRate(pluginAddr, 50000)
            ).to.be.revertedWithCustomError(pluginFactory, 'OwnableUnauthorizedAccount');
        });

        it('should revert setPlugin when called by non-owner', async function () {
            const { pluginFactory, poolAddr, pluginAddr, signers } = await setup(1);

            await expect(
                pluginFactory.connect(signers[1]).setPlugin(poolAddr, pluginAddr)
            ).to.be.revertedWithCustomError(pluginFactory, 'OwnableUnauthorizedAccount');
        });

        it('should revert collectFee when called by non-owner', async function () {
            const { pluginFactory, pluginAddr, token0, signers } = await setup(1);
            const token0Addr = await token0.getAddress();

            await expect(
                pluginFactory.connect(signers[1]).collectFee(pluginAddr, token0Addr, 1000, signers[1].address)
            ).to.be.revertedWithCustomError(pluginFactory, 'OwnableUnauthorizedAccount');
        });

        it('should revert setNonFungiblePositionManager when called by non-owner', async function () {
            // Prepare
            const { pluginFactory, pluginAddr, positionManagerAddr, signers } = await setup(1);

            // Act + Check
            await expect(
                pluginFactory.connect(signers[1]).setNonFungiblePositionManager(positionManagerAddr, pluginAddr)
            ).to.be.revertedWithCustomError(pluginFactory, 'OwnableUnauthorizedAccount');
        });

        it('should revert setTickSpacing when called by non-owner', async function () {
            // Prepare
            const { pluginFactory, poolAddr, signers } = await setup(1);

            // Act + Check
            await expect(
                pluginFactory.connect(signers[1]).setTickSpacing(poolAddr, 120)
            ).to.be.revertedWithCustomError(pluginFactory, 'OwnableUnauthorizedAccount');
        });

        it('should revert setPluginConfig when called by non-owner', async function () {
            // Prepare
            const { pluginFactory, poolAddr, signers } = await setup(1);

            // Act + Check
            await expect(
                pluginFactory.connect(signers[1]).setPluginConfig(poolAddr, 0)
            ).to.be.revertedWithCustomError(pluginFactory, 'OwnableUnauthorizedAccount');
        });

        it('should revert setFee when called by non-owner', async function () {
            // Prepare
            const { pluginFactory, poolAddr, signers } = await setup(1);

            // Act + Check
            await expect(
                pluginFactory.connect(signers[1]).setFee(poolAddr, 100)
            ).to.be.revertedWithCustomError(pluginFactory, 'OwnableUnauthorizedAccount');
        });

        it('should revert createCustomPool when called by non-owner', async function () {
            // Prepare
            const { pluginFactory, token0, token1, signers } = await setup(1);
            const token0Addr = await token0.getAddress();
            const token1Addr = await token1.getAddress();

            // Act + Check
            await expect(
                pluginFactory.connect(signers[1]).createCustomPool(
                    signers[1].address,
                    token0Addr,
                    token1Addr,
                    '0x'
                )
            ).to.be.revertedWithCustomError(pluginFactory, 'OwnableUnauthorizedAccount');
        });
    });

    describe('#setTickSpacing', async () => {
        it('should set tick spacing on pool when called by owner', async function () {
            // Prepare
            const { pluginFactory, poolAddr } = await setup(1);

            // Act + Check
            await expect(
                pluginFactory.setTickSpacing(poolAddr, 120)
            ).to.not.be.reverted;
        });
    });

    describe('#setPluginConfig', async () => {
        it('should set plugin config on pool when called by owner', async function () {
            // Prepare
            const { pluginFactory, poolAddr } = await setup(1);

            // Act + Check
            await expect(
                pluginFactory.setPluginConfig(poolAddr, 0)
            ).to.not.be.reverted;
        });
    });

    describe('#setFee', async () => {
        it('should always revert', async function () {
            // Prepare
            const { pluginFactory, poolAddr } = await setup(1);

            // Act + Check
            await expect(
                pluginFactory.setFee(poolAddr, 100)
            ).to.be.reverted;
        });
    });

    describe('#collectFee', async () => {
        it('should transfer the full plugin balance when it is less than maxAmount', async function () {
            for (let i = 0; i < NUM_FUZZ_RUNS; i++) {
                // Prepare: random balance in [1, 9] ETH, maxAmount always larger
                const balanceEth = BigInt(Math.floor(Math.random() * 9) + 1);
                const maxEth = balanceEth + BigInt(Math.floor(Math.random() * 10) + 1);
                const { pluginFactory, pluginAddr, token0, signers } = await setup(1);
                const pluginBalance = ethers.parseEther(balanceEth.toString());
                await token0.mint(pluginAddr, pluginBalance);
                const maxAmount = ethers.parseEther(maxEth.toString());
                const recipient = signers[2].address;
                const pluginBalanceBefore = await token0.balanceOf(pluginAddr);
                const userBalanceBefore = await token0.balanceOf(recipient);

                // Act
                await pluginFactory.collectFee(pluginAddr, await token0.getAddress(), maxAmount, recipient);

                // Check
                expect(await token0.balanceOf(recipient)).to.equal(userBalanceBefore + pluginBalance);
                expect(await token0.balanceOf(pluginAddr)).to.equal(pluginBalanceBefore - pluginBalance);
            }
        }).timeout(TIMEOUT_TESTS);

        it('should transfer only maxAmount when plugin balance exceeds maxAmount', async function () {
            for (let i = 0; i < NUM_FUZZ_RUNS; i++) {
                // Prepare: random maxAmount in [1, 9] ETH, balance always larger
                const maxEth = BigInt(Math.floor(Math.random() * 9) + 1);
                const balanceEth = maxEth + BigInt(Math.floor(Math.random() * 10) + 1);
                const { pluginFactory, pluginAddr, token0, signers } = await setup(1);
                const pluginBalance = ethers.parseEther(balanceEth.toString());
                await token0.mint(pluginAddr, pluginBalance);
                const maxAmount = ethers.parseEther(maxEth.toString());
                const recipient = signers[2].address;
                const pluginBalanceBefore = await token0.balanceOf(pluginAddr);
                const userBalanceBefore = await token0.balanceOf(recipient);

                // Act
                await pluginFactory.collectFee(pluginAddr, await token0.getAddress(), maxAmount, recipient);

                // Check
                expect(await token0.balanceOf(recipient)).to.equal(userBalanceBefore + maxAmount);
                expect(await token0.balanceOf(pluginAddr)).to.equal(pluginBalanceBefore - maxAmount);
            }
        }).timeout(TIMEOUT_TESTS);
    });

    describe('#createCustomPool', async () => {
        it('should create a custom pool when called by owner', async function () {
            // Prepare
            const { pluginFactory, algebraFactory, signers } = await setup(1);

            // Deploy new mock tokens for a fresh pool
            const MockTokenFactory = await ethers.getContractFactory('MockToken');
            const newToken0 = await MockTokenFactory.deploy('Token0', 'TK0');
            const newToken1 = await MockTokenFactory.deploy('Token1', 'TK1');
            const token0Addr = await newToken0.getAddress();
            const token1Addr = await newToken1.getAddress();
            const pluginFactoryAddr = await pluginFactory.getAddress();

            // Act
            await pluginFactory.createCustomPool(
                signers[0].address,
                token0Addr,
                token1Addr,
                '0x'
            );

            // Check - verify pool was created
            const poolAddr = await algebraFactory.customPoolByPair(
                pluginFactoryAddr,
                token0Addr,
                token1Addr
            );
            expect(poolAddr).to.not.equal(ethers.ZeroAddress);
        });

        it('should register the plugin when creating a custom pool', async function () {
            // Prepare
            const { pluginFactory, algebraFactory, signers } = await setup(1);

            // Deploy new mock tokens for a fresh pool
            const MockTokenFactory = await ethers.getContractFactory('MockToken');
            const newToken0 = await MockTokenFactory.deploy('Token0', 'TK0');
            const newToken1 = await MockTokenFactory.deploy('Token1', 'TK1');
            const token0Addr = await newToken0.getAddress();
            const token1Addr = await newToken1.getAddress();
            const pluginFactoryAddr = await pluginFactory.getAddress();

            // Act
            await pluginFactory.createCustomPool(
                signers[0].address,
                token0Addr,
                token1Addr,
                '0x'
            );

            // Get the pool address
            const poolAddr = await algebraFactory.customPoolByPair(
                pluginFactoryAddr,
                token0Addr,
                token1Addr
            );

            // Get the plugin address from the pool
            const pool = await ethers.getContractAt('IAlgebraPool', poolAddr);
            const newPluginAddr = await pool.plugin();

            // Check - verify plugin is registered by calling a registry-protected function
            await expect(
                pluginFactory.setPluginFeeRate(newPluginAddr, 50000)
            ).to.not.be.reverted;
        });
    });
});
