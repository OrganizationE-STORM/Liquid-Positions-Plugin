import { EventLog, ZeroAddress } from 'ethers';
import { ethers, network } from 'hardhat';
import { setup } from '../utils/setup';
import { expect } from "chai";
import { ContractTransactionReceipt } from 'ethers';
import { LPCallback } from '../../typechain-types';
import { impersonate } from '../shared/helpers';

const NUM_FUZZ_RUNS = process.env.CI ? 10 : 2;
const TIMEOUT_TESTS = 100_000_000_000_000;

describe("LPPlugin", () => {
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

    const LOCKED_LIQUIDITY_RECEIVER = '0x000000000000000000000000000000000000dEaD';
    let currentTest = 0;

    describe('#getCurrentFee', async () => {
        it('should return the current base fee from the pool', async function () {
            const { plugin, pool } = await setup(1);

            const currentFee = await plugin.getCurrentFee();
            const poolState = await pool.globalState();

            expect(currentFee).to.equal(poolState.lastFee);
        });
    });

    describe('#LPToken', async () => {
        it('should create LP token with correct name and symbol', async function () {
            const { plugin, token0, token1, signers, pool, pluginAddr } = await setup(1);

            await token0.connect(signers[1]).approve(pluginAddr, ethers.MaxUint256);
            await token1.connect(signers[1]).approve(pluginAddr, ethers.MaxUint256);

            const tickLower = -60;
            const tickUpper = 60;
            const amount0 = ethers.parseEther('1');
            const amount1 = ethers.parseEther('1');

            await plugin.connect(signers[1]).deposit(
                signers[1].address,
                tickLower,
                tickUpper,
                amount0,
                amount1,
                0,
                Number.MAX_SAFE_INTEGER
            )

            const lpTokenAddress = await plugin.lpTokenByTicks(tickLower, tickUpper);
            const lpToken = await ethers.getContractAt("LPToken", lpTokenAddress);

            const token0Symbol = await token0.symbol();
            const token1Symbol = await token1.symbol();
            const expectedSymbol = `${token0Symbol}-${token1Symbol} ${tickLower}-${tickUpper}`;
            const expectedName = `LPToken ${expectedSymbol}`;

            expect(await lpToken.name()).to.equal(expectedName);
            expect(await lpToken.symbol()).to.equal(expectedSymbol);
        });
    });

    describe('#beforeInitialize', async () => {
        it('should revert when caller is not the pool', async function () {
            // Prepare
            const { plugin, signers } = await setup(1);

            // Act + Check
            await expect(
                plugin.connect(signers[1]).beforeInitialize(signers[1].address, 0n)
            ).to.be.revertedWith('Only pool can call this');
        });
    });

    describe('#beforeModifyPosition', async () => {
        it('should revert when caller is not the pool', async function () {
            // Prepare
            const { plugin, signers } = await setup(1);

            // Act + Check
            await expect(
                plugin.connect(signers[1]).beforeModifyPosition(signers[1].address, signers[1].address, -60, 60, 100n, '0x')
            ).to.be.revertedWith('Only pool can call this');
        });
    });

    describe('#afterModifyPosition', async () => {
        it('should revert when caller is not the pool', async function () {
            // Prepare
            const { plugin, signers } = await setup(1);

            // Act + Check
            await expect(
                plugin.connect(signers[1]).afterModifyPosition(signers[1].address, signers[1].address, -60, 60, 100n, 0n, 0n, '0x')
            ).to.be.revertedWith('Only pool can call this');
        });
    });

    describe('#beforeSwap', async () => {
        it('should revert when caller is not the pool', async function () {
            // Prepare
            const { plugin, signers } = await setup(1);

            // Act + Check
            await expect(
                plugin.connect(signers[1]).beforeSwap(signers[1].address, signers[1].address, true, 100n, 0n, false, '0x')
            ).to.be.revertedWith('Only pool can call this');
        });
    });

    describe('#setPluginFeeRate', async () => {
        it('should revert when caller is not the plugin factory', async function () {
            // Prepare
            const { plugin, signers } = await setup(1);

            // Act + Check
            await expect(
                plugin.connect(signers[1]).setPluginFeeRate(1000)
            ).to.be.revertedWith('Unauthorized');
        });
    });

    describe('#setNonFungiblePositionManager', async () => {
        it('should revert when caller is not the plugin factory', async function () {
            // Prepare
            const { plugin, signers } = await setup(1);

            // Act + Check
            await expect(
                plugin.connect(signers[1]).setNonFungiblePositionManager(signers[2].address)
            ).to.be.revertedWith('unauthorized');
        });

        it('should revert when manager address is zero', async function () {
            // Prepare: impersonate the plugin factory (zero address check fires before already-set check)
            const { plugin, pluginFactory } = await setup(1);
            const pluginFactoryAddr = await pluginFactory.getAddress();
            await network.provider.send('hardhat_setBalance', [pluginFactoryAddr, '0x56BC75E2D630FFFFF']);
            const factorySigner = await impersonate(pluginFactoryAddr);

            // Act + Check
            await expect(
                plugin.connect(factorySigner).setNonFungiblePositionManager(ZeroAddress)
            ).to.be.revertedWith('manager address invalid');
        });

        it('should revert when manager is already set', async function () {
            // Prepare: impersonate the plugin factory; fixture already set the manager
            const { plugin, pluginFactory, signers } = await setup(1);
            const pluginFactoryAddr = await pluginFactory.getAddress();
            await network.provider.send('hardhat_setBalance', [pluginFactoryAddr, '0x56BC75E2D630FFFFF']);
            const factorySigner = await impersonate(pluginFactoryAddr);

            // Act + Check
            await expect(
                plugin.connect(factorySigner).setNonFungiblePositionManager(signers[2].address)
            ).to.be.revertedWith('manager already set');
        });
    });

    describe('#deposit', async () => {
        it('should revert when deadline has passed', async function () {
            // Prepare
            const { plugin, signers } = await setup(1);

            // Act + Check: deadline = 0 is in the past
            await expect(
                plugin.connect(signers[1]).deposit(
                    signers[1].address, -60, 60,
                    ethers.parseEther('1'), ethers.parseEther('1'),
                    0, 0
                )
            ).to.be.revertedWith('Transaction expired');
        });

        it('should revert when LP tokens received are less than minLPTokens', async function () {
            // Prepare
            const { plugin, pluginAddr, token0, token1, signers } = await setup(1);
            await token0.connect(signers[1]).approve(pluginAddr, ethers.MaxUint256);
            await token1.connect(signers[1]).approve(pluginAddr, ethers.MaxUint256);

            // Act + Check: impossibly high minLPTokens
            await expect(
                plugin.connect(signers[1]).deposit(
                    signers[1].address, -60, 60,
                    ethers.parseEther('1'), ethers.parseEther('1'),
                    ethers.MaxUint256, Number.MAX_SAFE_INTEGER
                )
            ).to.be.revertedWith('Insufficient LP tokens');
        });

        it('should keep the locked minimum supply when the first LP exits and allow later deposits', async function () {
            // Prepare: deposit, withdraw all user-owned LP, then deposit again.
            const { plugin, pluginAddr, token0, token1, signers } = await setup(1);
            await token0.connect(signers[1]).approve(pluginAddr, ethers.MaxUint256);
            await token1.connect(signers[1]).approve(pluginAddr, ethers.MaxUint256);

            // First deposit: creates the LP token
            await plugin.connect(signers[1]).deposit(
                signers[1].address, -60, 60,
                ethers.parseEther('1'), ethers.parseEther('1'),
                0, Number.MAX_SAFE_INTEGER
            );

            const lpTokenAddress = await plugin.lpTokenByTicks(-60, 60);
            const lpToken = await ethers.getContractAt('LPToken', lpTokenAddress);
            const lpBalance = await lpToken.balanceOf(signers[1].address);

            // Withdraw all user-owned LP tokens; the permanently locked minimum remains.
            await lpToken.connect(signers[1]).approve(pluginAddr, lpBalance);
            await plugin.connect(signers[1]).withdraw(signers[1].address, -60, 60, lpBalance, 0, 0);

            const minLocked = await plugin.getMinLockedLiquidity();
            expect(await lpToken.totalSupply()).to.equal(minLocked);
            expect(await lpToken.balanceOf(LOCKED_LIQUIDITY_RECEIVER)).to.equal(minLocked);
            expect(await plugin.lpTokenByTicks(-60, 60)).to.equal(lpTokenAddress);

            // Second deposit: LP token address is set and proportional minting resumes from the locked base.
            await plugin.connect(signers[1]).deposit(
                signers[1].address, -60, 60,
                ethers.parseEther('1'), ethers.parseEther('1'),
                0, Number.MAX_SAFE_INTEGER
            );

            // Check
            expect(await lpToken.balanceOf(signers[1].address)).to.be.greaterThan(0n);
            expect(await lpToken.totalSupply()).to.be.greaterThan(minLocked);
        });

        it('should revert when the first deposit value is below the minimum initialization threshold', async function () {
            const { plugin, pluginAddr, token0, token1, signers } = await setup(1);
            await token0.connect(signers[1]).approve(pluginAddr, ethers.MaxUint256);
            await token1.connect(signers[1]).approve(pluginAddr, ethers.MaxUint256);
            await expect(
                plugin.connect(signers[1]).deposit(
                    signers[1].address, -60, 60,
                    1n, 1n,
                    0, Number.MAX_SAFE_INTEGER
                )
            ).to.be.revertedWith('Initial value too low');
        });

        it('should derive the initialization minimum inside LPPlugin from token1 decimals and leave non-zero position value after first mint', async function () {
            const { plugin, pluginAddr, pool, token0, token1, signers } = await setup(1);
            await token0.connect(signers[1]).approve(pluginAddr, ethers.MaxUint256);
            await token1.connect(signers[1]).approve(pluginAddr, ethers.MaxUint256);

            const minInitialValueInterface = new ethers.Interface([
                'function getMinInitialValue() view returns (uint256)',
            ]);
            const rawMinInitialValue = await ethers.provider.call({
                to: await plugin.getAddress(),
                data: minInitialValueInterface.encodeFunctionData('getMinInitialValue'),
            });
            const [minInitialValue] = minInitialValueInterface.decodeFunctionResult(
                'getMinInitialValue',
                rawMinInitialValue
            );

            const token1Decimals = Number(await token1.decimals());
            const expectedMinLocked =
                token1Decimals > 6
                    ? 10n ** BigInt(token1Decimals - 6)
                    : 1n;
            // minInitial pegged to 1000 * minLocked for constant ~0.1% lock
            // dilution across all token1 decimal counts.
            const expectedMinimum = 1000n * expectedMinLocked;
            expect(minInitialValue).to.equal(expectedMinimum);

            const tickSpacing = Number(await pool.tickSpacing());
            const tickLower = -tickSpacing;
            const tickUpper = tickSpacing;

            await plugin.connect(signers[1]).deposit(
                signers[1].address,
                tickLower,
                tickUpper,
                minInitialValue,
                minInitialValue,
                0,
                Number.MAX_SAFE_INTEGER
            );

            const { price } = await pool.globalState();
            expect(
                await plugin.positionValue(tickLower, tickUpper, price)
            ).to.be.greaterThan(0n);
        });
    });

    describe('#AfterModifyPosition', async () => {
        it('should correctly handle random deposits for mint', async function () {
            this.timeout(TIMEOUT_TESTS);

            for (let i = 0; i < NUM_FUZZ_RUNS; i++) {
                const { callback, plugin, pool, pluginAddr, token0, token1, signers } = await setup(3);

                await token0.connect(signers[1]).approve(pluginAddr, ethers.MaxUint256);
                await token1.connect(signers[1]).approve(pluginAddr, ethers.MaxUint256);

                await token0.connect(signers[2]).approve(pluginAddr, ethers.MaxUint256);
                await token1.connect(signers[2]).approve(pluginAddr, ethers.MaxUint256);

                await token0.connect(signers[3]).approve(pluginAddr, ethers.MaxUint256);
                await token1.connect(signers[3]).approve(pluginAddr, ethers.MaxUint256);

                const tickSpacing = await pool.tickSpacing();
                const tickSpacingNum = Number(tickSpacing);

                const tickA_ = Math.floor(Math.random() * 200001) - 100000;
                const tickA = tickA_ - (tickA_ % tickSpacingNum);

                const tickB_ = Math.floor(Math.random() * 200001) - 100000;
                const tickB = tickB_ - (tickB_ % tickSpacingNum);

                const amount0 = ethers.parseEther('1');
                const amount1 = ethers.parseEther('1');

                const [tickLower, tickUpper] = [Math.min(tickA, tickB), Math.max(tickA, tickB)];

                if (tickLower === tickUpper) continue;

                const tx = await plugin.connect(signers[1]).deposit(
                    signers[1].address,
                    tickLower,
                    tickUpper,
                    amount0,
                    amount1,
                    0,
                    Number.MAX_SAFE_INTEGER
                )

                const receipt = await tx.wait();
                const lpTokenAddress = await plugin.lpTokenByTicks(tickLower, tickUpper);
                const lpToken = await ethers.getContractAt("LPToken", lpTokenAddress)
                const userBalance = await lpToken.balanceOf(signers[1].address)

                const state = await pool.globalState()
                let totalSupply = await lpToken.totalSupply()
                const firstTotalSupply = totalSupply
                let initialValue = await plugin.positionValue(tickLower, tickUpper, state.price)

                const trxSecondMint = await plugin.connect(signers[2]).deposit(
                    signers[2].address,
                    tickLower,
                    tickUpper,
                    amount0,
                    amount1,
                    0,
                    Number.MAX_SAFE_INTEGER
                )
                const trxSecondReceipt = await trxSecondMint.wait()
                
                const {amount0: amount0New, amount1: amount1New} = readNewAmountsFromMintEvent(trxSecondReceipt, callback)

                let token0InToken1 = await plugin.convertToken0ToToken1(amount0New, state.price)
                let userValue = amount1New + token0InToken1
                const lpTokensToMint = (userValue * totalSupply) / initialValue
                const secondUserBalance = await lpToken.balanceOf(signers[2].address)

                totalSupply = await lpToken.totalSupply()
                initialValue = await plugin.positionValue(tickLower, tickUpper, state.price)

                const trxThirdMint = await plugin.connect(signers[3]).deposit(
                    signers[3].address,
                    tickLower,
                    tickUpper,
                    amount0,
                    amount1,
                    0,
                    Number.MAX_SAFE_INTEGER
                )
                const trxThirdReceipt = await trxThirdMint.wait()
                const {amount0: amount0NewThirdMint, amount1: amount1NewThirdMint} = readNewAmountsFromMintEvent(trxThirdReceipt, callback)

                token0InToken1 = await plugin.convertToken0ToToken1(amount0NewThirdMint, state.price)
                userValue = amount1NewThirdMint + token0InToken1
                const lpTokensToMintForThirdUser = (userValue * totalSupply) / initialValue
                const balanceThirdUser = await lpToken.balanceOf(signers[3].address)
                const minLocked = await plugin.getMinLockedLiquidity()

                expect(userBalance).to.be.equal(firstTotalSupply - minLocked)
                expect(balanceThirdUser).to.be.equals(lpTokensToMintForThirdUser)
                expect(secondUserBalance).to.be.equals(lpTokensToMint)
                expect(lpTokenAddress).to.not.be.equals(ZeroAddress)
                expect(receipt).to.not.be.undefined;
                currentTest++
                console.log(`${currentTest}/${NUM_FUZZ_RUNS}  [${tickLower}/${tickUpper}]`)
            }
        }).timeout(TIMEOUT_TESTS);
    })
})