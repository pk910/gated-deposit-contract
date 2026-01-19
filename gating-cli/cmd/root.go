package cmd

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"math/big"
	"os"
	"strings"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var (
	log = logrus.New()

	// Global flags
	privateKey      string
	rpcHost         string
	depositContract string
	interactive     bool
	verbose         bool
	noColor         bool

	// Parsed values (set during PreRun)
	ethClient     *ethclient.Client
	signerKey     *ecdsa.PrivateKey
	signerAddress common.Address
	depositAddr   common.Address
	gaterAddr     common.Address
	chainID       *big.Int
)

// Storage slot 0x41 is where depositGater address is stored in the deposit contract.
// This is because:
// - bytes32[32] branch: slots 0-31
// - uint256 deposit_count: slot 32
// - bytes32[32] zero_hashes: slots 33-64
// - address depositGater: slot 65 (0x41)
var gaterStorageSlot = common.HexToHash("0x41")

// Role constants from TokenDepositGater.sol
var (
	DefaultAdminRole = common.HexToHash("0xacce55000000000000000000ffffffffffffffffffffffffffffffffffffffff")
)

var rootCmd = &cobra.Command{
	Use:   "gating-cli [command]",
	Short: "CLI tool for managing gated deposit contracts",
	Long: `A CLI tool for interacting with gated Ethereum deposit contracts.

This tool allows you to:
- View contract status and configuration
- Mint deposit tokens
- Grant/revoke admin roles
- Configure deposit type settings

If no command is specified, displays a summary of the contract status.
In interactive mode (-i), you can repeatedly select actions until you choose to exit.`,
	PersistentPreRunE: persistentPreRun,
	RunE:              runRoot,
}

func init() {
	rootCmd.PersistentFlags().StringVarP(&privateKey, "private-key", "k", "", "Private key for signing transactions (hex format)")
	rootCmd.PersistentFlags().StringVarP(&rpcHost, "rpc", "r", "", "Ethereum RPC endpoint URL")
	rootCmd.PersistentFlags().StringVarP(&depositContract, "deposit-contract", "d", "", "Deposit contract address (optional, uses mainnet default)")
	rootCmd.PersistentFlags().BoolVarP(&interactive, "interactive", "i", false, "Prompt for missing required values")
	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "Enable verbose logging")
	rootCmd.PersistentFlags().BoolVar(&noColor, "no-color", false, "Disable colored output")

	rootCmd.AddCommand(statusCmd)
	rootCmd.AddCommand(mintCmd)
	rootCmd.AddCommand(grantAdminCmd)
	rootCmd.AddCommand(revokeAdminCmd)
	rootCmd.AddCommand(setConfigCmd)
}

// Execute runs the root command.
func Execute() error {
	return rootCmd.Execute()
}

func persistentPreRun(cmd *cobra.Command, args []string) error {
	// Disable colors if requested
	if noColor {
		disableColors()
	}

	// Configure logging
	if verbose {
		log.SetLevel(logrus.DebugLevel)
	} else {
		log.SetLevel(logrus.InfoLevel)
	}
	log.SetFormatter(&logrus.TextFormatter{
		DisableTimestamp: true,
		DisableColors:    noColor,
	})

	// Gather required values (prompting if interactive mode is enabled)
	var err error

	// Private key
	if privateKey == "" {
		privateKey = os.Getenv("PRIVATE_KEY")
	}
	if privateKey == "" && interactive {
		privateKey, err = promptPrivateKey("Private key (hex)")
		if err != nil {
			return fmt.Errorf("failed to read private key: %w", err)
		}
	}
	if privateKey == "" {
		return fmt.Errorf("private key is required (use --private-key, -k, or PRIVATE_KEY env var)")
	}

	// Parse private key
	privateKey = strings.TrimPrefix(privateKey, "0x")
	signerKey, err = crypto.HexToECDSA(privateKey)
	if err != nil {
		return fmt.Errorf("invalid private key: %w", err)
	}
	signerAddress = crypto.PubkeyToAddress(signerKey.PublicKey)
	log.WithField("address", signerAddress.Hex()).Debug("Loaded signer key")

	// RPC host
	if rpcHost == "" {
		rpcHost = os.Getenv("ETH_RPC_URL")
	}
	if rpcHost == "" && interactive {
		rpcHost, err = promptText("RPC endpoint URL", "", func(s string) error {
			if strings.TrimSpace(s) == "" {
				return fmt.Errorf("RPC URL cannot be empty")
			}
			return nil
		})
		if err != nil {
			return fmt.Errorf("failed to read RPC URL: %w", err)
		}
	}
	if rpcHost == "" {
		return fmt.Errorf("RPC endpoint is required (use --rpc, -r, or ETH_RPC_URL env var)")
	}

	// Connect to Ethereum
	ctx := context.Background()
	ethClient, err = ethclient.DialContext(ctx, rpcHost)
	if err != nil {
		return fmt.Errorf("failed to connect to RPC: %w", err)
	}

	// Get chain ID
	chainID, err = ethClient.ChainID(ctx)
	if err != nil {
		return fmt.Errorf("failed to get chain ID: %w", err)
	}
	log.WithField("chainID", chainID.String()).Debug("Connected to network")

	// Deposit contract address
	if depositContract == "" {
		depositContract = os.Getenv("DEPOSIT_CONTRACT")
	}
	if depositContract == "" && interactive {
		depositContract, err = promptText("Deposit contract address (empty for mainnet default)", "", nil)
		if err != nil {
			return fmt.Errorf("failed to read deposit contract: %w", err)
		}
	}

	// Use default mainnet deposit contract if not specified
	if depositContract == "" {
		depositContract = "0x00000000219ab540356cBB839Cbe05303d7705Fa"
		log.Debug("Using default mainnet deposit contract")
	}

	if !common.IsHexAddress(depositContract) {
		return fmt.Errorf("invalid deposit contract address: %s", depositContract)
	}
	depositAddr = common.HexToAddress(depositContract)
	log.WithField("address", depositAddr.Hex()).Debug("Using deposit contract")

	// Check for gater contract at storage slot 0x41
	gaterAddrBytes, err := ethClient.StorageAt(ctx, depositAddr, gaterStorageSlot, nil)
	if err != nil {
		return fmt.Errorf("failed to read gater storage slot: %w", err)
	}
	gaterAddr = common.BytesToAddress(gaterAddrBytes)

	if gaterAddr == (common.Address{}) {
		log.Warn("No gating contract configured on this deposit contract")
	} else {
		log.WithField("address", gaterAddr.Hex()).Debug("Found gating contract")
	}

	return nil
}

// runRoot handles the root command - shows status and optionally enters interactive loop.
func runRoot(cmd *cobra.Command, args []string) error {
	// Always show status first
	if err := runStatus(cmd, args); err != nil {
		return err
	}

	// If not interactive, we're done
	if !interactive {
		return nil
	}

	// Interactive mode - loop asking for actions
	return runInteractiveLoop(cmd)
}

// runInteractiveLoop repeatedly asks the user what action to take.
func runInteractiveLoop(cmd *cobra.Command) error {
	actions := []Action{
		{
			Name:        "Status",
			Description: "View contract status and configuration",
			Run: func() error {
				return runStatus(cmd, nil)
			},
		},
		{
			Name:        "Mint",
			Description: "Mint deposit tokens to an address",
			Run: func() error {
				resetCommandFlags()
				return runMint(cmd, nil)
			},
		},
		{
			Name:        "Grant Admin",
			Description: "Grant admin role to an address",
			Run: func() error {
				resetCommandFlags()
				return runGrantAdmin(cmd, nil)
			},
		},
		{
			Name:        "Revoke Admin",
			Description: "Revoke admin role from an address",
			Run: func() error {
				resetCommandFlags()
				return runRevokeAdmin(cmd, nil)
			},
		},
		{
			Name:        "Set Config",
			Description: "Configure deposit type settings",
			Run: func() error {
				resetCommandFlags()
				return runSetConfig(cmd, nil)
			},
		},
		{
			Name:        "Exit",
			Description: "Exit the CLI",
			Run:         nil,
		},
	}

	for {
		fmt.Println()
		err := promptActionMenu(actions)
		if err != nil {
			if err == ErrExit || err.Error() == "interrupted" {
				printInfo("Goodbye!")
				return nil
			}
			printError("%v", err)
		}
	}
}

// resetCommandFlags clears command-specific flag values for fresh interactive prompts.
func resetCommandFlags() {
	// mint flags
	mintTo = ""
	mintAmount = ""
	// grantAdmin flags
	grantAdminTarget = ""
	// revokeAdmin flags
	revokeAdminTarget = ""
	// setConfig flags
	configPrefix = ""
	configBlocked = ""
	configNoToken = ""
}
