import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ZeroAddress } from "ethers";
import {
	LPPluginFactory,
	LPPlugin,
	IAlgebraFactory,
	IAlgebraPool,
	MockToken,
	INonfungiblePositionManager,
	IWNativeToken,
	LPCallback,
	TestUtils,
} from "../../typechain-types";
import { entrypointFixture } from "./externalFixtures";
import AlgebraPool from "@cryptoalgebra/integral-core/artifacts/contracts/AlgebraPool.sol/AlgebraPool.json";
import NonFungiblePositionManagerArtifacts from "@cryptoalgebra/integral-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json";
import NonFungiblePositionManagerDesccriptorArtifacts from "@cryptoalgebra/integral-periphery/artifacts/contracts/NonfungibleTokenPositionDescriptor.sol/NonfungibleTokenPositionDescriptor.json";
import SwapRouterArtifacts from "@cryptoalgebra/integral-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json";

import NFTDescriptorArtifacts from "@cryptoalgebra/integral-periphery/artifacts/contracts/libraries/NFTDescriptor.sol/NFTDescriptor.json";
import { linkLibraries } from "../utils/linkLibraries";
import wTokenArtifacts from "../../wTokenArtifacts/wTokenArtifacts.json"
import { encodePriceSqrt } from "./encodePriceSqrt";
/**
 * @notice Structure describing the deployed test environment.
 */
export interface PluginFixture {
	signers: HardhatEthersSigner[];
	algebraFactory: IAlgebraFactory;
	token0: MockToken;
	token1: MockToken;
	pluginFactory: LPPluginFactory;
	plugin: LPPlugin;
	pool: IAlgebraPool;
	positionManager: INonfungiblePositionManager;
	swapRouter: any;
	poolAddr: string;
	pluginAddr: string;
	positionManagerAddr: string;
	pluginFactoryAddr: string;
	swapRouterAddr: string;
	wnative: IWNativeToken;
	callback: LPCallback;
	utils: TestUtils
}

// Generic Fixture type
type Fixture<T> = (numberOfUsers: number) => Promise<T>;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * @notice Deploys a full testing environment for LPPlugin.
 * @dev This fixture sets up:
 *      - Two mock ERC20 tokens
 *      - An AlgebraFactory (from \@cryptoalgebra)
 *      - A mock pool
 *      - LPPluginFactory
 *      - An LPPlugin instance attached to the pool
 *      - A MockPositionManager
 */
export const pluginFixture: Fixture<PluginFixture> = async function (numberOfUsers: number): Promise<PluginFixture> {
	const { customEntrypoint, factory, token0, token1, signers } = await entrypointFixture();

	const lpTokenFactoryFactory = await ethers.getContractFactory('LPTokenFactory')
	const lpTokenFactory = await lpTokenFactoryFactory.deploy();

	const pluginFactoryFactory = await ethers.getContractFactory('LPPluginFactory');
	const pluginFactory = (await pluginFactoryFactory.deploy(customEntrypoint, ZeroAddress, await lpTokenFactory.getAddress())) as LPPluginFactory;

	const token0Address = await token0.getAddress();
	const token1Address = await token1.getAddress();
	await factory.setDefaultPluginFactory(await pluginFactory.getAddress())

	// Create the pool via the plugin factory
	await pluginFactory.createCustomPool(
		ZERO_ADDRESS,
		token0Address,
		token1Address,
		'0x'
	);

	// Fetch the created pool address from the factory
	const poolAddress = await factory.customPoolByPair(
		await pluginFactory.getAddress(),
		token0Address,
		token1Address,
	)

	// Attach to the deployed pool
	const poolFactory = await ethers.getContractFactory(AlgebraPool.abi, AlgebraPool.bytecode);
	const pool = poolFactory.attach(poolAddress) as any as IAlgebraPool

	// Attach to the deployed plugin
	const pluginTypeFactory = await ethers.getContractFactory('LPPlugin');
	const pluginAddress = await pool.plugin();
	const plugin = pluginTypeFactory.attach(pluginAddress) as any as LPPlugin;


	//Code Taken form src/farming/test/shared/fixtures.ts

	// Initialize pool first before creating position manager
	await pool.initialize(encodePriceSqrt(1, 1));

	// Fund the deployer with tokens for initial liquidity
	const initialLiquidity = ethers.parseEther("2000000"); // 2M tokens each
	await token0.mint(signers[0].address, initialLiquidity);
	await token1.mint(signers[0].address, initialLiquidity);

	// // Fund the user with tokens for testing
	for (let i = 0; i < numberOfUsers + 1; ++i) {
		await token0.mint(signers[i + 1].address, initialLiquidity);
		await token1.mint(signers[i + 1].address, initialLiquidity);
	}

	// Create a NFTDescriptor instance
	// This is needed as NonfungiblePositionManager requires it in the constructor
	// It is used to generate token URIs for the position NFTs
	const NFTDescriptorFactory_ = await ethers.getContractFactory(NFTDescriptorArtifacts.abi, NFTDescriptorArtifacts.bytecode);
	const nftDescriptor = await NFTDescriptorFactory_.deploy() as any;

	// Deploy WNativeToken
	// This is needed as NonfungiblePositionManager requires it in the constructor
	// It is used to handle native token wrapping/unwrapping for positions involving the native token
	const wnativeFactory = await ethers.getContractFactory(wTokenArtifacts.abi, wTokenArtifacts.bytecode);
	const wnative = (await wnativeFactory.deploy()) as any as IWNativeToken;

	// Deploy NonfungiblePositionManager with linked NFTDescriptor library
	// We need to link the NFTDescriptor library because NonfungiblePositionManager uses it for token URI generation
	// This is done manually here because ethers.js does not support automatic linking
	// See the linkLibraries function in utils for details
	// The library is linked by replacing the placeholder in the bytecode with the actual deployed address
	// This allows us to deploy NonfungiblePositionManager with the correct library reference

	const linkedBytecode = linkLibraries(
		{
			bytecode: NonFungiblePositionManagerDesccriptorArtifacts.bytecode,
			linkReferences: {
				'NFTDescriptor.sol': {
					NFTDescriptor: [
						{
							length: 20,
							start: NonFungiblePositionManagerDesccriptorArtifacts.linkReferences['contracts/libraries/NFTDescriptor.sol'].NFTDescriptor[0].start,
						},
					],
				},
			},
		},
		{
			NFTDescriptor: await nftDescriptor.getAddress(),
		}
	);

	// Now deploy the NonfungiblePositionManager with the linked bytecode
	// We pass token0 address for fee collection, a name prefix for the NFTs, and an empty array for operators
	// The factory's poolDeployer is used to ensure compatibility with the pools created by the factory
	// This setup allows us to mint and manage liquidity positions in the Algebra pools
	const NFTDescriptorFactory = await ethers.getContractFactory(
		NonFungiblePositionManagerDesccriptorArtifacts.abi,
		linkedBytecode
	);

	// Deploy the position descriptor
	// This is needed as NonfungiblePositionManager requires it in the constructor
	// It is used to generate token URIs for the position NFTs
	// 'PositionNFT' is just a name prefix string - it will appear in the NFT collection name
	// For example, the final NFT collection might be named "Algebra PositionNFT V2" or similar
	const positionDescriptor = await NFTDescriptorFactory.deploy(await token0.getAddress(), 'PositionNFT', []);


	// Deploy NonfungiblePositionManager with linked NFTDescriptor library
	// We need to link the NFTDescriptor library because NonfungiblePositionManager uses it for token URI generation
	const nftFactory = await ethers.getContractFactory(
		NonFungiblePositionManagerArtifacts.abi,
		NonFungiblePositionManagerArtifacts.bytecode
	);
	// IMPORTANT: Use factory's poolDeployer, not pluginFactory
	const factoryPoolDeployer = await factory.poolDeployer();
	const nonFungiblePositionManager = (
		await nftFactory.deploy(
			await factory.getAddress(),
			await wnative.getAddress(),
			await positionDescriptor.getAddress(),
			factoryPoolDeployer
		)
	) as INonfungiblePositionManager;

	await pluginFactory.setNonFungiblePositionManager(
		await nonFungiblePositionManager.getAddress(),
		await plugin.getAddress()
	)

	// Deploy SwapRouter
	// This is needed to test swap interactions via the router
	// We use the factory's poolDeployer to ensure compatibility with the pools created by the factory
	// The router allows for easy swapping between tokens in the pools
	// This setup enables comprehensive testing of swap functionality in conjunction with liquidity positions
	const swapRouterFactory = await ethers.getContractFactory(SwapRouterArtifacts.abi, SwapRouterArtifacts.bytecode);
	const swapRouter = await swapRouterFactory.deploy(await factory.getAddress(), await wnative.getAddress(), factoryPoolDeployer);

	// Add initial liquidity to the pool to enable swaps
	// const liquidityAmount = ethers.parseEther("100000"); // 100k tokens each

	await token0.connect(signers[0]).approve(await nonFungiblePositionManager.getAddress(), ethers.MaxUint256);
	await token1.connect(signers[0]).approve(await nonFungiblePositionManager.getAddress(), ethers.MaxUint256);

	const poolAddr = await pool.getAddress();
	const pluginAddr = await plugin.getAddress();
	const positionManagerAddr = await nonFungiblePositionManager.getAddress();
	const swapRouterAddr = await swapRouter.getAddress();

	// Setup user approvals for testing
	for (let i = 0; i < numberOfUsers; ++i) {
		await token0.connect(signers[1 + i]).approve(await nonFungiblePositionManager.getAddress(), ethers.MaxUint256);
		await token1.connect(signers[1 + i]).approve(await nonFungiblePositionManager.getAddress(), ethers.MaxUint256);
	}

	const callbackAddr = await plugin.callback();
	const callback = await ethers.getContractAt('LPCallback', callbackAddr)

	const utilsFactory = await ethers.getContractFactory('TestUtils')
	const utils = await utilsFactory.deploy()

	// console.log({
	// 	token0_address: await token0.getAddress(),
	// 	token1_address: await token1.getAddress(),
	// 	algebraFactory_address: await factory.getAddress(),
	// 	pool_address: poolAddr,
	// 	plugin_addr: pluginAddr,
	// 	positionManagerAddr: positionManagerAddr,
	// 	swapRouterAddr: swapRouterAddr,
	// 	callback
	// });


	return {
		utils,
		signers,
		token0,
		token1,
		algebraFactory: factory,
		pool: pool,
		pluginFactory,
		plugin,
		positionManager: nonFungiblePositionManager,
		swapRouter,
		poolAddr,
		pluginAddr,
		positionManagerAddr,
		pluginFactoryAddr: await pluginFactory.getAddress(),
		swapRouterAddr,
		wnative,
		callback
	};
};
