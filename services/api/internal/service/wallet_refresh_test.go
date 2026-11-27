package service

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
)

type refreshRepo struct {
	domain.WalletRepository
	account *domain.WalletAccount
	addrs   []domain.WalletAddress
	saved   string
}

func (r *refreshRepo) GetAccount(context.Context, uuid.UUID, uuid.UUID) (*domain.WalletAccount, error) {
	return r.account, nil
}
func (r *refreshRepo) ListAddresses(context.Context, uuid.UUID) ([]domain.WalletAddress, error) {
	return r.addrs, nil
}
func (r *refreshRepo) UpdateAccountBalance(_ context.Context, _ uuid.UUID, b string) error {
	r.saved = b
	return nil
}

// slowExplorer answers every BTC address lookup with 1000 sats after a delay
// and records how many lookups were in flight at once.
type slowExplorer struct {
	inFlight, peak atomic.Int32
}

func (e *slowExplorer) RoundTrip(req *http.Request) (*http.Response, error) {
	n := e.inFlight.Add(1)
	defer e.inFlight.Add(-1)
	for {
		p := e.peak.Load()
		if n <= p || e.peak.CompareAndSwap(p, n) {
			break
		}
	}
	select {
	case <-time.After(50 * time.Millisecond):
	case <-req.Context().Done():
		return nil, req.Context().Err()
	}
	body := `{"chain_stats":{"funded_txo_sum":1000,"spent_txo_sum":0},"mempool_stats":{"funded_txo_sum":0,"spent_txo_sum":0}}`
	return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: http.Header{"Content-Type": {"application/json"}}, Request: req}, nil
}

func TestRefreshBalanceLooksUpAddressesInParallel(t *testing.T) {
	repo := &refreshRepo{account: &domain.WalletAccount{ID: uuid.New(), Coin: "btc", Network: "mainnet"}}
	for i := 0; i < 40; i++ {
		repo.addrs = append(repo.addrs, domain.WalletAddress{Address: fmt.Sprintf("bc1qtestaddress%05d", i)})
	}
	explorer := &slowExplorer{}
	svc := NewWalletService(repo, &BalanceProvider{client: &http.Client{Transport: explorer}}, nil, nil)

	start := time.Now()
	resp, err := svc.RefreshBalance(context.Background(), uuid.New(), uuid.New())
	if err != nil {
		t.Fatalf("refresh: %v", err)
	}
	if resp.Confirmed != "40000" || repo.saved != "40000" {
		t.Fatalf("confirmed=%s saved=%s, want 40000", resp.Confirmed, repo.saved)
	}
	if peak := explorer.peak.Load(); peak < 2 || peak > balanceLookupConcurrency {
		t.Fatalf("peak concurrent lookups = %d, want 2..%d", peak, balanceLookupConcurrency)
	}
	// 40 serial lookups take 2s; 8 at a time take about 250ms.
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Fatalf("refresh took %v", elapsed)
	}
}
