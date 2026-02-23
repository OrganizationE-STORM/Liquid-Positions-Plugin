import { EventLog, ZeroAddress } from 'ethers';
import { ethers } from 'hardhat';
import { setup } from '../utils/setup';
import { expect } from "chai";

const NUM_FUZZ_RUNS = process.env.CI ? 10 : 2;
const TIMEOUT_TESTS = 100_000_000_000_000;

describe("LPPlugin", () => {
    const INITIAL_LP_TOKEN_TO_MINT = 10n ** 32n;
    let currentTest = 0;

    describe('#LPToken', async () => {
        it('should create LP token with correct name and symbol', async function () {
            const { callback, plugin, token0, token1, signers } = await setup(1);

            await token0.connect(signers[1]).approve(callback, ethers.MaxUint256);
            await token1.connect(signers[1]).approve(callback, ethers.MaxUint256);

            const tickLower = -60;
            const tickUpper = 60;
            const amount0 = ethers.parseEther('1');
            const amount1 = ethers.parseEther('1');

            await callback.connect(signers[1]).mint(
                signers[1].address,
                tickLower,
                tickUpper,
                amount0,
                amount1
            );

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
                const { callback, plugin, pool, token0, token1, signers } = await setup(3);

                await token0.connect(signers[1]).approve(callback, ethers.MaxUint256);
                await token1.connect(signers[1]).approve(callback, ethers.MaxUint256);

                await token0.connect(signers[2]).approve(callback, ethers.MaxUint256);
                await token1.connect(signers[2]).approve(callback, ethers.MaxUint256);

                await token0.connect(signers[3]).approve(callback, ethers.MaxUint256);
                await token1.connect(signers[3]).approve(callback, ethers.MaxUint256);

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

                const tx = await callback.connect(signers[1]).mint(
                    signers[1].address,
                    tickLower,
                    tickUpper,
                    amount0,
                    amount1
                );

                const receipt = await tx.wait();
                const lpTokenAddress = await plugin.lpTokenByTicks(tickLower, tickUpper);
                const lpToken = await ethers.getContractAt("LPToken", lpTokenAddress)
                const userBalance = await lpToken.balanceOf(signers[1].address)

                const state = await pool.globalState()
                let totalSupply = await lpToken.totalSupply()
                let initialValue = await plugin.positionValue(tickLower, tickUpper, state.price)

                const trxSecondMint = await callback.connect(signers[2]).mint(
                    signers[2].address,
                    tickLower,
                    tickUpper,
                    amount0,
                    amount1
                )
                const trxSecondReceipt = await trxSecondMint.wait()
                const [amount0New, amount1New]: bigint[] = (trxSecondReceipt?.logs.filter(log => {
                    const logAsEventLog = log as EventLog
                    return logAsEventLog.fragment != undefined && logAsEventLog.fragment.name === "PositionMinted"
                })[0] as EventLog).args

                let token0InToken1 = await plugin.convertToken0ToToken1(amount0New, state.price)
                let userValue = amount1New + token0InToken1
                const lpTokensToMint = (userValue * totalSupply) / initialValue
                const secondUserBalance = await lpToken.balanceOf(signers[2].address)

                totalSupply = await lpToken.totalSupply()
                initialValue = await plugin.positionValue(tickLower, tickUpper, state.price)

                const trxThirdMint = await callback.connect(signers[3]).mint(
                    signers[3].address,
                    tickLower,
                    tickUpper,
                    amount0,
                    amount1
                )
                const [amount0NewThirdMint, amount1NewThirdMint]: bigint[] = (trxSecondReceipt?.logs.filter(log => {
                    const logAsEventLog = log as EventLog
                    return logAsEventLog.fragment != undefined && logAsEventLog.fragment.name === "PositionMinted"
                })[0] as EventLog).args
                const receiptThirdMint = await trxThirdMint.wait()

                token0InToken1 = await plugin.convertToken0ToToken1(amount0NewThirdMint, state.price)
                userValue = amount1NewThirdMint + token0InToken1
                const lpTokensToMintForThirdUser = (userValue * totalSupply) / initialValue
                const balanceThirdUser = await lpToken.balanceOf(signers[3].address)

                expect(receiptThirdMint).to.not.be.undefined
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