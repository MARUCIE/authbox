import { MarketingPage } from "../../components/marketing-page";

export default function ProductPage() {
  return (
    <MarketingPage
      title="Auth Box Product"
      description="Auth Box is an API authorization governance surface that connects platform onboarding, credential lifecycle, assistant access, and compliance-grade auditing."
      bullets={[
        "Unify platform account creation and authorization lifecycle",
        "Enforce role boundaries for high-risk API actions",
        "Keep evidence-ready audit chain for compliance workflows"
      ]}
    />
  );
}
