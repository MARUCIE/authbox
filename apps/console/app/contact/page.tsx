import { MarketingPage } from "../../components/marketing-page";

export default function ContactPage() {
  return (
    <MarketingPage
      title="Contact"
      description="Coordinate onboarding, security review, and compliance discussions with the Auth Box team."
      bullets={[
        "Security and architecture review intake",
        "Pilot onboarding planning",
        "Compliance workflow and evidence export alignment"
      ]}
    />
  );
}
