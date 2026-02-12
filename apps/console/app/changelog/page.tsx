import { MarketingPage } from "../../components/marketing-page";

export default function ChangelogPage() {
  return (
    <MarketingPage
      title="Changelog"
      description="Track visible product milestones and contract hardening updates."
      bullets={[
        "Auth contract and RBAC hardening milestones",
        "Real API replay and full-loop verification updates",
        "UX and sitemap expansion for growth workflows"
      ]}
    />
  );
}
