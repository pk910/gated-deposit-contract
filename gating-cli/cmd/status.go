package cmd

import (
	"context"
	"fmt"

	"github.com/ethereum/go-ethereum/common"
	"github.com/spf13/cobra"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Display contract status and configuration",
	Long:  `Displays a summary of the deposit contract and gating contract configuration.`,
	RunE:  runStatus,
}

func runStatus(cmd *cobra.Command, args []string) error {
	ctx := context.Background()

	printHeader("═══ Gated Deposit Contract Status ═══")
	fmt.Println()

	// Basic info
	fmt.Printf("%sChain ID:%s          %s\n", colorCyan, colorReset, chainID.String())
	fmt.Printf("%sDeposit Contract:%s  %s\n", colorCyan, colorReset, depositAddr.Hex())
	fmt.Printf("%sSigner Address:%s    %s\n", colorCyan, colorReset, signerAddress.Hex())
	fmt.Println()

	// Gating contract info
	if gaterAddr == (common.Address{}) {
		fmt.Printf("%sGating Contract:%s   %sNot configured (slot 0x41 is empty)%s\n", colorCyan, colorReset, colorYellow, colorReset)
		fmt.Println()
		printError("This deposit contract does not have gating enabled.")
		return nil
	}

	fmt.Printf("%sGating Contract:%s   %s\n", colorCyan, colorReset, gaterAddr.Hex())
	fmt.Println()

	// Token info
	tokenName, err := getTokenName(ctx)
	if err != nil {
		log.WithError(err).Debug("Failed to get token name")
		tokenName = "Unknown"
	}

	tokenSymbol, err := getTokenSymbol(ctx)
	if err != nil {
		log.WithError(err).Debug("Failed to get token symbol")
		tokenSymbol = "?"
	}

	totalSupply, err := getTotalSupply(ctx)
	if err != nil {
		log.WithError(err).Debug("Failed to get total supply")
	}

	fmt.Printf("%sToken Name:%s        %s (%s)\n", colorCyan, colorReset, tokenName, tokenSymbol)
	if totalSupply != nil {
		fmt.Printf("%sTotal Supply:%s      %s\n", colorCyan, colorReset, totalSupply.String())
	}
	fmt.Println()

	// Admin status
	isAdmin, err := hasRole(ctx, DefaultAdminRole, signerAddress)
	if err != nil {
		log.WithError(err).Debug("Failed to check admin role")
	} else {
		var adminStatus string
		if isAdmin {
			adminStatus = colorGreen + "Yes" + colorReset
			isSticky, err := isStickyRole(ctx, DefaultAdminRole, signerAddress)
			if err == nil && isSticky {
				adminStatus = colorGreen + "Yes" + colorReset + " (sticky)"
			}
		} else {
			adminStatus = colorRed + "No" + colorReset
		}
		fmt.Printf("%sSigner is Admin:%s   %s\n", colorCyan, colorReset, adminStatus)
	}

	// Signer balance
	balance, err := getBalanceOf(ctx, signerAddress)
	if err != nil {
		log.WithError(err).Debug("Failed to get balance")
	} else {
		fmt.Printf("%sSigner Balance:%s    %s tokens\n", colorCyan, colorReset, balance.String())
	}
	fmt.Println()

	// Custom gater
	customGater, err := getCustomGater(ctx)
	if err != nil {
		log.WithError(err).Debug("Failed to get custom gater")
	} else if customGater != (common.Address{}) {
		fmt.Printf("%sCustom Gater:%s      %s\n", colorCyan, colorReset, customGater.Hex())
		fmt.Println()
	}

	// Deposit type configurations
	printHeader("═══ Deposit Type Configurations ═══")
	fmt.Println()

	// Known deposit types
	depositTypes := []struct {
		typeID uint16
		name   string
	}{
		{0x00, "BLS withdrawal credentials (0x00)"},
		{0x01, "Execution withdrawal credentials (0x01)"},
		{0x02, "Compounding credentials (0x02)"},
		{0x03, "ePBS builder credentials (0x03)"},
		{0xffff, "Top-up deposits (0xffff)"},
	}

	for _, dt := range depositTypes {
		blocked, noToken, err := getDepositGateConfig(ctx, dt.typeID)
		if err != nil {
			log.WithError(err).WithField("type", dt.name).Debug("Failed to get config")
			continue
		}

		var status string
		if blocked {
			status = colorRed + "BLOCKED" + colorReset
		} else {
			status = colorGreen + "Allowed" + colorReset
		}

		var tokenReq string
		if noToken {
			tokenReq = colorYellow + "No token required" + colorReset
		} else {
			tokenReq = "Requires token"
		}

		fmt.Printf("  %-40s %s, %s\n", dt.name+":", status, tokenReq)
	}

	return nil
}
