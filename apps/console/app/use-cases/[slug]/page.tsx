import { notFound } from "next/navigation";
import { MarketingPage } from "../../../components/marketing-page";
import { findMarketingCard, useCaseCards } from "../../../lib/marketing";

export function generateStaticParams() {
  return useCaseCards.map((item) => ({ slug: item.slug }));
}

export default function UseCaseDetailPage({
  params
}: {
  params: { slug: string };
}) {
  const card = findMarketingCard(useCaseCards, params.slug);
  if (!card) {
    notFound();
  }

  return (
    <MarketingPage
      title={card.title}
      description={card.summary}
      bullets={card.bullets}
      eyebrow="Use case"
    />
  );
}
