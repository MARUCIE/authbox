import { notFound } from "next/navigation";
import { MarketingPage } from "../../../components/marketing-page";
import { compareCards, findMarketingCard } from "../../../lib/marketing";

export function generateStaticParams() {
  return compareCards.map((item) => ({ slug: item.slug }));
}

export default async function CompareDetailPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const card = findMarketingCard(compareCards, slug);
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
