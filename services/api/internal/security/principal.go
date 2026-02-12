package security

import (
	"context"
	"slices"
	"strings"
)

type principalContextKey struct{}

// Principal identifies the caller after AuthN/AuthZ.
type Principal struct {
	ActorID string              `json:"actor_id"`
	Source  string              `json:"source"`
	Roles   map[string]struct{} `json:"roles"`
}

func NewPrincipal(actorID, source string, roles []string) Principal {
	roleSet := make(map[string]struct{}, len(roles))
	for _, role := range roles {
		role = strings.TrimSpace(role)
		if role == "" {
			continue
		}
		roleSet[role] = struct{}{}
	}

	return Principal{
		ActorID: strings.TrimSpace(actorID),
		Source:  strings.TrimSpace(source),
		Roles:   roleSet,
	}
}

func (p Principal) HasRole(role string) bool {
	_, ok := p.Roles[role]
	return ok
}

func (p Principal) RoleList() []string {
	roles := make([]string, 0, len(p.Roles))
	for role := range p.Roles {
		roles = append(roles, role)
	}
	slices.Sort(roles)
	return roles
}

func WithPrincipal(ctx context.Context, principal Principal) context.Context {
	return context.WithValue(ctx, principalContextKey{}, principal)
}

func PrincipalFromContext(ctx context.Context) (Principal, bool) {
	principal, ok := ctx.Value(principalContextKey{}).(Principal)
	return principal, ok
}
