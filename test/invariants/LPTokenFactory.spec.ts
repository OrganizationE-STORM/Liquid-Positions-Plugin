import { ethers } from 'hardhat';
import { setup } from '../utils/setup';
import { expect } from 'chai';

describe('LPTokenFactory', () => {

    describe('#create', () => {
        it('should revert when lpPluginFactory address has not been set', async function () {
            // Prepare: fresh factory with no plugin factory configured
            const lpTokenFactoryFactory = await ethers.getContractFactory('LPTokenFactory');
            const freshFactory = await lpTokenFactoryFactory.deploy();

            // Act + Check
            await expect(
                freshFactory.create('Test Token', 'TST')
            ).to.be.revertedWith('LPPluginFactory address not set');
        });

        it('should revert when caller is not a registered plugin', async function () {
            // Prepare
            const { pluginFactory, signers } = await setup(1);
            const lpTokenFactoryAddr = await pluginFactory.lpTokenFactory();
            const lpTokenFactory = await ethers.getContractAt('LPTokenFactory', lpTokenFactoryAddr);

            // Act + Check: signers[1] is not a registered plugin in the plugin factory
            await expect(
                lpTokenFactory.connect(signers[1]).create('Test Token', 'TST')
            ).to.be.revertedWith('Unauthorized');
        });
    });

    describe('#setPluginFactory', () => {
        it('should revert when called by non-owner', async function () {
            // Prepare
            const { pluginFactory, signers } = await setup(1);
            const lpTokenFactoryAddr = await pluginFactory.lpTokenFactory();
            const lpTokenFactory = await ethers.getContractAt('LPTokenFactory', lpTokenFactoryAddr);

            // Act + Check
            await expect(
                lpTokenFactory.connect(signers[1]).setPluginFactory(signers[2].address)
            ).to.be.revertedWithCustomError(lpTokenFactory, 'OwnableUnauthorizedAccount');
        });
    });
});
