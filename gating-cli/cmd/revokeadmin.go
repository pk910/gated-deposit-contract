package cmd

import (
	"context"
	"fmt"

	"github.com/ethereum/go-ethereum/common"
	"github.com/spf13/cobra"
)

var revokeAdminTarget string

var revokeAdminCmd = &cobra.Command{
	Use:   "revokeAdmin [address]",
	Short: "Revoke admin role from an address",
	Long: `Revoke the admin role from a specified address.

Note: Sticky admin roles cannot be revoked. These are typically set during
contract deployment to prevent complete loss of admin access.

Only existing admins can revoke admin roles.`,
	Args: cobra.MaximumNArgs(1),
	RunE: runRevokeAdmin,
}

func init() {
	revokeAdminCmd.Flags().StringVarP(&revokeAdminTarget, "address", "a", "", "Address to revoke admin role from")
}

func runRevokeAdmin(cmd *cobra.Command, args []string) error {
	ctx := context.Background()

	// Check admin role
	if err := checkAdminRole(ctx); err != nil {
		return err
	}

	// Determine target address
	var target common.Address
	if len(args) > 0 {
		revokeAdminTarget = args[0]
	}
	if revokeAdminTarget != "" {
		if !common.IsHexAddress(revokeAdminTarget) {
			return fmt.Errorf("invalid address: %s", revokeAdminTarget)
		}
		target = common.HexToAddress(revokeAdminTarget)
	} else if interactive {
		input, err := promptInput("Enter address to revoke admin role from: ")
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

	// Check if has admin role
	isAdmin, err := hasRole(ctx, DefaultAdminRole, target)
	if err != nil {
		return fmt.Errorf("failed to check existing role: %w", err)
	}
	if !isAdmin {
		printInfo("Address %s does not have admin role", target.Hex())
		return nil
	}

	// Check if sticky
	isSticky, err := isStickyRole(ctx, DefaultAdminRole, target)
	if err != nil {
		return fmt.Errorf("failed to check sticky status: %w", err)
	}
	if isSticky {
		return fmt.Errorf("cannot revoke admin role from %s: role is sticky", target.Hex())
	}

	log.WithField("target", target.Hex()).Info("Revoking admin role")

	// Pack transaction data
	data, err := parsedABI.Pack("revokeRole", DefaultAdminRole, target)
	if err != nil {
		return fmt.Errorf("failed to pack revokeRole call: %w", err)
	}

	// Send transaction
	receipt, err := sendTransaction(ctx, gaterAddr, data)
	if err != nil {
		return fmt.Errorf("revokeAdmin failed: %w", err)
	}

	printSuccess("Successfully revoked admin role from %s", target.Hex())
	fmt.Printf("%sTransaction:%s %s\n", colorCyan, colorReset, receipt.TxHash.Hex())
	fmt.Printf("%sGas used:%s    %d\n", colorCyan, colorReset, receipt.GasUsed)

	return nil
}
