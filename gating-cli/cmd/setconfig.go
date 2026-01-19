package cmd

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/spf13/cobra"
)

var (
	configPrefix  string
	configBlocked string
	configNoToken string
)

var setConfigCmd = &cobra.Command{
	Use:   "setConfig",
	Short: "Set deposit type configuration",
	Long: `Set the configuration for a specific deposit type (prefix).

Deposit types:
  0x00   - BLS withdrawal credentials
  0x01   - Execution withdrawal credentials
  0x02   - Compounding credentials
  0x03   - ePBS builder credentials
  0xffff - Top-up deposits (recognized by all-zero signature and withdrawal_credentials)

Configuration options:
  --blocked    - If true, deposits of this type are completely blocked
  --no-token   - If true, deposits of this type don't require burning a token

Only accounts with admin role can modify configuration.`,
	RunE: runSetConfig,
}

func init() {
	setConfigCmd.Flags().StringVarP(&configPrefix, "prefix", "p", "", "Deposit type prefix (e.g., 0x00, 0x01, 0x02, 0xffff)")
	setConfigCmd.Flags().StringVarP(&configBlocked, "blocked", "b", "", "Block deposits of this type (true/false)")
	setConfigCmd.Flags().StringVarP(&configNoToken, "no-token", "n", "", "Allow deposits without token (true/false)")
}

func runSetConfig(cmd *cobra.Command, args []string) error {
	ctx := context.Background()

	// Check admin role
	if err := checkAdminRole(ctx); err != nil {
		return err
	}

	// Determine prefix
	var depositType uint16
	if configPrefix != "" {
		parsed, err := parseDepositType(configPrefix)
		if err != nil {
			return err
		}
		depositType = parsed
	} else if interactive {
		input, err := promptInput("Enter deposit type prefix (0x00, 0x01, 0x02, or 0xffff): ")
		if err != nil {
			return fmt.Errorf("failed to read prefix: %w", err)
		}
		parsed, err := parseDepositType(input)
		if err != nil {
			return err
		}
		depositType = parsed
	} else {
		return fmt.Errorf("prefix is required (use --prefix)")
	}

	// Get current config
	currentBlocked, currentNoToken, err := getDepositGateConfig(ctx, depositType)
	if err != nil {
		return fmt.Errorf("failed to get current config: %w", err)
	}

	fmt.Printf("%sCurrent config for 0x%04x:%s\n", colorCyan, depositType, colorReset)
	fmt.Printf("  Blocked:  %s\n", formatBool(currentBlocked))
	fmt.Printf("  NoToken:  %s\n", formatBool(currentNoToken))
	fmt.Println()

	// Determine new values
	newBlocked := currentBlocked
	newNoToken := currentNoToken

	if configBlocked != "" {
		parsed, err := parseBool(configBlocked)
		if err != nil {
			return fmt.Errorf("invalid blocked value: %w", err)
		}
		newBlocked = parsed
	} else if interactive {
		input, err := promptInput(fmt.Sprintf("Block this deposit type? (true/false) [current: %v]: ", currentBlocked))
		if err != nil {
			return fmt.Errorf("failed to read blocked value: %w", err)
		}
		if input != "" {
			parsed, err := parseBool(input)
			if err != nil {
				return fmt.Errorf("invalid blocked value: %w", err)
			}
			newBlocked = parsed
		}
	}

	if configNoToken != "" {
		parsed, err := parseBool(configNoToken)
		if err != nil {
			return fmt.Errorf("invalid no-token value: %w", err)
		}
		newNoToken = parsed
	} else if interactive {
		input, err := promptInput(fmt.Sprintf("Allow without token? (true/false) [current: %v]: ", currentNoToken))
		if err != nil {
			return fmt.Errorf("failed to read no-token value: %w", err)
		}
		if input != "" {
			parsed, err := parseBool(input)
			if err != nil {
				return fmt.Errorf("invalid no-token value: %w", err)
			}
			newNoToken = parsed
		}
	}

	// Check if any changes
	if newBlocked == currentBlocked && newNoToken == currentNoToken {
		printInfo("No changes to apply.")
		return nil
	}

	fmt.Printf("%sNew config for 0x%04x:%s\n", colorYellow, depositType, colorReset)
	fmt.Printf("  Blocked:  %s\n", formatBool(newBlocked))
	fmt.Printf("  NoToken:  %s\n", formatBool(newNoToken))
	fmt.Println()

	log.WithFields(map[string]interface{}{
		"depositType": fmt.Sprintf("0x%04x", depositType),
		"blocked":     newBlocked,
		"noToken":     newNoToken,
	}).Info("Setting deposit gate config")

	// Pack transaction data
	data, err := parsedABI.Pack("setDepositGateConfig", depositType, newBlocked, newNoToken)
	if err != nil {
		return fmt.Errorf("failed to pack setDepositGateConfig call: %w", err)
	}

	// Send transaction
	receipt, err := sendTransaction(ctx, gaterAddr, data)
	if err != nil {
		return fmt.Errorf("setConfig failed: %w", err)
	}

	printSuccess("Successfully updated config for deposit type 0x%04x", depositType)
	fmt.Printf("%sTransaction:%s %s\n", colorCyan, colorReset, receipt.TxHash.Hex())
	fmt.Printf("%sGas used:%s    %d\n", colorCyan, colorReset, receipt.GasUsed)

	// Verify the new config by reading it back from the contract
	verifiedBlocked, verifiedNoToken, err := getDepositGateConfig(ctx, depositType)
	if err != nil {
		log.WithError(err).Warn("Failed to verify new config")
	} else {
		fmt.Println()
		fmt.Printf("%sVerified config for 0x%04x:%s\n", colorGreen, depositType, colorReset)
		fmt.Printf("  Blocked:  %s\n", formatBool(verifiedBlocked))
		fmt.Printf("  NoToken:  %s\n", formatBool(verifiedNoToken))
	}

	return nil
}

func parseDepositType(input string) (uint16, error) {
	input = strings.TrimSpace(input)
	input = strings.ToLower(input)

	// Handle common names
	switch input {
	case "bls", "0x00", "0":
		return 0x00, nil
	case "execution", "eth1", "0x01", "1":
		return 0x01, nil
	case "compounding", "0x02", "2":
		return 0x02, nil
	case "builder", "0x03", "3":
		return 0x03, nil
	case "topup", "top-up", "0xffff":
		return 0xffff, nil
	}

	// Try parsing as hex
	if strings.HasPrefix(input, "0x") {
		val, err := strconv.ParseUint(input[2:], 16, 16)
		if err != nil {
			return 0, fmt.Errorf("invalid hex value: %s", input)
		}
		return uint16(val), nil
	}

	// Try parsing as decimal
	val, err := strconv.ParseUint(input, 10, 16)
	if err != nil {
		return 0, fmt.Errorf("invalid deposit type: %s (use 0x00, 0x01, 0x02, or 0xffff)", input)
	}
	return uint16(val), nil
}

func parseBool(input string) (bool, error) {
	input = strings.TrimSpace(strings.ToLower(input))
	switch input {
	case "true", "yes", "1", "y":
		return true, nil
	case "false", "no", "0", "n":
		return false, nil
	default:
		return false, fmt.Errorf("invalid boolean value: %s (use true/false)", input)
	}
}
