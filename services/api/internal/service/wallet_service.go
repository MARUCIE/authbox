package service

import (
	"context"
	"errors"
	"fmt"
	"math/big"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
)

// Canonical wallet enum vocabularies. These MUST stay identical to the shared
// TS types (packages/shared/src/types/wallet.ts) and the Zod schemas. The
// 2026-06-02 acceptance pass shipped two release-blockers from exactly this kind
// of cross-layer enum drift; WalletEnumParity (wallet_service_test.go) guards it.
var (
	validCoins         = map[string]bool{"btc": true, "eth": true}
	validNetworks      = map[string]bool{"mainnet": true, "testnet": true}
	validBtcScriptType = map[string]bool{"p2wpkh": true, "p2pkh": true}
)

// IsValidCoin / IsValidNetwork / IsValidBtcScriptType are exported so handlers
// can reject bad input with 400 (not 500) and so the parity test can assert the
// vocabularies from outside the package.
func IsValidCoin(c string) bool          { return validCoins[c] }
func IsValidNetwork(n string) bool       { return validNetworks[n] }
func IsValidBtcScriptType(s string) bool { return validBtcScriptType[s] }

type WalletService struct {
	repo    domain.WalletRepository
	balance *BalanceProvider
}

func NewWalletService(repo domain.WalletRepository, balance *BalanceProvider) *WalletService {
	return &WalletService{repo: repo, balance: balance}
}

// --- Request / Response types ---

type CreateWalletAccountRequest struct {
	Coin           string `json:"coin"`
	Network        string `json:"network"`
	ScriptType     string `json:"scriptType"`
	AccountIndex   int    `json:"accountIndex"`
	DerivationPath string `json:"derivationPath"`
	XPub           string `json:"xpub"`
	Label          string `json:"label"`
}

type AddAddressRequest struct {
	Address        string `json:"address"`
	DerivationPath string `json:"derivationPath"`
	Change         int16  `json:"change"`
	AddressIndex   int    `json:"addressIndex"`
	PublicKey      string `json:"publicKey"`
}

type WalletAccountResponse struct {
	ID             string  `json:"id"`
	Coin           string  `json:"coin"`
	Network        string  `json:"network"`
	ScriptType     *string `json:"scriptType,omitempty"`
	AccountIndex   int     `json:"accountIndex"`
	DerivationPath string  `json:"derivationPath"`
	XPub           string  `json:"xpub"`
	Label          string  `json:"label"`
	CachedBalance  string  `json:"cachedBalance"`
	CreatedAt      string  `json:"createdAt"`
	UpdatedAt      string  `json:"updatedAt"`
}

type WalletAddressResponse struct {
	ID             string `json:"id"`
	AccountID      string `json:"accountId"`
	Address        string `json:"address"`
	DerivationPath string `json:"derivationPath"`
	Change         int16  `json:"change"`
	AddressIndex   int    `json:"addressIndex"`
	PublicKey      string `json:"publicKey"`
	CachedBalance  string `json:"cachedBalance"`
}

type BalanceResponse struct {
	Coin        string `json:"coin"`
	Network     string `json:"network"`
	Confirmed   string `json:"confirmed"`
	Unconfirmed string `json:"unconfirmed"`
}

func accountToResponse(a *domain.WalletAccount) WalletAccountResponse {
	return WalletAccountResponse{
		ID:             a.ID.String(),
		Coin:           a.Coin,
		Network:        a.Network,
		ScriptType:     a.ScriptType,
		AccountIndex:   a.AccountIndex,
		DerivationPath: a.DerivationPath,
		XPub:           a.XPub,
		Label:          a.Label,
		CachedBalance:  a.CachedBalance,
		CreatedAt:      a.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
		UpdatedAt:      a.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}
}

func addressToResponse(a *domain.WalletAddress) WalletAddressResponse {
	return WalletAddressResponse{
		ID:             a.ID.String(),
		AccountID:      a.AccountID.String(),
		Address:        a.Address,
		DerivationPath: a.DerivationPath,
		Change:         a.Change,
		AddressIndex:   a.AddressIndex,
		PublicKey:      a.PublicKey,
		CachedBalance:  a.CachedBalance,
	}
}

// --- Operations ---

func (s *WalletService) CreateAccount(ctx context.Context, userID uuid.UUID, req CreateWalletAccountRequest) (*WalletAccountResponse, error) {
	network := req.Network
	if network == "" {
		network = "mainnet"
	}

	account := &domain.WalletAccount{
		UserID:         userID,
		Coin:           req.Coin,
		Network:        network,
		AccountIndex:   req.AccountIndex,
		DerivationPath: req.DerivationPath,
		XPub:           req.XPub,
		Label:          req.Label,
	}
	if req.Coin == "btc" {
		scriptType := req.ScriptType
		if scriptType == "" {
			scriptType = "p2wpkh" // native segwit default
		}
		account.ScriptType = &scriptType
	}

	if err := s.repo.CreateAccount(ctx, account); err != nil {
		return nil, err
	}
	resp := accountToResponse(account)
	return &resp, nil
}

func (s *WalletService) ListAccounts(ctx context.Context, userID uuid.UUID) ([]WalletAccountResponse, error) {
	accounts, err := s.repo.ListAccounts(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]WalletAccountResponse, len(accounts))
	for i := range accounts {
		out[i] = accountToResponse(&accounts[i])
	}
	return out, nil
}

func (s *WalletService) DeleteAccount(ctx context.Context, id, userID uuid.UUID) error {
	return s.repo.DeleteAccount(ctx, id, userID)
}

func (s *WalletService) AddAddress(ctx context.Context, id, userID uuid.UUID, req AddAddressRequest) (*WalletAddressResponse, error) {
	account, err := s.repo.GetAccount(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	if account == nil {
		return nil, domain.ErrWalletAccountNotFound
	}

	addr := &domain.WalletAddress{
		AccountID:      account.ID,
		Address:        req.Address,
		DerivationPath: req.DerivationPath,
		Change:         req.Change,
		AddressIndex:   req.AddressIndex,
		PublicKey:      req.PublicKey,
	}
	if err := s.repo.CreateAddress(ctx, addr); err != nil {
		return nil, err
	}
	resp := addressToResponse(addr)
	return &resp, nil
}

func (s *WalletService) ListAddresses(ctx context.Context, id, userID uuid.UUID) ([]WalletAddressResponse, error) {
	account, err := s.repo.GetAccount(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	if account == nil {
		return nil, domain.ErrWalletAccountNotFound
	}
	addrs, err := s.repo.ListAddresses(ctx, account.ID)
	if err != nil {
		return nil, err
	}
	out := make([]WalletAddressResponse, len(addrs))
	for i := range addrs {
		out[i] = addressToResponse(&addrs[i])
	}
	return out, nil
}

// RefreshBalance sums the watch-only balance across every stored address of an
// account by querying public indexers, persists the confirmed total to the
// account cache, and returns the live figures. No private keys are touched.
func (s *WalletService) RefreshBalance(ctx context.Context, id, userID uuid.UUID) (*BalanceResponse, error) {
	account, err := s.repo.GetAccount(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	if account == nil {
		return nil, domain.ErrWalletAccountNotFound
	}

	addrs, err := s.repo.ListAddresses(ctx, account.ID)
	if err != nil {
		return nil, err
	}

	confirmed := new(big.Int)
	unconfirmed := new(big.Int)
	for i := range addrs {
		bal, err := s.balance.AddressBalance(ctx, account.Coin, account.Network, addrs[i].Address)
		if err != nil {
			return nil, fmt.Errorf("balance lookup for %s failed: %w", addrs[i].Address, err)
		}
		if v, ok := new(big.Int).SetString(bal.Confirmed, 10); ok {
			confirmed.Add(confirmed, v)
		}
		if v, ok := new(big.Int).SetString(bal.Unconfirmed, 10); ok {
			unconfirmed.Add(unconfirmed, v)
		}
	}

	if err := s.repo.UpdateAccountBalance(ctx, account.ID, confirmed.String()); err != nil {
		return nil, err
	}

	return &BalanceResponse{
		Coin:        account.Coin,
		Network:     account.Network,
		Confirmed:   confirmed.String(),
		Unconfirmed: unconfirmed.String(),
	}, nil
}

// IsNotFound reports whether an error is the wallet-account-not-found sentinel.
func IsNotFound(err error) bool {
	return errors.Is(err, domain.ErrWalletAccountNotFound)
}
