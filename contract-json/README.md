# Contract Verification Files

This directory contains the standard input files and contract metadata needed for verifying the contracts on blockchain explorers like Etherscan.

## Files Generated

For each contract, two files are generated:

1. `{ContractName}-standard-input.json` - Standard JSON input for the Solidity compiler that can be used for verification
2. `{ContractName}.json` - Complete contract metadata including ABI, bytecode, and compilation settings

## Available Contracts

- **DepositContract** - The main gated deposit contract (from GatedDepositContract.sol)
- **SimpleAccessControl** - Access control implementation
- **TokenDepositGater** - Token-based deposit gating mechanism

## Usage for Verification

### On Etherscan

1. Go to the contract's page on Etherscan
2. Click "Contract" tab → "Verify and Publish"
3. Choose "Solidity (Standard-Json-Input)"
4. Upload the corresponding `{ContractName}-standard-input.json` file
5. The verification should complete automatically

### Compiler Settings Used

- **Solidity Version**: 0.8.30
- **Optimization**: Enabled (2000 runs)
- **EVM Version**: Prague
- **Metadata**: 
  - bytecodeHash: none (for reproducible builds)
  - useLiteralContent: true

## Regenerating Files

To regenerate these verification files after making changes:

```bash
npm run generate-verification
```

Or build everything including verification files:

```bash
npm run build-full
```

## Reproducible Builds

The build configuration has been set up to ensure reproducible builds:
- Metadata bytecode hash is disabled
- Literal content is used in metadata
- Consistent compiler settings across builds