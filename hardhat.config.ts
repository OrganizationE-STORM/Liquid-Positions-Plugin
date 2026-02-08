import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "solidity-coverage";
import "hardhat-tracer";
//import * as tenderly from "@tenderly/hardhat-tenderly";
import dotenv from "dotenv";
import "hardhat-contract-sizer";

// Load environment variables
dotenv.config();

const { ETHERSCAN_API_KEY, PK, INFURA_KEY, ALCHEMY_URL, VIRTUAL_URL } = process.env;

const config: HardhatUserConfig = {
	solidity: {
		compilers: [
			{
				version: "0.8.20",
				settings: {
					viaIR: true,
					optimizer: {
						enabled: true,
						runs: 500,
					},
				},
			},
			{
				version: "0.8.0",
			},
			{ version: "0.8.1" },
			{ version: "0.8.21" },
			{ version: "0.8.22" },
		],
	},
	// contractSizer: {
	// 	runOnCompile: false,
	// },
};

//tenderly.setup({ automaticVerifications: true });

export default {
	networks: {
		hardhat: {
			chainId: 31337,
			mining: {
				auto: true,
				interval: 0
			},

			blockGasLimit: 30000000,
			mocha: {
				timeout: 100000000
			},
			gasPrice: 50000000000,
			initialBaseFeePerGas: 5000000000,
		},
		localhost: {
			mocha: {
				timeout: 100000000
			},
			url: "http://127.0.0.1:8545", // Hardhat node locale
			chainId: 31337,
			allowUnlimitedContractSize: true,
			blockGasLimit: 30000000,

			gasPrice: 50000000000,
			initialBaseFeePerGas: 5000000000,
		},
		mainnet: {
			url: `https://mainnet.infura.io`,
			chainId: 1,
			accounts: [`0x${PK || "1000000000000000000000000000000000000000000000000000000000000000"}`],
		},
		virtualNetwork: {
			url: VIRTUAL_URL ?? "",
			chainId: 56,
			timeout: 1200000000000, // Aumenta timeout in ms
			httpHeaders: {
				"Content-Type": "application/json",
			},
		},
	},
	solidity: config.solidity,
	etherscan: {
		// Your API key for Etherscan
		// Obtain one at https://etherscan.io/
		apiKey: `${ETHERSCAN_API_KEY}`,
		customChains: [],
	},
	tenderly: {
		project: "project",
		username: "Comers",
	},
};
