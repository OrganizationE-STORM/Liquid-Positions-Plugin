import { ethers } from 'hardhat';
import { setup } from '../utils/setup';
import { expect } from "chai";
import { ZeroAddress } from 'ethers';

/**
 * @notice This spec tests the branches of the LPPlugin contract.
 * @dev This spec is used to test the branches of the LPPlugin contract. Specifically, the more complex branches that are not covered by the other specs.
 */
describe("LPPlugin - Branch Coverage", () => {
    
    describe('#onlyPool modifier - unauthorized access', () => {
        it('should revert beforeInitialize when called by non-pool', async () => {
            const { plugin, signers } = await setup(1);
            
            await expect(
                plugin.connect(signers[1]).beforeInitialize(signers[1].address, 0n)
            ).to.be.reverted;
        });

        it('should revert beforeModifyPosition when called by non-pool', async () => {
            const { plugin, signers } = await setup(1);
            
            await expect(
                plugin.connect(signers[1]).beforeModifyPosition(
                    signers[1].address,
                    signers[1].address,
                    -60,
                    60,
                    100n,
                    '0x'
                )
            ).to.be.reverted;
        });

        it('should revert afterModifyPosition when called by non-pool', async () => {
            const { plugin, signers } = await setup(1);
            
            await expect(
                plugin.connect(signers[1]).afterModifyPosition(
                    signers[1].address,
                    signers[1].address,
                    -60,
                    60,
                    100n,
                    100n,
                    100n,
                    '0x'
                )
            ).to.be.reverted;
        });

        it('should revert beforeSwap when called by non-pool', async () => {
            const { plugin, signers } = await setup(1);
            
            await expect(
                plugin.connect(signers[1]).beforeSwap(
                    signers[1].address,
                    signers[1].address,
                    true,
                    100n,
                    0n,
                    false,
                    '0x'
                )
            ).to.be.reverted;
        });
    });

    describe('#withdraw - zero tokens validation', () => {
        it('should revert when lpTokensToBurn is 0', async () => {
            const { callback, plugin, signers, token0, token1 } = await setup(1);
            
            await token0.connect(signers[1]).approve(callback, ethers.MaxUint256);
            await token1.connect(signers[1]).approve(callback, ethers.MaxUint256);

            const tickLower = -120;
            const tickUpper = 120;

            // Create a position first
            await callback.connect(signers[1]).mint(
                signers[1].address,
                tickLower,
                tickUpper,
                ethers.parseEther('1'),
                ethers.parseEther('1')
            );

            // Try to withdraw 0 tokens
            await expect(
                plugin.connect(signers[1]).withdraw(
                    signers[1].address,
                    tickLower,
                    tickUpper,
                    0 // Zero tokens to burn
                )
            ).to.be.revertedWith("Invalid LP tokens value");
        });
    });

    describe('#setPluginFeeRate', () => {
        it('should revert when called by unauthorized address', async () => {
            const { plugin, signers } = await setup(1);
            
            await expect(
                plugin.connect(signers[1]).setPluginFeeRate(10000)
            ).to.be.revertedWith("Unauthorized");
        });

        it('should revert when fee rate is too high', async () => {
            const { plugin, pluginFactory, signers } = await setup(1);
            
            // Impersonate the plugin factory
            const pluginFactoryAddr = await pluginFactory.getAddress();
            await ethers.provider.send("hardhat_impersonateAccount", [pluginFactoryAddr]);
            await ethers.provider.send("hardhat_setBalance", [pluginFactoryAddr, "0x56BC75E2D63100000"]);
            const factorySigner = await ethers.getSigner(pluginFactoryAddr);
            
            await expect(
                plugin.connect(factorySigner).setPluginFeeRate(250000) // Max is < 250000
            ).to.be.revertedWith("Fee rate too high");
        });

        it('should succeed when called by factory with valid rate', async () => {
            const { plugin, pluginFactory } = await setup(1);
            
            const pluginFactoryAddr = await pluginFactory.getAddress();
            await ethers.provider.send("hardhat_impersonateAccount", [pluginFactoryAddr]);
            await ethers.provider.send("hardhat_setBalance", [pluginFactoryAddr, "0x56BC75E2D63100000"]);
            const factorySigner = await ethers.getSigner(pluginFactoryAddr);
            
            await plugin.connect(factorySigner).setPluginFeeRate(100000);
            
            expect(await plugin.pluginFeeRate()).to.equal(100000);
        });
    });

    describe('#onERC721Received - token mismatch', () => {
        it('should revert when NFT tokens do not match pool tokens', async () => {
            const { pluginAddr, positionManager, pluginFactoryAddr, signers, algebraFactory } = await setup(1);
            
            // Deploy two different mock tokens
            const MockToken = await ethers.getContractFactory("MockToken");
            const otherToken0 = await MockToken.deploy("Other0", "OTH0");
            const otherToken1 = await MockToken.deploy("Other1", "OTH1");
            
            // Sort by address
            const [token0Addr, token1Addr] = 
                (await otherToken0.getAddress()) < (await otherToken1.getAddress())
                    ? [await otherToken0.getAddress(), await otherToken1.getAddress()]
                    : [await otherToken1.getAddress(), await otherToken0.getAddress()];
            
            // Mint tokens to user
            await otherToken0.mint(signers[1].address, ethers.parseEther("1000"));
            await otherToken1.mint(signers[1].address, ethers.parseEther("1000"));
            
            // Approve position manager
            await otherToken0.connect(signers[1]).approve(await positionManager.getAddress(), ethers.MaxUint256);
            await otherToken1.connect(signers[1]).approve(await positionManager.getAddress(), ethers.MaxUint256);
            
            // Create a different pool with different tokens
            const pluginFactory = await ethers.getContractAt("LPPluginFactory", pluginFactoryAddr);
            await pluginFactory.createCustomPool(ZeroAddress, token0Addr, token1Addr, '0x');
            const otherPoolAddr = await algebraFactory.customPoolByPair(pluginFactoryAddr, token0Addr, token1Addr);
            
            // Initialize the other pool
            const otherPool = await ethers.getContractAt("IAlgebraPool", otherPoolAddr);
            await otherPool.initialize(BigInt("79228162514264337593543950336")); // encodePriceSqrt(1,1)
            
            // Mint NFT in the other pool
            const tx = await positionManager.connect(signers[1]).mint({
                token0: token0Addr,
                token1: token1Addr,
                deployer: pluginFactoryAddr,
                tickLower: -120,
                tickUpper: 120,
                amount0Desired: ethers.parseEther('1'),
                amount1Desired: ethers.parseEther('1'),
                amount0Min: 0,
                amount1Min: 0,
                recipient: signers[1].address,
                deadline: Math.floor(Date.now() / 1000) + 3600
            });
            const receipt = await tx.wait();
            
            // Find token ID from event
            let tokenId;
            for (const log of receipt!.logs) {
                try {
                    const parsed = positionManager.interface.parseLog(log);
                    if (parsed && parsed.name === "IncreaseLiquidity") {
                        tokenId = parsed.args.tokenId;
                    }
                } catch {}
            }
            
            // Try to transfer the NFT (with different tokens) to the plugin
            await expect(
                positionManager.connect(signers[1])['safeTransferFrom(address,address,uint256)'](
                    signers[1].address,
                    pluginAddr,
                    tokenId
                )
            ).to.be.revertedWith("Tokens do not match");
        });
    });

    describe('#onERC721Received - approval and transfer failures', () => {
        it('should revert when token0 approval fails', async () => {
            const { pluginFactoryAddr, signers, algebraFactory, positionManager } = await setup(1);
            
            // Deploy failing tokens
            const MockFailingToken = await ethers.getContractFactory("MockFailingToken");
            const failingToken0 = await MockFailingToken.deploy("Failing0", "FAIL0");
            const normalToken1 = await MockFailingToken.deploy("Normal1", "NORM1");
            
            // Sort by address
            let token0Addr, token1Addr, token0Contract, token1Contract;
            if ((await failingToken0.getAddress()) < (await normalToken1.getAddress())) {
                token0Addr = await failingToken0.getAddress();
                token1Addr = await normalToken1.getAddress();
                token0Contract = failingToken0;
                token1Contract = normalToken1;
            } else {
                token0Addr = await normalToken1.getAddress();
                token1Addr = await failingToken0.getAddress();
                token0Contract = normalToken1;
                token1Contract = failingToken0;
            }
            
            // Mint tokens to user
            await token0Contract.mint(signers[1].address, ethers.parseEther("1000"));
            await token1Contract.mint(signers[1].address, ethers.parseEther("1000"));
            
            // Create pool with these tokens
            const pluginFactory = await ethers.getContractAt("LPPluginFactory", pluginFactoryAddr);
            await pluginFactory.createCustomPool(ZeroAddress, token0Addr, token1Addr, '0x');
            const poolAddr = await algebraFactory.customPoolByPair(pluginFactoryAddr, token0Addr, token1Addr);
            
            // Get the plugin for this pool
            const pool = await ethers.getContractAt("IAlgebraPool", poolAddr);
            const pluginAddr = await pool.plugin();
            
            // Initialize the pool
            await pool.initialize(BigInt("79228162514264337593543950336"));
            
            // Approve position manager (use the SAME positionManager from setup)
            await token0Contract.connect(signers[1]).approve(await positionManager.getAddress(), ethers.MaxUint256);
            await token1Contract.connect(signers[1]).approve(await positionManager.getAddress(), ethers.MaxUint256);
            
            // Mint NFT position
            const tx = await positionManager.connect(signers[1]).mint({
                token0: token0Addr,
                token1: token1Addr,
                deployer: pluginFactoryAddr,
                tickLower: -120,
                tickUpper: 120,
                amount0Desired: ethers.parseEther('1'),
                amount1Desired: ethers.parseEther('1'),
                amount0Min: 0,
                amount1Min: 0,
                recipient: signers[1].address,
                deadline: Math.floor(Date.now() / 1000) + 3600
            });
            const receipt = await tx.wait();
            
            // Find token ID
            let tokenId;
            for (const log of receipt!.logs) {
                try {
                    const parsed = positionManager.interface.parseLog(log);
                    if (parsed && parsed.name === "IncreaseLiquidity") {
                        tokenId = parsed.args.tokenId;
                    }
                } catch {}
            }
            
            // Set token0 to fail on approve
            await token0Contract.setFailApprove(true);
            
            // Try to transfer NFT - should fail on token0 approval
            await expect(
                positionManager.connect(signers[1])['safeTransferFrom(address,address,uint256)'](
                    signers[1].address,
                    pluginAddr,
                    tokenId
                )
            ).to.be.revertedWith("Token0 approval failed");
        });

        it('should revert when token1 approval fails', async () => {
            const { pluginFactoryAddr, signers, algebraFactory, positionManager } = await setup(1);
            
            // Deploy failing tokens - both need to be MockFailingToken for control
            const MockFailingToken = await ethers.getContractFactory("MockFailingToken");
            const tokenA = await MockFailingToken.deploy("TokenA", "TKNA");
            const tokenB = await MockFailingToken.deploy("TokenB", "TKNB");
            
            // Sort by address
            let token0Addr, token1Addr, token0Contract, token1Contract;
            if ((await tokenA.getAddress()) < (await tokenB.getAddress())) {
                token0Addr = await tokenA.getAddress();
                token1Addr = await tokenB.getAddress();
                token0Contract = tokenA;
                token1Contract = tokenB;
            } else {
                token0Addr = await tokenB.getAddress();
                token1Addr = await tokenA.getAddress();
                token0Contract = tokenB;
                token1Contract = tokenA;
            }
            
            // Mint tokens
            await token0Contract.mint(signers[1].address, ethers.parseEther("1000"));
            await token1Contract.mint(signers[1].address, ethers.parseEther("1000"));
            
            // Create pool
            const pluginFactory = await ethers.getContractAt("LPPluginFactory", pluginFactoryAddr);
            await pluginFactory.createCustomPool(ZeroAddress, token0Addr, token1Addr, '0x');
            const poolAddr = await algebraFactory.customPoolByPair(pluginFactoryAddr, token0Addr, token1Addr);
            
            const pool = await ethers.getContractAt("IAlgebraPool", poolAddr);
            const pluginAddr = await pool.plugin();
            await pool.initialize(BigInt("79228162514264337593543950336"));
            
            // Use the SAME positionManager from setup (no second setup call!)
            await token0Contract.connect(signers[1]).approve(await positionManager.getAddress(), ethers.MaxUint256);
            await token1Contract.connect(signers[1]).approve(await positionManager.getAddress(), ethers.MaxUint256);
            
            const tx = await positionManager.connect(signers[1]).mint({
                token0: token0Addr,
                token1: token1Addr,
                deployer: pluginFactoryAddr,
                tickLower: -120,
                tickUpper: 120,
                amount0Desired: ethers.parseEther('1'),
                amount1Desired: ethers.parseEther('1'),
                amount0Min: 0,
                amount1Min: 0,
                recipient: signers[1].address,
                deadline: Math.floor(Date.now() / 1000) + 3600
            });
            const receipt = await tx.wait();
            
            let tokenId;
            for (const log of receipt!.logs) {
                try {
                    const parsed = positionManager.interface.parseLog(log);
                    if (parsed && parsed.name === "IncreaseLiquidity") {
                        tokenId = parsed.args.tokenId;
                    }
                } catch {}
            }
            
            // Set only token1 to fail on approve (token0 should succeed)
            await token1Contract.setFailApprove(true);
            
            await expect(
                positionManager.connect(signers[1])['safeTransferFrom(address,address,uint256)'](
                    signers[1].address,
                    pluginAddr,
                    tokenId
                )
            ).to.be.revertedWith("Token1 approval failed");
        });
    });
});