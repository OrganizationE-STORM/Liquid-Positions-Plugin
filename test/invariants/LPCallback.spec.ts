import { ethers, network } from 'hardhat';
import { AbiCoder } from 'ethers';
import { setup } from '../utils/setup';
import { expect } from 'chai';
import { impersonate } from '../shared/helpers';

describe('LPCallback', () => {

    describe('#algebraMintCallback', () => {
        it('should revert when caller is not the pool', async function () {
            // Prepare
            const { callback, signers } = await setup(1);
            const encodedData = AbiCoder.defaultAbiCoder().encode(
                ['tuple(address)'],
                [[signers[1].address]]
            );

            // Act + Check
            await expect(
                callback.connect(signers[1]).algebraMintCallback(100, 100, encodedData)
            ).to.be.revertedWith('Invalid caller of callback');
        });
    });

    describe('#mint', () => {
        it('should revert when caller is not the plugin', async function () {
            // Prepare
            const { callback, signers } = await setup(1);

            // Act + Check
            await expect(
                callback.connect(signers[1]).mint(signers[1].address, -60, 60, 100, 100)
            ).to.be.revertedWith('Only plugin');
        });
    });

    describe('#_pay', () => {
        it('should transfer from callback own balance when payer is the callback itself', async function () {
            // Prepare: impersonate pool so the require passes, set callback as payer
            const { callback, token0, poolAddr, poolSigner } = await setup(1);
            const callbackAddr = await callback.getAddress();
            const amount0Owed = ethers.parseEther('1');

            // Fund the callback contract with tokens so it can pay from its own balance
            await token0.mint(callbackAddr, amount0Owed);

            const encodedData = AbiCoder.defaultAbiCoder().encode(
                ['tuple(address)'],
                [[callbackAddr]]  // payer = callback itself
            );

            // Fund the impersonated pool address with ETH for gas
            await network.provider.send('hardhat_setBalance', [poolAddr, '0x56BC75E2D630FFFFF']); // ~100 ETH

            const poolTokenBalanceBefore = await token0.balanceOf(poolAddr);

            // Act: call as the pool with payer = callback (triggers the if branch in _pay)
            await callback.connect(poolSigner).algebraMintCallback(amount0Owed, 0, encodedData);

            // Check: pool received the tokens from the callback's own balance
            expect(await token0.balanceOf(poolAddr)).to.equal(poolTokenBalanceBefore + amount0Owed);
            expect(await token0.balanceOf(callbackAddr)).to.equal(0);
        });
    });
});
