const fs = require('fs');
const path = require('path');

async function generateVerificationFiles() {
    const hre = require('hardhat');
    await hre.run('compile');

    const contractsDir = path.join(__dirname, '..', 'contracts');
    const outputDir = path.join(__dirname, '..', 'contract-json');
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Get all Solidity files in contracts directory
    const contractFiles = fs.readdirSync(contractsDir)
        .filter(file => file.endsWith('.sol'))
        .filter(file => !file.startsWith('I')); // Skip interface files

    for (const contractFile of contractFiles) {
        const fileName = path.basename(contractFile, '.sol');
        
        // Handle special case where file name doesn't match contract name
        let contractName = fileName;
        if (fileName === 'GatedDepositContract') {
            contractName = 'DepositContract';
        }
        
        try {
            const artifact = await hre.artifacts.readArtifact(contractName);
            const buildInfo = await hre.artifacts.getBuildInfo(`contracts/${contractFile}:${contractName}`);
            
            if (!buildInfo) {
                console.warn(`No build info found for ${contractName}`);
                continue;
            }

            // Generate standard input JSON for verification
            const standardInput = {
                language: "Solidity",
                sources: {},
                settings: {
                    optimizer: buildInfo.input.settings.optimizer,
                    evmVersion: buildInfo.input.settings.evmVersion || "london",
                    metadata: buildInfo.input.settings.metadata || {
                        bytecodeHash: "none",
                        useLiteralContent: true
                    },
                    outputSelection: {
                        "*": {
                            "*": [
                                "abi",
                                "evm.bytecode",
                                "evm.deployedBytecode",
                                "evm.methodIdentifiers",
                                "metadata"
                            ]
                        }
                    }
                }
            };

            // Add all source files used in compilation
            for (const [sourcePath, sourceData] of Object.entries(buildInfo.input.sources)) {
                standardInput.sources[sourcePath] = {
                    content: sourceData.content
                };
            }

            // Apply custom filters to remove unrelated contracts
            const filteredSources = {};
            
            if (contractName === 'DepositContract') {
                // For DepositContract, only keep GatedDepositContract.sol and IDepositGater.sol
                for (const [sourcePath, sourceData] of Object.entries(standardInput.sources)) {
                    if (sourcePath === 'contracts/GatedDepositContract.sol' || 
                        sourcePath === 'contracts/IDepositGater.sol') {
                        filteredSources[sourcePath] = sourceData;
                    }
                }
            } else if (contractName === 'TokenDepositGater') {
                // For TokenDepositGater, exclude GatedDepositContract.sol
                for (const [sourcePath, sourceData] of Object.entries(standardInput.sources)) {
                    if (sourcePath !== 'contracts/GatedDepositContract.sol') {
                        filteredSources[sourcePath] = sourceData;
                    }
                }
            } else if (contractName === 'SimpleAccessControl') {
                // Skip SimpleAccessControl entirely - don't generate files for it
                console.log(`Skipping ${contractName} - filtered out`);
                continue;
            } else {
                // For other contracts, keep all sources
                Object.assign(filteredSources, standardInput.sources);
            }
            
            standardInput.sources = filteredSources;

            // Write standard input file
            const outputFileName = fileName === 'GatedDepositContract' ? 'DepositContract' : contractName;
            const standardInputPath = path.join(outputDir, `${outputFileName}-standard-input.json`);
            fs.writeFileSync(standardInputPath, JSON.stringify(standardInput, null, 2));

            // Generate contract metadata file
            const contractInfo = {
                contractName: contractName,
                sourcePath: `contracts/${contractFile}`,
                abi: artifact.abi,
                bytecode: artifact.bytecode,
                deployedBytecode: artifact.deployedBytecode,
                compiler: {
                    version: buildInfo.solcVersion,
                    settings: buildInfo.input.settings
                },
                networks: {},
                metadata: buildInfo.output.contracts[`contracts/${contractFile}`][contractName].metadata
            };

            const contractInfoPath = path.join(outputDir, `${outputFileName}.json`);
            fs.writeFileSync(contractInfoPath, JSON.stringify(contractInfo, null, 2));

            console.log(`Generated verification files for ${contractName}:`);
            console.log(`  - ${standardInputPath}`);
            console.log(`  - ${contractInfoPath}`);

        } catch (error) {
            console.error(`Error processing ${contractName}:`, error.message);
        }
    }

    console.log('\nVerification files generated successfully!');
    console.log(`Files are located in: ${outputDir}`);
}

if (require.main === module) {
    generateVerificationFiles()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { generateVerificationFiles };