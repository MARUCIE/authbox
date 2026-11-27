package service

import (
	"encoding/json"
	"errors"
	"io"
)

// maxUpstreamBody bounds how much of a chain indexer or RPC response is read.
// Responses are normally a few KB; a UTXO list for a busy address stays well
// under this. Client timeouts bound a slow upstream, this bounds a fast,
// oversized one.
const maxUpstreamBody = 8 << 20

var errUpstreamBodyTooLarge = errors.New("upstream response too large")

type cappedReader struct {
	r         io.Reader
	remaining int64
}

func (c *cappedReader) Read(p []byte) (int, error) {
	if c.remaining <= 0 {
		return 0, errUpstreamBodyTooLarge
	}
	if int64(len(p)) > c.remaining {
		p = p[:c.remaining]
	}
	n, err := c.r.Read(p)
	c.remaining -= int64(n)
	return n, err
}

// decodeUpstreamJSON decodes one JSON value from an upstream response body,
// failing with errUpstreamBodyTooLarge instead of buffering an unbounded body.
func decodeUpstreamJSON(body io.Reader, out interface{}) error {
	return json.NewDecoder(&cappedReader{r: body, remaining: maxUpstreamBody}).Decode(out)
}
