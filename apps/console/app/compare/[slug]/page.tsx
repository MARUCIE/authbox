import { notFound } from "next/navigation";
import { MarketingPage } from "../../../components/marketing-page";
import { compareCards, findMarketingCard } from "../../../lib/marketing";

export function generateStaticParams() {
  return compareCards.map((item) => ({ slug: item.slug }));
}

export default function CompareDetailPage({
  params
}: {
  params: { slug: string };
}) {
  const card = findMarketingCard(compareCards, params.slug);
  if (!card) {
    notFound();
  }

  return (
    <MarketingPage
      title={card.title}
      description={card.summary}
      bullets={card.bullets}
      eyebrow="Compare"
    />
  );
}
