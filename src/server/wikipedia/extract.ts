import { load } from "cheerio";
import { WikipediaError } from "./errors";
import type { Article } from "@/domain/types";
export const EXTRACTOR_VERSION = "reading-v1";
export function extractArticle(html: string) {
  const $ = load(html);
  const root = $(".mw-parser-output").first().length
    ? $(".mw-parser-output").first()
    : $("body");
  const extraNotices: string[] = [];
  // Preserve article-specific credit/license notices before removing layout boxes.
  root
    .find(".ambox,.tmbox,.attribution,.license,.licensetpl,.mw-reuse-warning")
    .each((_, node) => {
      const element = $(node);
      const text = element.text().replace(/\s+/g, " ").trim();
      if (
        /licen[cs]e|copyright|attribut|public domain|incorporates text|credit/i.test(
          text,
        )
      ) {
        const links = element
          .find("a[href]")
          .map((_, a) => $(a).attr("href"))
          .get()
          .map((href) => {
            try {
              const url = new URL(href, "https://simple.wikipedia.org");
              return url.protocol === "https:" ? url.href : "";
            } catch {
              return "";
            }
          })
          .filter(Boolean);
        extraNotices.push(
          `${text}${links.length ? ` (${links.join(" · ")})` : ""}`,
        );
      }
    });
  const omissions = new Set<string>();
  const remove = (selector: string, label: string) => {
    if (root.find(selector).length) {
      omissions.add(label);
      root.find(selector).remove();
    }
  };
  root.find("script,style,iframe,form,input,button,object,embed").remove();
  remove(
    "table,.infobox,.navbox,.vertical-navbox,.sidebar,.toc,.metadata,.ambox,.tmbox",
    "표·정보상자·탐색·알림 상자",
  );
  remove(
    "figure,.thumb,.gallery,img,picture,video,audio,svg",
    "이미지·영상·그림 설명",
  );
  remove(
    "sup.reference,.mw-ref,.reflist,.references,.mw-editsection,.noprint",
    "각주·참고문헌 목록·편집 링크",
  );
  // Do not erase a formula inside a sentence and silently change its meaning.
  root
    .find("math,.mwe-math-element,.mwe-math-fallback-image-inline")
    .each((_, node) => {
      const owner = $(node).closest("p,li");
      if (owner.length) owner.remove();
      else $(node).remove();
      omissions.add("수식이 포함된 문단");
    });
  root.find("br").replaceWith("\n");
  const blocks: Article["blocks"] = [];
  let heading = "";
  root.find("h2,h3,h4,p,li").each((_, node) => {
    const element = $(node);
    const tag = node.tagName;
    if (tag === "p" && element.parents("li").length) return;
    const clone = element.clone();
    if (tag === "li") clone.children("ul,ol").remove();
    const text = clone
      .text()
      .replace(/\u00a0/g, " ")
      .normalize("NFC")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return;
    if (/^h[234]$/.test(tag)) {
      heading = text;
      return;
    }
    blocks.push({
      id: `block-${blocks.length + 1}`,
      heading,
      text,
      kind: tag === "li" ? "list_item" : "paragraph",
    });
    heading = "";
  });
  if (!blocks.length)
    throw new WikipediaError(
      "EMPTY_ARTICLE",
      "읽을 수 있는 본문이 없어요. 원문을 확인하거나 다른 글을 선택해 주세요.",
      422,
    );
  if (blocks.reduce((sum, b) => sum + b.text.length, 0) > 100000)
    throw new WikipediaError(
      "SOURCE_TOO_LARGE",
      "본문이 100,000자를 넘어요. 더 짧은 글을 선택해 주세요.",
      413,
    );
  return { blocks, omissions: [...omissions], extraNotices };
}
