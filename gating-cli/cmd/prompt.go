package cmd

import (
	"errors"
	"fmt"
	"strings"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/manifoldco/promptui"
)

// Color codes
const (
	codeReset  = "\033[0m"
	codeRed    = "\033[31m"
	codeGreen  = "\033[32m"
	codeYellow = "\033[33m"
	codeBlue   = "\033[34m"
	codeCyan   = "\033[36m"
	codeBold   = "\033[1m"
)

// Color variables that can be disabled
var (
	colorReset  = codeReset
	colorRed    = codeRed
	colorGreen  = codeGreen
	colorYellow = codeYellow
	colorBlue   = codeBlue
	colorCyan   = codeCyan
	colorBold   = codeBold

	// Track if colors are disabled for promptui templates
	colorsDisabled = false
)

// disableColors turns off all color output.
func disableColors() {
	colorReset = ""
	colorRed = ""
	colorGreen = ""
	colorYellow = ""
	colorBlue = ""
	colorCyan = ""
	colorBold = ""
	colorsDisabled = true
}

// printSuccess prints a success message in green.
func printSuccess(format string, args ...interface{}) {
	fmt.Printf(colorGreen+format+colorReset+"\n", args...)
}

// printError prints an error message in red.
func printError(format string, args ...interface{}) {
	fmt.Printf(colorRed+"Error: "+format+colorReset+"\n", args...)
}

// printInfo prints an info message in cyan.
func printInfo(format string, args ...interface{}) {
	fmt.Printf(colorCyan+format+colorReset+"\n", args...)
}

// printHeader prints a header in bold blue.
func printHeader(format string, args ...interface{}) {
	fmt.Printf(colorBold+colorBlue+format+colorReset+"\n", args...)
}

// formatBool returns a colored string for a boolean value.
func formatBool(val bool) string {
	if val {
		return colorGreen + "true" + colorReset
	}
	return colorRed + "false" + colorReset
}

// promptText prompts for text input with validation.
func promptText(label string, defaultVal string, validate func(string) error) (string, error) {
	prompt := promptui.Prompt{
		Label:   label,
		Default: defaultVal,
	}

	if colorsDisabled {
		prompt.Templates = &promptui.PromptTemplates{
			Prompt:  "{{ . }}: ",
			Valid:   "{{ . }}: ",
			Invalid: "{{ . }}: ",
			Success: "{{ . }}: ",
		}
	}

	if validate != nil {
		prompt.Validate = validate
	}

	result, err := prompt.Run()
	if err != nil {
		if errors.Is(err, promptui.ErrInterrupt) {
			return "", fmt.Errorf("interrupted")
		}
		return "", err
	}

	return strings.TrimSpace(result), nil
}

// promptPassword prompts for sensitive input (hidden).
func promptPassword(label string) (string, error) {
	prompt := promptui.Prompt{
		Label: label,
		Mask:  '*',
		Validate: func(input string) error {
			if len(strings.TrimSpace(input)) == 0 {
				return errors.New("input cannot be empty")
			}
			return nil
		},
	}

	if colorsDisabled {
		prompt.Templates = &promptui.PromptTemplates{
			Prompt:  "{{ . }}: ",
			Valid:   "{{ . }}: ",
			Invalid: "{{ . }}: ",
			Success: "{{ . }}: ",
		}
	}

	result, err := prompt.Run()
	if err != nil {
		if errors.Is(err, promptui.ErrInterrupt) {
			return "", fmt.Errorf("interrupted")
		}
		return "", err
	}

	return strings.TrimSpace(result), nil
}

// promptPrivateKey prompts for a private key with validation.
func promptPrivateKey(label string) (string, error) {
	prompt := promptui.Prompt{
		Label: label,
		Mask:  '*',
		Validate: func(input string) error {
			input = strings.TrimSpace(input)
			if len(input) == 0 {
				return errors.New("private key cannot be empty")
			}
			// Remove 0x prefix if present
			input = strings.TrimPrefix(input, "0x")
			// Validate it's a valid private key
			_, err := crypto.HexToECDSA(input)
			if err != nil {
				return errors.New("invalid private key format")
			}
			return nil
		},
	}

	if colorsDisabled {
		prompt.Templates = &promptui.PromptTemplates{
			Prompt:  "{{ . }}: ",
			Valid:   "{{ . }}: ",
			Invalid: "{{ . }}: ",
			Success: "{{ . }}: ",
		}
	}

	result, err := prompt.Run()
	if err != nil {
		if errors.Is(err, promptui.ErrInterrupt) {
			return "", fmt.Errorf("interrupted")
		}
		return "", err
	}

	return strings.TrimSpace(result), nil
}

// promptConfirm prompts for yes/no confirmation.
func promptConfirm(label string) (bool, error) {
	prompt := promptui.Prompt{
		Label:     label,
		IsConfirm: true,
	}

	if colorsDisabled {
		prompt.Templates = &promptui.PromptTemplates{
			Prompt:  "{{ . }} [y/N]: ",
			Valid:   "{{ . }} [y/N]: ",
			Invalid: "{{ . }} [y/N]: ",
			Success: "{{ . }}: ",
		}
	}

	_, err := prompt.Run()
	if err != nil {
		if errors.Is(err, promptui.ErrAbort) {
			return false, nil
		}
		if errors.Is(err, promptui.ErrInterrupt) {
			return false, fmt.Errorf("interrupted")
		}
		return false, nil
	}

	return true, nil
}

// SelectItem represents an item in a selection menu.
type SelectItem struct {
	Name        string
	Description string
	Value       interface{}
}

// promptSelect shows an interactive selection menu.
func promptSelect(label string, items []SelectItem) (int, error) {
	var templates *promptui.SelectTemplates
	if colorsDisabled {
		templates = &promptui.SelectTemplates{
			Label:    "{{ . }}",
			Active:   "> {{ .Name }}{{ if .Description }} - {{ .Description }}{{ end }}",
			Inactive: "  {{ .Name }}{{ if .Description }} - {{ .Description }}{{ end }}",
			Selected: "* {{ .Name }}",
		}
	} else {
		templates = &promptui.SelectTemplates{
			Label:    "{{ . }}",
			Active:   "▸ {{ .Name | cyan | bold }}{{ if .Description }} - {{ .Description | faint }}{{ end }}",
			Inactive: "  {{ .Name }}{{ if .Description }} - {{ .Description | faint }}{{ end }}",
			Selected: "✔ {{ .Name | green }}",
		}
	}

	prompt := promptui.Select{
		Label:     label,
		Items:     items,
		Templates: templates,
		Size:      10,
	}

	idx, _, err := prompt.Run()
	if err != nil {
		if errors.Is(err, promptui.ErrInterrupt) {
			return -1, fmt.Errorf("interrupted")
		}
		return -1, err
	}

	return idx, nil
}

// promptSelectString shows a selection menu for string options.
func promptSelectString(label string, options []string) (string, error) {
	var templates *promptui.SelectTemplates
	if colorsDisabled {
		templates = &promptui.SelectTemplates{
			Label:    "{{ . }}",
			Active:   "> {{ . }}",
			Inactive: "  {{ . }}",
			Selected: "* {{ . }}",
		}
	} else {
		templates = &promptui.SelectTemplates{
			Label:    "{{ . }}",
			Active:   "▸ {{ . | cyan | bold }}",
			Inactive: "  {{ . }}",
			Selected: "✔ {{ . | green }}",
		}
	}

	prompt := promptui.Select{
		Label:     label,
		Items:     options,
		Size:      10,
		Templates: templates,
	}

	_, result, err := prompt.Run()
	if err != nil {
		if errors.Is(err, promptui.ErrInterrupt) {
			return "", fmt.Errorf("interrupted")
		}
		return "", err
	}

	return result, nil
}

// Action represents a menu action.
type Action struct {
	Name        string
	Description string
	Run         func() error
}

// ErrExit is returned when the user selects exit.
var ErrExit = errors.New("exit")

// promptActionMenu shows the main action menu and runs the selected action.
func promptActionMenu(actions []Action) error {
	items := make([]SelectItem, len(actions))
	for i, action := range actions {
		items[i] = SelectItem{
			Name:        action.Name,
			Description: action.Description,
		}
	}

	idx, err := promptSelect("Select action", items)
	if err != nil {
		return err
	}

	if actions[idx].Run == nil {
		return ErrExit // Exit action
	}

	fmt.Println()
	return actions[idx].Run()
}

// promptInput provides basic text input (for backwards compatibility).
func promptInput(label string) (string, error) {
	return promptText(label, "", nil)
}
