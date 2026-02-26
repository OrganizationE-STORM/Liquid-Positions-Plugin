import { EventLog, ZeroAddress } from 'ethers';
import { ethers } from 'hardhat';
import { setup } from '../utils/setup';
import { expect } from "chai";
import { ContractTransactionReceipt } from 'ethers';
import { LPCallback } from '../../typechain-types';

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

    const INITIAL_LP_TOKEN_TO_MINT = 10n ** 32n;
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

                expect(userBalance).to.be.equal(INITIAL_LP_TOKEN_TO_MINT)
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