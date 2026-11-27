package service

import (
	"errors"
	"io"
	"strings"
	"testing"
)

func TestDecodeUpstreamJSONRejectsOversizedBody(t *testing.T) {
	// A JSON string longer than the cap: the decoder must stop, not buffer it all.
	body := io.MultiReader(strings.NewReader(`{"result":"`), strings.NewReader(strings.Repeat("a", maxUpstreamBody+1)), strings.NewReader(`"}`))
	var out struct{ Result string }
	err := decodeUpstreamJSON(body, &out)
	if !errors.Is(err, errUpstreamBodyTooLarge) {
		t.Fatalf("err = %v, want errUpstreamBodyTooLarge", err)
	}
}

func TestDecodeUpstreamJSONDecodesNormalBody(t *testing.T) {
	var out struct{ Result string }
	if err := decodeUpstreamJSON(strings.NewReader(`{"Result":"0x1"}`), &out); err != nil || out.Result != "0x1" {
		t.Fatalf("got %+v, %v", out, err)
	}
}
