package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5/middleware"
)

// APIError represents an API error response
type APIError struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"request_id,omitempty"`
}

// PaginatedResponse represents a paginated list response
type PaginatedResponse struct {
	Items         any    `json:"items"`
	NextPageToken string `json:"next_page_token,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	requestID := middleware.GetReqID(r.Context())
	writeJSON(w, status, APIError{
		Code:      code,
		Message:   message,
		RequestID: requestID,
	})
}

func decodeJSON(r *http.Request, v any) error {
	return json.NewDecoder(r.Body).Decode(v)
}
