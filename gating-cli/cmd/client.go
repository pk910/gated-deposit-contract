package cmd

import (
	"context"
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

// TokenDepositGater ABI (relevant functions only)
const tokenDepositGaterABI = `[
	{
		"inputs": [{"internalType": "bytes32", "name": "role", "type": "bytes32"}, {"internalType": "address", "name": "account", "type": "address"}],
		"name": "hasRole",
		"outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [{"internalType": "bytes32", "name": "role", "type": "bytes32"}, {"internalType": "address", "name": "account", "type": "address"}],
		"name": "isStickyRole",
		"outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [{"internalType": "uint16", "name": "depositType", "type": "uint16"}],
		"name": "getDepositGateConfig",
		"outputs": [{"internalType": "bool", "name": "blocked", "type": "bool"}, {"internalType": "bool", "name": "noToken", "type": "bool"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "getCustomGater",
		"outputs": [{"internalType": "address", "name": "", "type": "address"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [{"internalType": "address", "name": "account", "type": "address"}],
		"name": "balanceOf",
		"outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "totalSupply",
		"outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "name",
		"outputs": [{"internalType": "string", "name": "", "type": "string"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "symbol",
		"outputs": [{"internalType": "string", "name": "", "type": "string"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [{"internalType": "address", "name": "to", "type": "address"}, {"internalType": "uint256", "name": "amount", "type": "uint256"}],
		"name": "mint",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [{"internalType": "bytes32", "name": "role", "type": "bytes32"}, {"internalType": "address", "name": "account", "type": "address"}],
		"name": "grantRole",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [{"internalType": "bytes32", "name": "role", "type": "bytes32"}, {"internalType": "address", "name": "account", "type": "address"}],
		"name": "revokeRole",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [{"internalType": "uint16", "name": "depositType", "type": "uint16"}, {"internalType": "bool", "name": "blocked", "type": "bool"}, {"internalType": "bool", "name": "noToken", "type": "bool"}],
		"name": "setDepositGateConfig",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}
]`

var parsedABI abi.ABI

func init() {
	var err error
	parsedABI, err = abi.JSON(strings.NewReader(tokenDepositGaterABI))
	if err != nil {
		panic(fmt.Sprintf("failed to parse ABI: %v", err))
	}
}

// getLatestBlockNumber fetches the latest block number to avoid cached responses.
func getLatestBlockNumber(ctx context.Context) (*big.Int, error) {
	header, err := ethClient.HeaderByNumber(ctx, nil)
	if err != nil {
		return nil, err
	}
	return header.Number, nil
}

// hasRole checks if an account has a specific role.
func hasRole(ctx context.Context, role common.Hash, account common.Address) (bool, error) {
	data, err := parsedABI.Pack("hasRole", role, account)
	if err != nil {
		return false, fmt.Errorf("failed to pack hasRole call: %w", err)
	}

	result, err := ethClient.CallContract(ctx, ethereum.CallMsg{
		To:   &gaterAddr,
		Data: data,
	}, nil)
	if err != nil {
		return false, fmt.Errorf("failed to call hasRole: %w", err)
	}

	var hasRoleResult bool
	if err := parsedABI.UnpackIntoInterface(&hasRoleResult, "hasRole", result); err != nil {
		return false, fmt.Errorf("failed to unpack hasRole result: %w", err)
	}
	return hasRoleResult, nil
}

// isStickyRole checks if a role assignment is sticky (cannot be revoked).
func isStickyRole(ctx context.Context, role common.Hash, account common.Address) (bool, error) {
	data, err := parsedABI.Pack("isStickyRole", role, account)
	if err != nil {
		return false, fmt.Errorf("failed to pack isStickyRole call: %w", err)
	}

	result, err := ethClient.CallContract(ctx, ethereum.CallMsg{
		To:   &gaterAddr,
		Data: data,
	}, nil)
	if err != nil {
		return false, fmt.Errorf("failed to call isStickyRole: %w", err)
	}

	var isSticky bool
	if err := parsedABI.UnpackIntoInterface(&isSticky, "isStickyRole", result); err != nil {
		return false, fmt.Errorf("failed to unpack isStickyRole result: %w", err)
	}
	return isSticky, nil
}

// getDepositGateConfig gets the configuration for a specific deposit type.
// It explicitly fetches the latest block number to avoid cached responses.
func getDepositGateConfig(ctx context.Context, depositType uint16) (blocked bool, noToken bool, err error) {
	data, err := parsedABI.Pack("getDepositGateConfig", depositType)
	if err != nil {
		return false, false, fmt.Errorf("failed to pack getDepositGateConfig call: %w", err)
	}

	// Get the latest block number to avoid cached responses
	blockNum, err := getLatestBlockNumber(ctx)
	if err != nil {
		return false, false, fmt.Errorf("failed to get latest block: %w", err)
	}

	result, err := ethClient.CallContract(ctx, ethereum.CallMsg{
		To:   &gaterAddr,
		Data: data,
	}, blockNum)
	if err != nil {
		return false, false, fmt.Errorf("failed to call getDepositGateConfig: %w", err)
	}

	var output struct {
		Blocked bool
		NoToken bool
	}
	if err := parsedABI.UnpackIntoInterface(&output, "getDepositGateConfig", result); err != nil {
		return false, false, fmt.Errorf("failed to unpack getDepositGateConfig result: %w", err)
	}
	return output.Blocked, output.NoToken, nil
}

// getCustomGater gets the custom gater address.
func getCustomGater(ctx context.Context) (common.Address, error) {
	data, err := parsedABI.Pack("getCustomGater")
	if err != nil {
		return common.Address{}, fmt.Errorf("failed to pack getCustomGater call: %w", err)
	}

	result, err := ethClient.CallContract(ctx, ethereum.CallMsg{
		To:   &gaterAddr,
		Data: data,
	}, nil)
	if err != nil {
		return common.Address{}, fmt.Errorf("failed to call getCustomGater: %w", err)
	}

	var addr common.Address
	if err := parsedABI.UnpackIntoInterface(&addr, "getCustomGater", result); err != nil {
		return common.Address{}, fmt.Errorf("failed to unpack getCustomGater result: %w", err)
	}
	return addr, nil
}

// getBalanceOf gets the token balance of an account.
// It explicitly fetches the latest block number to avoid cached responses.
func getBalanceOf(ctx context.Context, account common.Address) (*big.Int, error) {
	data, err := parsedABI.Pack("balanceOf", account)
	if err != nil {
		return nil, fmt.Errorf("failed to pack balanceOf call: %w", err)
	}

	// Get the latest block number to avoid cached responses
	blockNum, err := getLatestBlockNumber(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get latest block: %w", err)
	}

	result, err := ethClient.CallContract(ctx, ethereum.CallMsg{
		To:   &gaterAddr,
		Data: data,
	}, blockNum)
	if err != nil {
		return nil, fmt.Errorf("failed to call balanceOf: %w", err)
	}

	var balance *big.Int
	if err := parsedABI.UnpackIntoInterface(&balance, "balanceOf", result); err != nil {
		return nil, fmt.Errorf("failed to unpack balanceOf result: %w", err)
	}
	return balance, nil
}

// getTotalSupply gets the total token supply.
// It explicitly fetches the latest block number to avoid cached responses.
func getTotalSupply(ctx context.Context) (*big.Int, error) {
	data, err := parsedABI.Pack("totalSupply")
	if err != nil {
		return nil, fmt.Errorf("failed to pack totalSupply call: %w", err)
	}

	// Get the latest block number to avoid cached responses
	blockNum, err := getLatestBlockNumber(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get latest block: %w", err)
	}

	result, err := ethClient.CallContract(ctx, ethereum.CallMsg{
		To:   &gaterAddr,
		Data: data,
	}, blockNum)
	if err != nil {
		return nil, fmt.Errorf("failed to call totalSupply: %w", err)
	}

	var supply *big.Int
	if err := parsedABI.UnpackIntoInterface(&supply, "totalSupply", result); err != nil {
		return nil, fmt.Errorf("failed to unpack totalSupply result: %w", err)
	}
	return supply, nil
}

// getTokenName gets the token name.
func getTokenName(ctx context.Context) (string, error) {
	data, err := parsedABI.Pack("name")
	if err != nil {
		return "", fmt.Errorf("failed to pack name call: %w", err)
	}

	result, err := ethClient.CallContract(ctx, ethereum.CallMsg{
		To:   &gaterAddr,
		Data: data,
	}, nil)
	if err != nil {
		return "", fmt.Errorf("failed to call name: %w", err)
	}

	var name string
	if err := parsedABI.UnpackIntoInterface(&name, "name", result); err != nil {
		return "", fmt.Errorf("failed to unpack name result: %w", err)
	}
	return name, nil
}

// getTokenSymbol gets the token symbol.
func getTokenSymbol(ctx context.Context) (string, error) {
	data, err := parsedABI.Pack("symbol")
	if err != nil {
		return "", fmt.Errorf("failed to pack symbol call: %w", err)
	}

	result, err := ethClient.CallContract(ctx, ethereum.CallMsg{
		To:   &gaterAddr,
		Data: data,
	}, nil)
	if err != nil {
		return "", fmt.Errorf("failed to call symbol: %w", err)
	}

	var symbol string
	if err := parsedABI.UnpackIntoInterface(&symbol, "symbol", result); err != nil {
		return "", fmt.Errorf("failed to unpack symbol result: %w", err)
	}
	return symbol, nil
}

// sendTransaction sends a signed transaction.
func sendTransaction(ctx context.Context, to common.Address, data []byte) (*types.Receipt, error) {
	nonce, err := ethClient.PendingNonceAt(ctx, signerAddress)
	if err != nil {
		return nil, fmt.Errorf("failed to get nonce: %w", err)
	}

	gasPrice, err := ethClient.SuggestGasPrice(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get gas price: %w", err)
	}

	gasLimit, err := ethClient.EstimateGas(ctx, ethereum.CallMsg{
		From: signerAddress,
		To:   &to,
		Data: data,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to estimate gas: %w", err)
	}

	tx := types.NewTransaction(nonce, to, big.NewInt(0), gasLimit, gasPrice, data)
	signedTx, err := types.SignTx(tx, types.NewEIP155Signer(chainID), signerKey)
	if err != nil {
		return nil, fmt.Errorf("failed to sign transaction: %w", err)
	}

	if err := ethClient.SendTransaction(ctx, signedTx); err != nil {
		return nil, fmt.Errorf("failed to send transaction: %w", err)
	}

	log.WithField("txHash", signedTx.Hash().Hex()).Info("Transaction sent, waiting for confirmation...")

	receipt, err := bind.WaitMined(ctx, ethClient, signedTx)
	if err != nil {
		return nil, fmt.Errorf("failed to wait for transaction: %w", err)
	}

	if receipt.Status == types.ReceiptStatusFailed {
		return receipt, fmt.Errorf("transaction failed")
	}

	return receipt, nil
}

// checkAdminRole verifies the signer has admin privileges.
func checkAdminRole(ctx context.Context) error {
	if gaterAddr == (common.Address{}) {
		return fmt.Errorf("no gating contract configured on deposit contract")
	}

	isAdmin, err := hasRole(ctx, DefaultAdminRole, signerAddress)
	if err != nil {
		return fmt.Errorf("failed to check admin role: %w", err)
	}

	if !isAdmin {
		return fmt.Errorf("signer %s does not have admin role on gating contract", signerAddress.Hex())
	}

	return nil
}
