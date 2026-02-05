import { ethers } from 'hardhat';
import { setup } from '../utils/setup';
import { expect } from "chai";
import type { ContractTransactionReceipt } from "ethers"
import { INonfungiblePositionManager, LPCallback } from '../../typechain-types';
import { PluginFixture } from '../shared/fixtures';

const NUM_FUZZ_RUNS = process.env.CI ? 10_000 : 2;
const TIMEOUT_TESTS = 100_000_000_000_000;

describe("LPPlugin", () => {
    const INITIAL_LP_TOKEN_TO_MINT = 10n ** 32n;

    const readTokenIdFromEvent = (
        positionManager: INonfungiblePositionManager,
        receipt: ContractTransactionReceipt | null
    ) => {
        if (!receipt) throw new Error(`No receipt found in argument`)
        let tokenId;
        for (const log of receipt!.logs) {
            try {
                const parsed = positionManager.interface.parseLog(log);
                if (parsed && parsed.name === "IncreaseLiquidity") {
                    tokenId = BigInt(parsed.args.tokenId ?? parsed.args[0]);
                }
            } catch { }
        }
        if (!tokenId) {
            throw new Error(`No token id found in event`)
        }
        return tokenId
    }

    const readNewAmountsFromMintEvent = (
        receipt: ContractTransactionReceipt | null,
        lpcallback: LPCallback
    ) => {
        let amount0, amount1;
        for (const log of receipt!.logs) {
            try {
                const parsed = lpcallback.interface.parseLog(log);
                if (parsed && parsed.name === "PositionMinted") {
                    amount0 = BigInt(parsed.args.amount0 ?? parsed.args[0]);
                    amount1 = BigInt(parsed.args.amount1 ?? parsed.args[1]);
                }
            } catch { }
        }
        if (amount0 == undefined || amount1 == undefined) {
            throw new Error(`No amounts found in event`)
        }
        return { amount0, amount1 }
    }

    const generateParamsForTest = () => {
        const tickA_ = Math.floor(Math.random() * 200001) - 100000;
        const tickA = tickA_ - (tickA_ % 60);

        const tickB_ = Math.floor(Math.random() * 200001) - 100000;
        const tickB = tickB_ - (tickB_ % 60);

        const amount0Desired = ethers.parseEther('1');
        const amount1Desired = ethers.parseEther('1');

        const [tickLower, tickUpper] = [Math.min(tickA, tickB), Math.max(tickA, tickB)];

        return {
            tickLower,
            tickUpper,
            amount0Desired,
            amount1Desired
        }
    }

    const sendERC721ToPlugin = async (
        tickUpper: number,
        tickLower: number,
        amount0Desired: bigint,
        amount1Desired: bigint,
        vars: PluginFixture,
        signedIndex: number
    ): Promise<{ receiptTransferFrom: ContractTransactionReceipt, tokenIdNft: bigint }> => {
        const { pluginAddr, plugin, positionManager, pluginFactoryAddr, token0, token1, signers } = vars;
        const token0Address = await token0.getAddress()
        const token1Address = await token1.getAddress()

        const trxNFTMint = await positionManager.connect(signers[signedIndex]).mint({
            token0: token0Address,
            token1: token1Address,
            deployer: pluginFactoryAddr,
            tickLower,
            tickUpper,
            amount0Desired,
            amount1Desired,
            amount0Min: 0n,
            amount1Min: 0n,
            recipient: signers[signedIndex].address,
            deadline: Math.floor(Date.now() / 1000) + 60 * 99999999
        })
        const receiptNFTMint = await trxNFTMint.wait()
        let tokenId: bigint = readTokenIdFromEvent(positionManager, receiptNFTMint);

        const slippageData = ethers.AbiCoder.defaultAbiCoder().encode(['uint256', 'uint256'], [0, 0]);
        const trxTransferFrom = await positionManager.connect(signers[signedIndex])['safeTransferFrom(address,address,uint256,bytes)'](
            signers[signedIndex].address,
            pluginAddr,
            tokenId!,
            slippageData
        )
        const receiptTransferFrom = await trxTransferFrom.wait()
        if (!receiptTransferFrom) throw new Error(`No receipt found`)
        return { receiptTransferFrom, tokenIdNft: tokenId }
    }

    describe('#onERC271Received', async () => {
        it('should open a position depositing an NFT', async function () {
            let currentTest = 0;

            for (let i = 0; i < NUM_FUZZ_RUNS; i++) {
                const vars = await setup(1);
                const { plugin, positionManager, signers } = vars

                const { tickLower, tickUpper, amount0Desired, amount1Desired } = generateParamsForTest()
                if (tickLower === tickUpper) continue;

                const { receiptTransferFrom, tokenIdNft } = await sendERC721ToPlugin(
                    tickUpper,
                    tickLower,
                    amount0Desired,
                    amount1Desired,
                    vars,
                    1
                )

                const erc721BalanceUser = await positionManager.balanceOf(signers[1].address)
                const erc721BalancePlugin = await positionManager.balanceOf(await plugin.getAddress())
                const lpTokenAddress = await plugin.lpTokenByTicks(tickLower, tickUpper);
                const lpToken = await ethers.getContractAt("LPToken", lpTokenAddress)
                const userBalance = await lpToken.balanceOf(signers[1].address)

                expect(userBalance).to.be.equals(INITIAL_LP_TOKEN_TO_MINT)
                expect(erc721BalancePlugin).to.be.equals(0)
                expect(erc721BalanceUser).to.be.equals(0)
                expect(tokenIdNft).not.to.be.undefined
                expect(receiptTransferFrom).to.not.be.undefined
                currentTest++
                console.log(`${currentTest}/${NUM_FUZZ_RUNS}  [${tickLower}/${tickUpper}]`)
            }
        }).timeout(TIMEOUT_TESTS);
        it('should open a position depositing an NFT with multiple users', async () => {
            let currentTest = 0;

            for (let i = 0; i < NUM_FUZZ_RUNS; i++) {
                const usersInTest = 3
                const vars = await setup(usersInTest);
                const { plugin, signers, pool } = vars

                const { tickLower, tickUpper, amount0Desired, amount1Desired } = generateParamsForTest()
                if (tickLower === tickUpper) continue;

                await sendERC721ToPlugin(
                    tickUpper,
                    tickLower,
                    amount0Desired,
                    amount1Desired,
                    vars,
                    1
                )

                const callbackAddress = await plugin.callback()
                const callback = await ethers.getContractAt("LPCallback", callbackAddress)

                for (let i = 2; i <= usersInTest; ++i) {
                    const state = await pool.globalState()

                    const lpTokenAddress = await plugin.lpTokenByTicks(tickLower, tickUpper);
                    const lpToken = await ethers.getContractAt("LPToken", lpTokenAddress)
                    let totalSupply = await lpToken.totalSupply()
                    const initialValue = await plugin.positionValue(tickLower, tickUpper, state.price)

                    const { receiptTransferFrom } = await sendERC721ToPlugin(
                        tickUpper,
                        tickLower,
                        amount0Desired,
                        amount1Desired,
                        vars,
                        i
                    )

                    const { amount0, amount1 } = readNewAmountsFromMintEvent(receiptTransferFrom, callback)
                    let token0InToken1 = await plugin.convertToken0ToToken1(amount0, state.price)
                    let userValue = amount1 + token0InToken1
                    const lpTokensToMint = (userValue * totalSupply) / initialValue
                    const userBalance = await lpToken.balanceOf(signers[i].address)

                    expect(userBalance).to.be.equals(lpTokensToMint)
                }

                currentTest++
                console.log(`${currentTest}/${NUM_FUZZ_RUNS}  [${tickLower}/${tickUpper}]`)
            }
        }).timeout(TIMEOUT_TESTS);
    })
})