import { AnkiPage } from "@/features/anki/anki-page";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ card?: string; candidate?: string }>;
}) {
  const { card, candidate } = await searchParams;
  return (
    <AnkiPage initialCard={card ?? null} initialCandidate={candidate ?? null} />
  );
}
