package cmd

import (
	"context"
	"fmt"
	"math/big"
	"strconv"

	"github.com/ethereum/go-ethereum/common"
	"github.com/spf13/cobra"
)

var (
	mintTo     string
	mintAmount string
)

var mintCmd = &cobra.Command{
	Use:   "mint [amount]",
	Short: "Mint deposit tokens",
	Long: `Mint deposit tokens to a specified address (or the connected wallet if not specified).

Each token allows one validator deposit through the gated deposit contract.
Only accounts with admin role can mint tokens.`,
	Args: cobra.MaximumNArgs(1),
	RunE: runMint,
}

func init() {
	mintCmd.Flags().StringVarP(&mintTo, "to", "t", "", "Recipient address (defaults to signer address)")
	mintCmd.Flags().StringVarP(&mintAmount, "amount", "a", "", "Amount of tokens to mint")
}

func runMint(cmd *cobra.Command, args []string) error {
	ctx := context.Background()

	// Check admin role
	if err := checkAdminRole(ctx); err != nil {
		return err
	}

	// Determine recipient
	var recipient common.Address
	if mintTo != "" {
		if !common.IsHexAddress(mintTo) {
			return fmt.Errorf("invalid recipient address: %s", mintTo)
		}
		recipient = common.HexToAddress(mintTo)
	} else if interactive {
		input, err := promptInput("Enter recipient address (or press Enter for signer address): ")
		if err != nil {
			return fmt.Errorf("failed to read recipient: %w", err)
		}
		if input == "" {
			recipient = signerAddress
		} else {
			if !common.IsHexAddress(input) {
				return fmt.Errorf("invalid recipient address: %s", input)
			}
			recipient = common.HexToAddress(input)
		}
	} else {
		recipient = signerAddress
	}

	// Determine amount
	var amount *big.Int
	if len(args) > 0 {
		mintAmount = args[0]
	}
	if mintAmount != "" {
		var ok bool
		amount, ok = new(big.Int).SetString(mintAmount, 10)
		if !ok || amount.Sign() <= 0 {
			return fmt.Errorf("invalid amount: %s", mintAmount)
		}
	} else if interactive {
		input, err := promptInput("Enter amount to mint: ")
		if err != nil {
			return fmt.Errorf("failed to read amount: %w", err)
		}
		parsedAmount, err := strconv.ParseInt(input, 10, 64)
		if err != nil || parsedAmount <= 0 {
			return fmt.Errorf("invalid amount: %s", input)
		}
		amount = big.NewInt(parsedAmount)
	} else {
		return fmt.Errorf("amount is required (use --amount or provide as argument)")
	}

	log.WithFields(map[string]interface{}{
		"recipient": recipient.Hex(),
		"amount":    amount.String(),
	}).Info("Minting tokens")

	// Pack transaction data
	data, err := parsedABI.Pack("mint", recipient, amount)
	if err != nil {
		return fmt.Errorf("failed to pack mint call: %w", err)
	}

	// Send transaction
	receipt, err := sendTransaction(ctx, gaterAddr, data)
	if err != nil {
		return fmt.Errorf("mint failed: %w", err)
	}

	printSuccess("Successfully minted %s tokens to %s", amount.String(), recipient.Hex())
	fmt.Printf("%sTransaction:%s %s\n", colorCyan, colorReset, receipt.TxHash.Hex())
	fmt.Printf("%sGas used:%s    %d\n", colorCyan, colorReset, receipt.GasUsed)

	// Show new balance
	newBalance, err := getBalanceOf(ctx, recipient)
	if err == nil {
		fmt.Printf("%sNew balance:%s %s tokens\n", colorCyan, colorReset, newBalance.String())
	}

	return nil
}
