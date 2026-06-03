package domain

import "errors"

// Sentinel errors for not-found conditions.
// Repositories return these; handlers match with errors.Is().
var (
	ErrItemNotFound          = errors.New("item not found")
	ErrAgentNotFound         = errors.New("agent not found")
	ErrPolicyNotFound        = errors.New("policy not found")
	ErrConnectionNotFound    = errors.New("connection not found")
	ErrWalletAccountNotFound = errors.New("wallet account not found")
)
