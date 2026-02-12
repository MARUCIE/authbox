export type MarketingCard = {
  slug: string;
  title: string;
  summary: string;
  bullets: string[];
};

export const featureCards: MarketingCard[] = [
  {
    slug: "platform-account-provisioning",
    title: "Platform Account Provisioning",
    summary: "Provision external platform accounts with consistent metadata and audit trace.",
    bullets: [
      "Centralized platform registry and account onboarding flow",
      "Deterministic account status lifecycle",
      "Console-guided onboarding from discovery CTA"
    ]
  },
  {
    slug: "credential-lifecycle",
    title: "Credential Lifecycle",
    summary: "Manage create-rotate-revoke operations with strict role boundaries.",
    bullets: [
      "RBAC guards for high-risk actions",
      "Structured errors and request traceability",
      "Audit events for every credential mutation"
    ]
  },
  {
    slug: "ai-assistant-governance",
    title: "AI Assistant Governance",
    summary: "Bind assistants to credentials with explicit scope and policy-aware controls.",
    bullets: [
      "Assistant binding with scope metadata",
      "Policy-oriented access decisions",
      "Operational visibility for security operations"
    ]
  },
  {
    slug: "audit-hash-chain",
    title: "Audit Hash Chain",
    summary: "Maintain append-only audit events with event hash linkage for compliance review.",
    bullets: [
      "Hash-chain verification for tamper evidence",
      "Export endpoints with role-based access",
      "Traceable deny/allow decisions"
    ]
  }
];

export const useCaseCards: MarketingCard[] = [
  {
    slug: "security-ops",
    title: "Security Ops",
    summary: "Operate credential rotation and assistant access with minimal privilege.",
    bullets: [
      "Security-owned rotate/revoke permissions",
      "Deny-path auditing for access violations",
      "Reusable operational playbooks"
    ]
  },
  {
    slug: "compliance-audit",
    title: "Compliance Audit",
    summary: "Collect immutable action trails and export evidence for review cycles.",
    bullets: [
      "Audit export workflows with RBAC gates",
      "Chain-link checks for evidence integrity",
      "Evidence directories for SOP traceability"
    ]
  },
  {
    slug: "platform-admin",
    title: "Platform Admin",
    summary: "Configure platform integrations and account baselines in one control surface.",
    bullets: [
      "Consistent onboarding through /platforms/new",
      "Cross-team visibility into account posture",
      "Fast handoff to Security Ops workflows"
    ]
  }
];

export const compareCards: MarketingCard[] = [
  {
    slug: "hashicorp-vault-alternative",
    title: "Vault Alternative",
    summary: "Pair credential controls with end-to-end account and assistant governance.",
    bullets: [
      "Not only secret storage: includes account and assistant lifecycle",
      "Built-in operational journeys for platform teams",
      "Audit events tied to product workflows"
    ]
  },
  {
    slug: "doppler-alternative",
    title: "Doppler Alternative",
    summary: "Extend secret distribution with policy-aware API authorization workflows.",
    bullets: [
      "Credential lifecycle + assistant binding model",
      "Role-scoped API contracts for critical actions",
      "Evidence-oriented SOP execution model"
    ]
  },
  {
    slug: "kong-konnect-alternative",
    title: "Kong Konnect Alternative",
    summary: "Complement gateway governance with authorization lifecycle and compliance traceability.",
    bullets: [
      "Focus on authorization object lifecycle",
      "Integrated audit export and chain verification",
      "Direct Console flow from setup to compliance"
    ]
  }
];

export function findMarketingCard(
  cards: MarketingCard[],
  slug: string
): MarketingCard | undefined {
  return cards.find((card) => card.slug === slug);
}

export function allPublicPaths(): string[] {
  return [
    "/",
    "/product",
    ...featureCards.map((item) => `/features/${item.slug}`),
    ...useCaseCards.map((item) => `/use-cases/${item.slug}`),
    ...compareCards.map((item) => `/compare/${item.slug}`),
    "/pricing",
    "/security",
    "/docs",
    "/blog",
    "/changelog",
    "/contact"
  ];
}
