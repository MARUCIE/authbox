import { notFound } from "next/navigation";
import { MarketingPage } from "../../../components/marketing-page";
import { featureCards, findMarketingCard } from "../../../lib/marketing";

export function generateStaticParams() {
  return featureCards.map((item) => ({ slug: item.slug }));
}

export default function FeatureDetailPage({
  params
}: {
  params: { slug: string };
}) {
  const card = findMarketingCard(featureCards, params.slug);
  if (!card) {
    notFound();
  }

  return (
    <MarketingPage
      title={card.title}
      description={card.summary}
      bullets={card.bullets}
      eyebrow="Feature"
    />
  );
}
