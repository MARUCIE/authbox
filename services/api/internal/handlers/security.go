package handlers

import (
	"net/http"

	"auth-box-api/internal/security"
)

func principalFromRequest(w http.ResponseWriter, r *http.Request) (security.Principal, bool) {
	principal, ok := security.PrincipalFromContext(r.Context())
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "missing principal context")
		return security.Principal{}, false
	}
	return principal, true
}
