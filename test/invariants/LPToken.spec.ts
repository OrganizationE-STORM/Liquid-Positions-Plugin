import { ethers } from 'hardhat';
import { expect } from 'chai';

describe('LPToken', () => {

    describe('#mint', () => {
        it('should revert when called by non-owner', async function () {
            // Prepare
            const [owner, nonOwner, recipient] = await ethers.getSigners();
            const lpTokenFactory = await ethers.getContractFactory('LPToken');
            const lpToken = await lpTokenFactory.deploy('Test LP Token', 'TLP');

            // Act + Check
            await expect(
                lpToken.connect(nonOwner).mint(recipient.address, ethers.parseEther('1'))
            ).to.be.revertedWithCustomError(lpToken, 'OwnableUnauthorizedAccount');
        });
    });

    describe('#burn', () => {
        it('should revert when called by non-owner', async function () {
            // Prepare
            const [owner, nonOwner] = await ethers.getSigners();
            const lpTokenFactory = await ethers.getContractFactory('LPToken');
            const lpToken = await lpTokenFactory.deploy('Test LP Token', 'TLP');
            await lpToken.mint(owner.address, ethers.parseEther('1'));

            // Act + Check
            await expect(
                lpToken.connect(nonOwner).burn(owner.address, ethers.parseEther('1'))
            ).to.be.revertedWithCustomError(lpToken, 'OwnableUnauthorizedAccount');
        });
    });
});
