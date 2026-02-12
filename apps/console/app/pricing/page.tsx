import { MarketingPage } from "../../components/marketing-page";

export default function PricingPage() {
  return (
    <MarketingPage
      title="Pricing"
      description="Pricing guidance for authorization governance adoption. Final commercial packaging can be aligned with contract and compliance requirements."
      bullets={[
        "Baseline: platform/account governance core",
        "Advanced: assistant governance and audit exports",
        "Enterprise: policy automation and compliance workflow enablement"
      ]}
    />
  );
}
