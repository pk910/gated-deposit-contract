# Gated Deposit Contract

This project implements a gated version of the Ethereum 2.0 deposit contract with token-based access control.

## Architecture

The architecture maintains the integrity of the original Ethereum 2.0 deposit contract while adding a gating mechanism through a separate contract. This design ensures:

### Minimal Changes to Deposit Contract
The `GatedDepositContract` is virtually identical to the mainnet deposit contract, with only a single additional check added to the deposit function. This ensures it behaves exactly like the mainnet deposit contract in all aspects:
- Same deposit tree structure and hashing
- Same event signatures and data
- No additional events emitted (important: custom events broke Sepolia during the Electra fork)
- Same validation rules and constraints

The only modification is a call to `depositGater.check_deposit()` before processing each deposit.

### Separation of Concerns
All gating logic is isolated in the `TokenDepositGater` contract, which handles:
- ERC20 token functionality for deposit permissions
- Access control and role management
- Token burning on deposit (1 token per validator deposit)
- Special handling for top-up deposits (no token burn required)

This separation ensures that:
1. The deposit contract remains as close to mainnet as possible
2. All complex logic is contained in the gater contract

## Contracts

- **GatedDepositContract**: Nearly identical to the ETH2 deposit contract, with a single gater check added
- **TokenDepositGater**: ERC20 token that acts as a gating mechanism, burning 1 token per deposit (except for top-ups)

## Deployment

### Deploy Both Contracts (New Deployment)

```bash
# Set your deployer private key
npx hardhat vars set GATED_DEPOSIT_DEPLOYER_PRIVATE_KEY

# Deploy to network
npx hardhat run scripts/deploy-full.js --network <network-name>
```

This will:
1. Deploy TokenDepositGater
2. Deploy GatedDepositContract with the gater address
3. Grant DEPOSIT_CONTRACT_ROLE to the GatedDepositContract

### Deploy Only TokenDepositGater (Existing Deposit Contract)

```bash
# Set environment variables
export EXISTING_DEPOSIT_CONTRACT=0x... # Address of existing GatedDepositContract

# Deploy to network
npx hardhat run scripts/deploy-gater-only.js --network <network-name>
```

This will:
1. Deploy TokenDepositGater
2. Grant DEPOSIT_CONTRACT_ROLE to the existing deposit contract

**Note**: You'll need to update the existing GatedDepositContract to point to the new gater address.

## Minting Tokens

To mint deposit tokens for a specific address:

```bash
# Set environment variables
export TOKEN_DEPOSIT_GATER_ADDRESS=0x... # TokenDepositGater contract address
export RECIPIENT_ADDRESS=0x...           # Address to receive tokens
export MINT_AMOUNT=10                    # Number of tokens to mint (optional, defaults to 1)

# Run minting script
npx hardhat run scripts/mint-tokens.js --network <network-name>
```

**Note**: The signer must have DEFAULT_ADMIN_ROLE on the TokenDepositGater contract.

## Networks

Configured networks:
- `hardhat` - Local development
- `sepolia` - Sepolia testnet
- `holesky` - Holesky testnet
- `hoodi` - Hoodi testnet
- `ephemery` - Ephemery testnet

## Building

```bash
npm install
npm run build
```

## Testing

```bash
npm test
```