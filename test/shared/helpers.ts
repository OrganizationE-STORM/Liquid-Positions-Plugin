import { getStorageAt } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { ethers, network } from "hardhat";
import { AbiCoder, keccak256 } from 'ethers';
import fc from "fast-check";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
	LPPluginFactory,
	MockToken,
	INonfungiblePositionManager,
} from "../../typechain-types";
/**
 * @notice Impersonates an Ethereum account using Hardhat.
 * @dev Useful for calling contracts as if you were a real pool or position manager.
 * @param address The address to impersonate.
 * @returns A Signer object for the impersonated account.
 */
export async function impersonate(address: string) {
	await network.provider.request({
		method: "hardhat_impersonateAccount",
		params: [address],
	});
	return ethers.getSigner(address);
}

/**
 * @notice Generates a random unsigned bigint up to 2^n - 1 (exclusive).
 * @param n Number of bits
 * @returns A FastCheck arbitrary that generates random bigints
 */
export function bigUintN(n: number): fc.Arbitrary<bigint> {
	return fc.bigInt({ min: 0n, max: (1n << BigInt(n)) - 1n });
}

/**
 * @notice Generates a random signed bigint in the range [-2^(n-1), 2^(n-1) - 1]
 * @param n Number of bits
 * @returns A FastCheck arbitrary that generates random signed bigints
 */
export function bigIntN(n: number): fc.Arbitrary<bigint> {
	return fc.bigInt({ min: -(1n << BigInt(n - 1)), max: (1n << BigInt(n - 1)) - 1n });
}

// Constants representing the minimum and maximum tick values in Algebra pools
export const MIN_TICK = -600;
export const MAX_TICK = -MIN_TICK;

type GetPluginStorage = {
	pluginAddress: string;
	tickLower: number;
	tickUpper: number;
	storageSlot: number;
};

/**
 * @notice Reads a value from a nested mapping in a smart contract by computing storage slots.
 * @dev This is usefull when need to test private fields of a smart contract
 * @param pluginAddress Address of the LPPlugin contract
 * @param tickLower Lower tick
 * @param tickUpper Upper tick
 * @param storageSlot Base storage slot index of the mapping in the contract
 * @returns The raw storage value as a hex string
 */
async function getPluginStorage({ pluginAddress, tickLower, tickUpper, storageSlot }: GetPluginStorage): Promise<string> {
	// Compute outer mapping slot (mapping from tickLower)
	const outerSlot = keccak256(AbiCoder.defaultAbiCoder().encode(["int24", "uint256"], [tickLower, storageSlot]));
	// Compute inner mapping slot (mapping from tickUpper)
	const finalSlot = keccak256(AbiCoder.defaultAbiCoder().encode(["int24", "uint256"], [tickUpper, outerSlot]));

	// Read the value directly from contract storage
	return await getStorageAt(pluginAddress, finalSlot)
}

/**
 * @notice Reads the tokenId associated with a specific tick range from LPPlugin storage.
 * @param pluginAddress Address of the LPPlugin contract
 * @param tickLower Lower tick of the liquidity position
 * @param tickUpper Upper tick of the liquidity position
 * @returns tokenId as a bigint
 */
export async function getTokenIdPluginFromStorage({ pluginAddress, tickLower, tickUpper }: Omit<GetPluginStorage, "storageSlot">): Promise<bigint> {
	const SLOT_INDEX = 2; // tokenIdByTicks mapping is stored at slot index 2 in LPPlugin
	return BigInt(await getPluginStorage({ pluginAddress, tickLower, tickUpper, storageSlot: SLOT_INDEX }));
}

/**
 * @notice Reads the LPToken address associated with a specific tick range from LPPlugin storage.
 * @param pluginAddress Address of the LPPlugin contract
 * @param tickLower Lower tick of the liquidity position
 * @param tickUpper Upper tick of the liquidity position
 * @returns LPToken address as a hex string
 */
export async function getLpTokenPluginFromStorage({ pluginAddress, tickLower, tickUpper }: Omit<GetPluginStorage, "storageSlot">): Promise<string> {
	const SLOT_INDEX = 1; // lpTokenByTicks mapping is stored at slot index 1 in LPPlugin
	const raw = await getPluginStorage({ pluginAddress, tickLower, tickUpper, storageSlot: SLOT_INDEX });

	// Take the last 40 hex characters, which correspond to the address
	return raw.slice(-40);
}


/**
 * @notice Adds liquidity to an Algebra pool using the position manager.
 * @dev This function mints a new position NFT with specified tick range and liquidity amounts.
 *      The deployer must have sufficient token balances and the pool must be initialized.
 * @param pluginFactory The LPPluginFactory contract instance used as the pool deployer
 * @param nft The INonfungiblePositionManager contract for minting positions
 * @param deployer The signer account that will provide liquidity and receive the position NFT
 * @param token0 The first token of the pool pair (lower address)
 * @param token1 The second token of the pool pair (higher address) 
 * @param tickLower The lower tick boundary of the position range
 * @param tickUpper The upper tick boundary of the position range
 * @param liquidityAmount The amount of tokens to deposit for both token0 and token1
 * @returns Promise that resolves when the liquidity is successfully added
 */
export async function addLiquidityTPool(
	pluginFactory: LPPluginFactory,
	nft: INonfungiblePositionManager,
	deployer: HardhatEthersSigner,
	token0: MockToken, 
	token1: MockToken, 
	tickLower: number,
	tickUpper: number,
	liquidityAmount: bigint
) {
	// Add initial liquidity to the pool to enable swaps
	await token0.connect(deployer).approve(await nft.getAddress(), ethers.MaxUint256);
	await token1.connect(deployer).approve(await nft.getAddress(), ethers.MaxUint256);
	
	// Mint initial position with wide range to provide base liquidity
	// Use tick spacing of 60 and reasonable range
	await nft.connect(deployer).mint({
		token0: await token0.getAddress(),
		token1: await token1.getAddress(),
		deployer: await pluginFactory.getAddress(), // Use pluginFactory as deployer (matches pool creation)
		tickLower: tickLower,
		tickUpper: tickUpper,
		amount0Desired: liquidityAmount,
		amount1Desired: liquidityAmount,
		amount0Min: 0,
		amount1Min: 0,
		recipient: deployer.address,
		deadline: Math.floor(Date.now() / 1000) + 3600,
	});
}

