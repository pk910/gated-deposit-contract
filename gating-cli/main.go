package main

import (
	"os"

	"github.com/pk910/gated-deposit-contract/gating-cli/cmd"
)

func main() {
	if err := cmd.Execute(); err != nil {
		os.Exit(1)
	}
}
