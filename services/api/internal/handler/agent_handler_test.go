package handler

import "testing"

func TestValidPolicyTypesUseSharedCanonicalEnum(t *testing.T) {
	t.Parallel()

	expected := []string{"item_scope", "action_perm", "rate_limit", "time_window", "step_up"}
	for _, policyType := range expected {
		if !validPolicyTypes[policyType] {
			t.Fatalf("expected policy type %q to be accepted", policyType)
		}
	}

	rejected := []string{"scope", "scope_access", "approval", "step_up_auth"}
	for _, policyType := range rejected {
		if validPolicyTypes[policyType] {
			t.Fatalf("expected legacy policy type %q to be rejected", policyType)
		}
	}
}
