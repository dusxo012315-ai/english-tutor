import { ArticlePrint } from "@/features/plan/article-print";
export default async function Page({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const { articleId } = await params;
  return <ArticlePrint articleId={articleId} />;
}
