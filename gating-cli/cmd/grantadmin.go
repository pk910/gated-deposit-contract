package cmd

import (
	"context"
	"fmt"

	"github.com/ethereum/go-ethereum/common"
	"github.com/spf13/cobra"
)

var grantAdminTarget string

var grantAdminCmd = &cobra.Command{
	Use:   "grantAdmin [address]",
	Short: "Grant admin role to an address",
	Long: `Grant the admin role to a specified address.

The admin role allows an account to:
- Mint deposit tokens
- Grant/revoke admin roles
- Configure deposit type settings

Only existing admins can grant the admin role.`,
	Args: cobra.MaximumNArgs(1),
	RunE: runGrantAdmin,
}

func init() {
	grantAdminCmd.Flags().StringVarP(&grantAdminTarget, "address", "a", "", "Address to grant admin role")
}

func runGrantAdmin(cmd *cobra.Command, args []string) error {
	ctx := context.Background()

	// Check admin role
	if err := checkAdminRole(ctx); err != nil {
		return err
	}

	// Determine target address
	var target common.Address
	if len(args) > 0 {
		grantAdminTarget = args[0]
	}
	if grantAdminTarget != "" {
		if !common.IsHexAddress(grantAdminTarget) {
			return fmt.Errorf("invalid address: %s", grantAdminTarget)
		}
		target = common.HexToAddress(grantAdminTarget)
	} else if interactive {
		input, err := promptInput("Enter address to grant admin role: ")
		if err != nil {
			return fmt.Errorf("failed to read address: %w", err)
		}
		if !common.IsHexAddress(input) {
			return fmt.Errorf("invalid address: %s", input)
		}
		target = common.HexToAddress(input)
	} else {
		return fmt.Errorf("address is required (use --address or provide as argument)")
	}

	// Check if already admin
	isAdmin, err := hasRole(ctx, DefaultAdminRole, target)
	if err != nil {
		return fmt.Errorf("failed to check existing role: %w", err)
	}
	if isAdmin {
		printInfo("Address %s already has admin role", target.Hex())
		return nil
	}

	log.WithField("target", target.Hex()).Info("Granting admin role")

	// Pack transaction data
	data, err := parsedABI.Pack("grantRole", DefaultAdminRole, target)
	if err != nil {
		return fmt.Errorf("failed to pack grantRole call: %w", err)
	}

	// Send transaction
	receipt, err := sendTransaction(ctx, gaterAddr, data)
	if err != nil {
		return fmt.Errorf("grantAdmin failed: %w", err)
	}

	printSuccess("Successfully granted admin role to %s", target.Hex())
	fmt.Printf("%sTransaction:%s %s\n", colorCyan, colorReset, receipt.TxHash.Hex())
	fmt.Printf("%sGas used:%s    %d\n", colorCyan, colorReset, receipt.GasUsed)

	return nil
}
