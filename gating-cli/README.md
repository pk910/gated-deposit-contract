# Gating CLI

A command-line tool for managing gated Ethereum deposit contracts. This CLI allows administrators to interact with the TokenDepositGater contract to manage deposit permissions, mint tokens, and configure deposit type settings.

## Features

- **Interactive Mode**: User-friendly prompts with arrow-key navigation and colored output
- **Hidden Private Key Input**: Secure password-style input for private keys
- **Contract Status**: View deposit contract configuration and gating settings
- **Token Management**: Mint deposit tokens to addresses
- **Admin Management**: Grant and revoke admin roles
- **Deposit Configuration**: Configure blocked/allowed deposit types and token requirements

## Installation

### Build from Source

```bash
cd gating-cli
go build -o gating-cli .
```

### Docker

A pre-built Docker image is available:

```bash
docker run --rm -it pk910/gated-deposit-contract-cli --help
```

Or build locally:

```bash
docker build -t gating-cli .
docker run --rm -it gating-cli --help
```

## Usage

### Basic Usage

```bash
# Show help
./gating-cli --help

# View contract status
./gating-cli -k <private-key> -r <rpc-url> status

# Interactive mode (recommended)
./gating-cli -i
```

### Global Flags

| Flag | Short | Environment Variable | Description |
|------|-------|---------------------|-------------|
| `--private-key` | `-k` | `PRIVATE_KEY` | Private key for signing transactions (hex format) |
| `--rpc` | `-r` | `ETH_RPC_URL` | Ethereum RPC endpoint URL |
| `--deposit-contract` | `-d` | `DEPOSIT_CONTRACT` | Deposit contract address (optional, defaults to mainnet) |
| `--interactive` | `-i` | - | Enable interactive mode with prompts |
| `--verbose` | `-v` | - | Enable verbose logging |
| `--no-color` | - | - | Disable colored output |

### Commands

#### `status` (default)

Display contract status and configuration.

```bash
./gating-cli -k $KEY -r $RPC status
```

Shows:
- Chain ID and contract addresses
- Token name, symbol, and total supply
- Admin status and token balance
- Deposit type configurations (blocked/allowed, token requirements)

#### `mint`

Mint deposit tokens to an address.

```bash
# Mint to self
./gating-cli -k $KEY -r $RPC mint 10

# Mint to specific address
./gating-cli -k $KEY -r $RPC mint --to 0x... --amount 5
```

Options:
- `--to`, `-t`: Recipient address (defaults to signer)
- `--amount`, `-a`: Number of tokens to mint

#### `grantAdmin`

Grant admin role to an address.

```bash
./gating-cli -k $KEY -r $RPC grantAdmin 0x...

# Or with flag
./gating-cli -k $KEY -r $RPC grantAdmin --address 0x...
```

#### `revokeAdmin`

Revoke admin role from an address.

```bash
./gating-cli -k $KEY -r $RPC revokeAdmin 0x...
```

Note: Sticky admin roles cannot be revoked.

#### `setConfig`

Configure deposit type settings.

```bash
# Block BLS withdrawal deposits
./gating-cli -k $KEY -r $RPC setConfig --prefix 0x00 --blocked true

# Allow execution withdrawals without token
./gating-cli -k $KEY -r $RPC setConfig --prefix 0x01 --no-token true
```

Options:
- `--prefix`, `-p`: Deposit type prefix
- `--blocked`, `-b`: Block deposits of this type (true/false)
- `--no-token`, `-n`: Allow deposits without burning a token (true/false)

Deposit Types:
| Prefix | Name | Description |
|--------|------|-------------|
| `0x00` | BLS | BLS withdrawal credentials |
| `0x01` | Execution | Execution layer withdrawal credentials |
| `0x02` | Compounding | Compounding credentials |
| `0x03` | Builder | ePBS builder credentials |
| `0xffff` | Top-up | Top-up deposits (all-zero signature) |

## Interactive Mode

Running with `-i` or `--interactive` enables a user-friendly interface:

1. **Secure Input**: Private keys are masked during entry
2. **Arrow Navigation**: Use Up/Down arrows to select actions
3. **Colored Output**: Visual indicators for status and errors
4. **Action Loop**: Continuously select actions until you choose to exit

```bash
./gating-cli -i
```

Example session:
```
? Private key (hex): ********

═══ Gated Deposit Contract Status ═══

Chain ID:          17000
Deposit Contract:  0x...
Signer Address:    0x...

Gating Contract:   0x...

Token Name:        Deposit Token (Deposit)
Total Supply:      100

Signer is Admin:   Yes (sticky)
Signer Balance:    50 tokens

═══ Deposit Type Configurations ═══

  BLS withdrawal credentials (0x00):       Allowed, Requires token
  Execution withdrawal credentials (0x01): Allowed, Requires token
  ...

? Select action:
  ▸ Status - View contract status and configuration
    Mint - Mint deposit tokens to an address
    Grant Admin - Grant admin role to an address
    Revoke Admin - Revoke admin role from an address
    Set Config - Configure deposit type settings
    Exit - Exit the CLI
```

## Environment Variables

You can set credentials via environment variables to avoid passing them as flags:

```bash
export PRIVATE_KEY="0x..."
export ETH_RPC_URL="https://rpc.example.com"
export DEPOSIT_CONTRACT="0x..."

# Then just run
./gating-cli status
```

Or use a `.env` file with your preferred method of loading environment variables.

## Contract Architecture

The CLI interacts with:

1. **Deposit Contract**: The gated Ethereum deposit contract with a reference to the gating contract stored at storage slot `0x41`

2. **TokenDepositGater**: An ERC20 token contract that gates deposits:
   - Each token allows one validator deposit
   - Tokens are burned when deposits are made
   - Admins can mint tokens and configure settings

3. **SimpleAccessControl**: Role-based access control with:
   - `DEFAULT_ADMIN_ROLE`: Can mint, grant/revoke roles, configure deposits
   - Sticky roles that cannot be revoked

## Security Notes

- Never share or commit your private key
- Use environment variables or secure secret management in production
- The `--no-color` flag is useful when piping output or in CI/CD environments
- Admin roles should be carefully managed; sticky roles provide protection against lockout

## License

See the main project repository for license information.
