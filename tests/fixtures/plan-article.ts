import type { Article } from "../../src/domain/types";
// Synthetic offline fixture: never fetched from or written to a user database.
export const planArticle: Article = {
  id: "plan-test-wiki",
  title: "Plan test mountains",
  provider: "simple_wikipedia",
  topic: "Offline test",
  description: "Synthetic print fixture",
  notice: "Synthetic test content, not a Wikipedia extract.",
  sourceUrl: "https://simple.wikipedia.org/wiki/Himalayas",
  pageId: 123,
  revisionId: 456,
  blocks: [
    {
      id: "test-p1",
      heading: "Mountains",
      text: "Mountains are high. People can learn about mountains.",
    },
  ],
  attribution: {
    creatorLabel: "Wikipedia contributors (test fixture)",
    historyUrl:
      "https://simple.wikipedia.org/w/index.php?title=Himalayas&action=history",
    revisionUrl: "https://simple.wikipedia.org/w/index.php?oldid=456",
    licenseName: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    changes: ["Plain text extraction"],
    extraNotices: ["Offline fixture"],
  },
  omissions: ["Tables and images omitted"],
};
