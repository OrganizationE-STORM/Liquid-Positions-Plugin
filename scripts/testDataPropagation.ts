import { ethers } from "hardhat";
import * as helpers from "@nomicfoundation/hardhat-toolbox/network-helpers";

async function main() {
	const addressWithBoth = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
	await helpers.impersonateAccount(addressWithBoth);
	const impersonatedSigner = await ethers.getSigner(addressWithBoth);

	// const ADDRESS_A = "0x5E039121Bf4457798Baf959BC46c7Ff2ecF39B02";
	const ADDRESS_B = "0x12224b5ba7D549795c09E981dAE51512B5782ABb";
	const ADDRESS_C = "0x480ca3a5162b4e41e1D3D320Ad3CF527eC20635C";

	// const C = await ethers.deployContract("C", impersonatedSigner);
	// const deployedC = await C.waitForDeployment();
	// const addressC = await deployedC.getAddress();
	// console.log({ addressC });

	// const B = await ethers.deployContract("B", [ADDRESS_C], impersonatedSigner);
	// const deployedB = await B.waitForDeployment();
	// const addressB = await deployedB.getAddress();
	// console.log({ addressB });

	const A = await ethers.deployContract("A", [ADDRESS_B], impersonatedSigner);
	const deployedA = await A.waitForDeployment();
	const addressA = await deployedA.getAddress();
	console.log({ addressA });

	// const contractA = await ethers.getContractAt("A", A.target, impersonatedSigner);
	// console.log("Calling A.start()...");
	// const tx = await contractA.start(12, {
	// 	maxFeePerGas: BigInt("50000000000"),
	// 	maxPriorityFeePerGas: BigInt("50000000000"),
	// 	gasLimit: 1_500_000n, // opzionale, ma consigli
	// }); // Passiamo un valore
	// const receipt = await tx.wait();

	// console.log("Event logs:");
	// if (!receipt) return console.error("No receipt found");

	// console.log({ logs: receipt.logs });

	// for (const log of receipt.logs) {
	// 	try {
	// 		const iface = new ethers.Interface(["event Calldata(bytes data)"]);
	// 		const parsed = iface.parseLog(log);
	// 		if (!parsed) throw new Error("Parsed log is undefined");

	// 		console.log(`msg.data in ${parsed.args.address}:`, parsed.args.data);
	// 	} catch (error) {
	// 		console.error("Error parsing log:", error);
	// 	}
	// }
}

main().catch(console.error);
