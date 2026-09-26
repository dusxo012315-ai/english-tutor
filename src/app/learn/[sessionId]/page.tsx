import { ReadingPage } from "@/features/reading/reading-page";
export default async function Page({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ReadingPage key={sessionId} sessionId={sessionId} />;
}
