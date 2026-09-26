import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { WikipediaProvider } from "../src/server/wikipedia/provider";
import { buildTutorContext } from "../src/domain/selection";
import { setTimeout as delay } from "node:timers/promises";
for (const title of ["Himalayas", "Physics", "Albert Einstein"])
  test(`LIVE MediaWiki: ${title}`, { timeout: 90000 }, async () => {
    // Four calls per document (title + URL); pace the test, never retry a 429.
    await delay(32000);
    const provider = new WikipediaProvider();
    const article = await provider.resolve(title);
    assert.ok(!Array.isArray(article));
    assert.equal(article.title, title);
    assert.ok(article.blocks.length > 5);
    assert.ok(article.blocks.reduce((n, b) => n + b.text.length, 0) > 1000);
    assert.ok(article.attribution?.creatorLabel.includes("contributors"));
    assert.ok(article.attribution?.licenseName.includes("4.0"));
    const byUrl = await provider.resolve(article.sourceUrl);
    assert.ok(!Array.isArray(byUrl));
    assert.equal(byUrl.pageId, article.pageId);
    assert.equal(byUrl.id, article.id);
    const block =
      article.blocks.find((b) => b.text.includes(". ")) ?? article.blocks[0];
    const sentence =
      block.text.split(". ")[0] + (block.text.includes(". ") ? "." : "");
    const context = buildTutorContext(article, block.id, 0, sentence.length);
    assert.equal(context.selection.quote, sentence);
    assert.equal(
      context.context.find((c) => c.blockId === block.id)?.text,
      block.text,
    );
    mkdirSync("artifacts/wikipedia", { recursive: true });
    writeFileSync(
      `artifacts/wikipedia/${title.replace(/ /g, "-")}.json`,
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          title,
          pageId: article.pageId,
          revisionId: article.revisionId,
          blocks: article.blocks.length,
          characters: article.blocks.reduce((n, b) => n + b.text.length, 0),
          omissions: article.omissions,
          attribution: article.attribution,
          sourceUrl: article.sourceUrl,
          selectedSentence: context.selection.quote,
          originalContext: context.context,
          selectionMatches: true,
          titleUrlSameSnapshot: true,
        },
        null,
        2,
      ),
    );
    console.log(
      `${title}: ${article.blocks.length} blocks, revision ${article.revisionId}, exact sentence/context verified`,
    );
  });
