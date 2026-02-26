import { ethers } from 'hardhat';
import { setup } from '../utils/setup';
import { expect } from "chai";
import { ZeroAddress } from 'ethers';

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
    });
});
