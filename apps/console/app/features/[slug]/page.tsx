import { notFound } from "next/navigation";
import { MarketingPage } from "../../../components/marketing-page";
import { featureCards, findMarketingCard } from "../../../lib/marketing";

export function generateStaticParams() {
  return featureCards.map((item) => ({ slug: item.slug }));
}

export default async function FeatureDetailPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const card = findMarketingCard(featureCards, slug);
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
