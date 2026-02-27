require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-ignition");

const DEPLOYER_PRIVATE_KEY = vars.has("GATED_DEPOSIT_DEPLOYER_PRIVATE_KEY") ? [ vars.get("GATED_DEPOSIT_DEPLOYER_PRIVATE_KEY") ] : undefined;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
	paths: {
		sources: "./contracts",
	},
	networks: {
		hardhat: {
		  	chainId: 1337,
		  	allowBlocksWithSameTimestamp: true,
		  	gas: 8000000,
		 	mining: {
				auto: true,
				interval: 0
		  	}
		},
		sepolia: {
			chainId: 11155111,
			url: `https://rpc.sepolia.ethpandaops.io/`,
      		accounts: DEPLOYER_PRIVATE_KEY,
		},
		holesky: {
			chainId: 17000,
			url: `https://rpc.holesky.ethpandaops.io/`,
      		accounts: DEPLOYER_PRIVATE_KEY,
		},
		hoodi: {
			chainId: 560048,
			url: `https://rpc.hoodi.ethpandaops.io/`,
      		accounts: DEPLOYER_PRIVATE_KEY,
		},
		ephemery: {
			url: `https://otter.bordel.wtf/erigon`,
      		accounts: DEPLOYER_PRIVATE_KEY,
		},
	},
	solidity: {
		compilers: [
			{
				version: "0.6.11",
				settings: {
					optimizer: {
						enabled: true,
						runs: 5000000,
					},
					metadata: {
						bytecodeHash: "none",
						useLiteralContent: true,
					},
					outputSelection: {
						"*": {
							"*": [
								"abi",
								"evm.bytecode",
								"evm.deployedBytecode",
								"evm.methodIdentifiers",
								"metadata"
							],
							"": ["ast"]
						}
					},
				},
			},
			{
				version: "0.8.30",
				settings: {
					evmVersion: "istanbul",
					optimizer: {
						enabled: true,
						runs: 2000,
					},
					metadata: {
						bytecodeHash: "none",
						useLiteralContent: true,
					},
					outputSelection: {
						"*": {
							"*": [
								"abi",
								"evm.bytecode",
								"evm.deployedBytecode",
								"evm.methodIdentifiers",
								"metadata"
							],
							"": ["ast"]
						}
					},
				},
			},
		],
	},
};
