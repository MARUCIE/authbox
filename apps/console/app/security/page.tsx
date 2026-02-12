import { MarketingPage } from "../../components/marketing-page";

export default function SecurityPage() {
  return (
    <MarketingPage
      title="Security Baseline"
      description="Security controls are centered on strict AuthN/AuthZ, role boundaries, and immutable audit traceability."
      bullets={[
        "Bearer token registry with role whitelist fail-fast validation",
        "Role-gated operations for rotate/revoke/bind/export",
        "Append-only audit hash chain with deny-path evidence"
      ]}
    />
  );
}
