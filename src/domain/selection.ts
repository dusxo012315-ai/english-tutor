import { UserFacingError } from "@/domain/errors";
import type { Article, TutorContext } from "./types";
export function buildTutorContext(
  article: Article,
  blockId: string,
  start: number,
  end: number,
): TutorContext {
  const index = article.blocks.findIndex((b) => b.id === blockId);
  const block = article.blocks[index];
  if (
    !block ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end > block.text.length ||
    start >= end ||
    end - start > 1200
  )
    throw new UserFacingError("본문에서 1~1,200자를 선택해 주세요.");
  // Reject UTF-16 boundaries inside a surrogate pair rather than changing the quote.
  const splitsPair = (offset: number) =>
    offset > 0 &&
    offset < block.text.length &&
    /[\uD800-\uDBFF]/.test(block.text[offset - 1]) &&
    /[\uDC00-\uDFFF]/.test(block.text[offset]);
  if (splitsPair(start) || splitsPair(end))
    throw new UserFacingError("문자 전체를 선택해 주세요.");
  let contextStart = Math.max(
    0,
    start - Math.floor((6000 - (end - start)) / 2),
  );
  let contextEnd = Math.min(block.text.length, contextStart + 6000);
  contextStart = Math.max(0, contextEnd - 6000);
  if (splitsPair(contextStart)) contextStart++;
  if (splitsPair(contextEnd)) contextEnd--;
  const context = [
    {
      blockId: block.id,
      text: block.text.slice(contextStart, contextEnd),
      start: contextStart,
      end: contextEnd,
    },
  ];
  let budget = 6000 - context[0].text.length;
  for (const neighborIndex of [index - 1, index + 1]) {
    const neighbor = article.blocks[neighborIndex];
    if (neighbor && neighbor.text.length <= budget) {
      const part = {
        blockId: neighbor.id,
        text: neighbor.text,
        start: 0,
        end: neighbor.text.length,
      };
      if (neighborIndex < index) context.unshift(part);
      else context.push(part);
      budget -= neighbor.text.length;
    }
  }
  return {
    source: {
      snapshotId: article.id,
      title: article.title,
      url: article.sourceUrl,
      provider: article.provider ?? "mock",
      pageId: article.pageId,
      revisionId: article.revisionId,
    },
    selection: { blockId, start, end, quote: block.text.slice(start, end) },
    context,
    contextTruncated:
      contextStart !== 0 ||
      contextEnd !== block.text.length ||
      [index - 1, index + 1].some(
        (i) =>
          article.blocks[i] &&
          !context.some((c) => c.blockId === article.blocks[i].id),
      ),
  };
}
