import { ethers } from "hardhat";
import { NonFungiblePositionManager_ABI } from "./nonFungiblePositionManagerABI";
import { AlgebraPool_ABI } from "./algebraPoolABI";
import { LPPluginFactory, LPPluginFactory__factory } from "../typechain-types";
import { impersonateAccount } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { impersonate } from "../test/shared/helpers";

const helpers = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const ERC20_ABI = [
	"function balanceOf(address owner) view returns (uint256)",
	"function approve(address spender, uint256 amount) returns (bool)",
	"function allowance(address owner, address spender) view returns (uint256)",
	"function mint(address to, uint256 amount)",
];

const USDC_ADDRESS = "0x498581ff718922c3f8e6a244956af099b2652b2b";
const TREB_ADDRESS = "0x682fda10b36631a3fb8126cc5cd9892741417b5b ";
const POOL_ADDRESS = "0x682fda10b36631a3fb8126cc5cd9892741417b5b";
const POSITION_MANAGER_ADDRESS = "0xf78eE4b692f5FAD62Cc3820f3dC8E699FcEE7143";
const ADDRESS_2 = "0x2eb761860716672a0c36a5bbe4b21a4f20681d8a";

// const x = {
// 	token0: "0x55d398326f99059fF775485246999027B3197955",
// 	token1: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
// 	deployer: "0x06852dC9D6E44782Dd02994C368feBc4dC1b8a17",
// 	tickLower: -1,
// 	tickUpper: 1,
// 	amount0Desired: 100000000000000000000,
// 	amount1Desired: 100000000000000000000,
// 	amount0Min: 0,
// 	amount1Min: 0,
// 	recipient: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
// 	deadline: 1863982009,
// };

async function main() {
	// Impersona un account con molti token
	const addressWithBoth = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
	await helpers.impersonateAccount(addressWithBoth);
	const impersonatedSigner = await ethers.getSigner(addressWithBoth);

	// Inizializza i contratti
	const trebContract = await ethers.getContractAt(ERC20_ABI, TREB_ADDRESS, await impersonate("0xf66861479fFd594984eBdb7ba4B7A4f8BaE630b5"));
	const usdcContract = await ethers.getContractAt(ERC20_ABI, USDC_ADDRESS, await impersonate("0x6aAFF8af0ae8017725312C388bA3745dfE91185B"));
	const poolContract = await ethers.getContractAt(AlgebraPool_ABI, POOL_ADDRESS, await impersonate("0x3D58C49884bf74045B98DdC09EB4Fe2318624F4B"));
	const nonFungiblePositionManagerContract = new ethers.Contract(
		POSITION_MANAGER_ADDRESS,
		NonFungiblePositionManager_ABI,
		await impersonate("0xBd362c739ea440404585332bc5E4046bf8f73BF9")
	);

	const PF = new LPPluginFactory__factory(await ethers.provider.getSigner("0x498581ff718922c3f8e6a244956af099b2652b2b"));
	const pluginFactory = (await PF.deploy()) as LPPluginFactory;
	await pluginFactory.waitForDeployment();

	// Deploy plugin and attach to pool
	const PLUGIN_FEE = 500;
	const txPlugin = await pluginFactory.deploy(POOL_ADDRESS, PLUGIN_FEE); // esempio pluginFee
	const receiptPlugin = await txPlugin.wait();
	if (!receiptPlugin) {
		throw new Error("Plugin deployment failed, no events found in receipt");
	}

	let pluginAddress = ethers.ZeroAddress;
	// Extract plugin address from receipt events
	for (const log of receiptPlugin.logs) {
		try {
			const parsed = pluginFactory.interface.parseLog(log);
			if (!parsed) continue;
			if (parsed.name === "PluginDeployed") {
				console.log("Plugin address:", parsed.args.plugin);
				pluginAddress = parsed.args.plugin;
				break; // Exit loop after finding the plugin address
			}
		} catch {
			// log proviene da un altro contratto/evento: ignoralo
		}
	}

	// Call setPlugin on pool
	await poolContract.setPlugin(pluginAddress);

	await trebContract.mint(addressWithBoth, ethers.parseUnits("1000", 18));
	await usdcContract.mint(addressWithBoth, ethers.parseUnits("1000", 18));

	// Controlla i bilanci
	const trebBalance = await trebContract.balanceOf(addressWithBoth);
	const usdcBalance = await usdcContract.balanceOf(addressWithBoth);
	console.log("TREB Balance:", ethers.formatUnits(trebBalance, 18));
	console.log("USDC Balance:", ethers.formatUnits(usdcBalance, 18));

	// Controlla informazioni del pool e del NonFungiblePositionManager
	const globalState = await poolContract.globalState();
	const tickSpacing = await poolContract.tickSpacing();
	const token0 = await poolContract.token0();
	const token1 = await poolContract.token1();
	const poolDeployer = await nonFungiblePositionManagerContract.poolDeployer();

	console.log("Pool info:");
	console.log("- Token0:", token0);
	console.log("- Token1:", token1);
	console.log("- Current tick:", globalState.tick);
	console.log("- Tick spacing:", tickSpacing);
	console.log("- Pool deployer:", poolDeployer);

	// Definisci i tick validi (devono essere multipli di tickSpacing)
	const spacing = Number(tickSpacing); // tickSpacing è un BigInt, va convertito
	const currentTick = Number(globalState.tick);

	// Arrotonda ai multipli più vicini
	const tickLower = Math.floor(currentTick / spacing - 1) * spacing;
	const tickUpper = Math.floor(currentTick / spacing + 1) * spacing;

	console.log("Tick range:", tickLower, "to", tickUpper);

	// Quantità di token da utilizzare (adjust based on token decimals)
	const amount0Desired = ethers.parseUnits("100", 18); // TREB/USDC usually have 18 decimals on BSC
	const amount1Desired = ethers.parseUnits("100", 18);

	// Controlla e approva i token se necessario
	const allowanceTREB = await trebContract.allowance(addressWithBoth, POSITION_MANAGER_ADDRESS);
	const allowanceUSDC = await usdcContract.allowance(addressWithBoth, POSITION_MANAGER_ADDRESS);

	console.log("Current allowances:");
	console.log("- TREB:", ethers.formatUnits(allowanceTREB, 18));
	console.log("- USDC:", ethers.formatUnits(allowanceUSDC, 18));

	if (allowanceTREB < amount0Desired) {
		console.log("Approving TREB...");
		const approveTx = await trebContract.connect(impersonatedSigner).approve(POSITION_MANAGER_ADDRESS, ethers.MaxUint256);
		await approveTx.wait();
		console.log("TREB approved");
	}

	if (allowanceUSDC < amount1Desired) {
		console.log("Approving USDC...");
		const approveTx = await usdcContract.connect(impersonatedSigner).approve(POSITION_MANAGER_ADDRESS, ethers.MaxUint256);
		await approveTx.wait();
		console.log("USDC approved");
	}

	// Parametri per il mint (struct MintParams)
	const mintParams = {
		token0: token0,
		token1: token1,
		deployer: "0x0000000000000000000000000000000000000000",
		tickLower: BigInt(tickLower),
		tickUpper: BigInt(tickUpper),
		amount0Desired: amount0Desired,
		amount1Desired: amount1Desired,
		amount0Min: 0n, // Minimum amounts (per slippage protection)
		amount1Min: 0n,
		recipient: addressWithBoth,
		deadline: Math.floor(Date.now() / 1000) + 60 * 10, // 10 minuti da ora
	};

	console.log("Mint parameters:", mintParams);
	let mintData;
	try {
		console.log("Calling mint function with struct parameters...");
		const mintTx = await nonFungiblePositionManagerContract.mint(mintParams, {
			maxFeePerGas: BigInt("50000000000"),
			maxPriorityFeePerGas: BigInt("50000000000"),
			gasLimit: 1_500_000n, // opzionale, ma consigliato
		});

		console.log("Transaction sent, waiting for confirmation...");
		mintData = await mintTx.wait();

		console.log("Position minted successfully!");
		console.log("Transaction info:", mintData);

		// Estrai il token ID dalla transazione se disponibile
		const events = mintTx.logs || [];
		const mintEvent = events.find((event: any) => event.topics && event.topics[0]);
		if (mintEvent) {
			console.log("Mint event found in logs");
		}
	} catch (error: any) {
		console.error("❌ Mint callStatic failed", error);
		console.error("Data:", error.data); // se disponibile, può essere decodificato
	}

	const balanceBefore = await nonFungiblePositionManagerContract.balanceOf(addressWithBoth);
	console.log("Balance of ADDRESS_1: ", balanceBefore.toString());

	// const trx = await nonFungiblePositionManagerContract.safeTransferFrom(addressWithBoth, "0xD1E69CEf63a810F521C07C76BD07952B316aBE8c", "31013");
	// const res = await trx.wait();
	// console.log(res);

	console.log("Approving position transfer to ADDRESS_2...");
	const trxApprove = await nonFungiblePositionManagerContract.approve(ADDRESS_2, "31369");
	await trxApprove.wait();
	console.log("Position approved for transfer to ADDRESS_2");

	const balanceAfter = await nonFungiblePositionManagerContract.balanceOf(addressWithBoth);
	console.log("Balance of ADDRESS_1:", balanceAfter.toString());

	const balanceAddress2After = await nonFungiblePositionManagerContract.balanceOf(ADDRESS_2);
	console.log("Balance of ADDRESS_2:", balanceAddress2After.toString());

	// Impersonifico l'altro address
	await helpers.impersonateAccount(ADDRESS_2);
	const impersonatedSigner2 = await ethers.getSigner(ADDRESS_2);

	// Inizializza i contratti
	const nonFungiblePositionManagerContract2 = new ethers.Contract(POSITION_MANAGER_ADDRESS, NonFungiblePositionManager_ABI, impersonatedSigner2);

	const balanceAddress2 = await nonFungiblePositionManagerContract2.balanceOf(ADDRESS_2);
	console.log("Balance of NonFungiblePositionManager ADDRESS 2:", balanceAddress2.toString());

	await impersonatedSigner.sendTransaction({
		to: ADDRESS_2,
		value: ethers.parseEther("1"), // Invia 1 ETH per
	});

	console.log("Decreasing liquidity...");
	const trxDecreaseLiquidity = await nonFungiblePositionManagerContract2.decreaseLiquidity(
		{
			tokenId: "31369",
			liquidity: 1067004209961263904038863n / 2n,
			amount0Min: 0n,
			amount1Min: 0n,
			deadline: Math.floor(Date.now() / 1000) + 60 * 10, // 10 minuti da ora
		},
		{
			maxFeePerGas: BigInt("50000000000"),
			maxPriorityFeePerGas: BigInt("50000000000"),
			gasLimit: 1_500_000n, // opzionale, ma consigli
		}
	);
	console.log("Decrease liquidity transaction sent, waiting for confirmation...");
	const receiptDecreaseLiquidity = await trxDecreaseLiquidity.wait();
	console.log("Decrease liquidity successful!");
	console.log("Transaction hash:", receiptDecreaseLiquidity.hash);

	console.log("Collecting fees...");
	const trxCollect = await nonFungiblePositionManagerContract2.collect(
		{
			tokenId: "31369",
			recipient: ADDRESS_2,
			amount0Max: 100000000000000000000n,
			amount1Max: 100000000000000000000n,
		},
		{
			maxFeePerGas: BigInt("50000000000"),
			maxPriorityFeePerGas: BigInt("50000000000"),
			gasLimit: 1_500_000n, // opzionale, ma consigliato
		}
	);
	console.log("Collect transaction sent, waiting for confirmation...");
	const receiptCollect = await trxCollect.wait();
	console.log("Collect fees successful!");
	console.log("Data:", receiptCollect);

	const trebBalance2 = await trebContract.balanceOf(ADDRESS_2);
	const usdcBalance2 = await usdcContract.balanceOf(ADDRESS_2);
	console.log("TREB Balance ADDRESS 2:", ethers.formatUnits(trebBalance2, 18));
	console.log("USDC Balance ADDRESS 2:", ethers.formatUnits(usdcBalance2, 18));
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Full error:", error);
		if (error && error.error && error.error.data) {
			console.error("Error data:", error.error.data);
		}
		if (error && error.reason) {
			console.error("Revert reason:", error.reason);
		}
		process.exit(1);
	});
