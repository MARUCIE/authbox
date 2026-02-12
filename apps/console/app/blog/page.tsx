import { MarketingPage } from "../../components/marketing-page";

export default function BlogPage() {
  return (
    <MarketingPage
      title="Blog"
      description="Editorial stream for compliance updates, implementation notes, and customer journey insights."
      bullets={[
        "Monthly operational lessons from real API replay",
        "Compliance and audit design notes",
        "Migration and compare-page narratives"
      ]}
    />
  );
}
