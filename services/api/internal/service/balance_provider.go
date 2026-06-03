package service

import (
	"context"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// BalanceProvider fetches watch-only balances from public block explorers.
//
// It only ever sends PUBLIC addresses to PUBLIC indexers — no key material is
// involved, so this outbound egress carries no exfiltration risk. SSRF is
// prevented two ways: the base URL is chosen from a fixed (coin, network) map
// (never user input), and the address is format-validated and URL-escaped
// before it touches the request path.
type BalanceProvider struct {
	client *http.Client
}

func NewBalanceProvider() *BalanceProvider {
	return &BalanceProvider{client: &http.Client{Timeout: 10 * time.Second}}
}

// Balance is a confirmed/unconfirmed pair in the coin's smallest unit, as
// decimal strings (wei can exceed int64).
type Balance struct {
	Confirmed   string
	Unconfirmed string
}

// Fixed, trusted indexer endpoints. Keyed by "coin:network" so a caller can
// never steer the request at an arbitrary host.
var btcExplorerBase = map[string]string{
	"mainnet": "https://mempool.space/api",
	"testnet": "https://mempool.space/testnet/api",
}

var ethRPCBase = map[string]string{
	"mainnet": "https://ethereum-rpc.publicnode.com",
	"testnet": "https://ethereum-sepolia-rpc.publicnode.com",
}

// Conservative address charset guards. The real address-validity check is the
// derivation itself; this only needs to keep the value safe in a URL path.
var (
	btcAddrRe = regexp.MustCompile(`^[0-9a-zA-Z]{14,90}$`)
	ethAddrRe = regexp.MustCompile(`^0x[0-9a-fA-F]{40}$`)
)

// AddressBalance returns the watch-only balance for a single address.
func (p *BalanceProvider) AddressBalance(ctx context.Context, coin, network, address string) (Balance, error) {
	if network == "" {
		network = "mainnet"
	}
	switch coin {
	case "btc":
		return p.btcBalance(ctx, network, address)
	case "eth":
		return p.ethBalance(ctx, network, address)
	default:
		return Balance{}, fmt.Errorf("unsupported coin %q", coin)
	}
}

func (p *BalanceProvider) btcBalance(ctx context.Context, network, address string) (Balance, error) {
	base, ok := btcExplorerBase[network]
	if !ok {
		return Balance{}, fmt.Errorf("unsupported btc network %q", network)
	}
	if !btcAddrRe.MatchString(address) {
		return Balance{}, fmt.Errorf("invalid btc address")
	}

	endpoint := base + "/address/" + url.PathEscape(address)
	var body struct {
		ChainStats struct {
			FundedTxoSum int64 `json:"funded_txo_sum"`
			SpentTxoSum  int64 `json:"spent_txo_sum"`
		} `json:"chain_stats"`
		MempoolStats struct {
			FundedTxoSum int64 `json:"funded_txo_sum"`
			SpentTxoSum  int64 `json:"spent_txo_sum"`
		} `json:"mempool_stats"`
	}
	if err := p.getJSON(ctx, endpoint, &body); err != nil {
		return Balance{}, err
	}

	confirmed := body.ChainStats.FundedTxoSum - body.ChainStats.SpentTxoSum
	unconfirmed := body.MempoolStats.FundedTxoSum - body.MempoolStats.SpentTxoSum
	return Balance{
		Confirmed:   strconv.FormatInt(confirmed, 10),
		Unconfirmed: strconv.FormatInt(unconfirmed, 10),
	}, nil
}

func (p *BalanceProvider) ethBalance(ctx context.Context, network, address string) (Balance, error) {
	base, ok := ethRPCBase[network]
	if !ok {
		return Balance{}, fmt.Errorf("unsupported eth network %q", network)
	}
	if !ethAddrRe.MatchString(address) {
		return Balance{}, fmt.Errorf("invalid eth address")
	}

	reqBody := fmt.Sprintf(
		`{"jsonrpc":"2.0","method":"eth_getBalance","params":["%s","latest"],"id":1}`,
		strings.ToLower(address),
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base, strings.NewReader(reqBody))
	if err != nil {
		return Balance{}, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return Balance{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Balance{}, fmt.Errorf("eth rpc status %d", resp.StatusCode)
	}

	var rpcResp struct {
		Result string `json:"result"`
		Error  *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&rpcResp); err != nil {
		return Balance{}, err
	}
	if rpcResp.Error != nil {
		return Balance{}, fmt.Errorf("eth rpc error: %s", rpcResp.Error.Message)
	}

	wei, ok := new(big.Int).SetString(strings.TrimPrefix(rpcResp.Result, "0x"), 16)
	if !ok {
		return Balance{}, fmt.Errorf("invalid eth balance hex %q", rpcResp.Result)
	}
	return Balance{Confirmed: wei.String(), Unconfirmed: "0"}, nil
}

func (p *BalanceProvider) getJSON(ctx context.Context, endpoint string, out interface{}) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("indexer status %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}
