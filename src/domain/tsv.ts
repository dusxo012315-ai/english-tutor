import { UserFacingError } from "@/domain/errors";
import type { Card } from "./types";
export function htmlText(s: string) {
  return s
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\n/g, "<br>");
}
export function serializeTsv(cards: Card[]): string {
  if (
    !cards.length ||
    cards.some(
      (c) =>
        c.blocked ||
        c.status !== "confirmed" ||
        !c.front.trim() ||
        !c.back.trim(),
    )
  )
    throw new UserFacingError("검토가 끝난 확정 카드만 내보낼 수 있어요.");
  return (
    [
      "#separator:Tab",
      "#html:true",
      "#tags column:3",
      ...cards.map((c) =>
        [
          htmlText(c.front),
          htmlText(`${c.back}\n\n${c.attribution}`),
          `ai_english reading ${c.direction}`,
        ]
          .map((s) => `"${s.replace(/"/g, '""')}"`)
          .join("\t"),
      ),
    ].join("\n") + "\n"
  );
}
