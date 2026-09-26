import { test } from "node:test";
import assert from "node:assert/strict";
import { MockWikipediaProvider, parseTitle } from "../src/server/adapters/mock";
import { actionSchema } from "../src/domain/schemas";
import { serializeTsv } from "../src/domain/tsv";
import type { Card } from "../src/domain/types";
test("Wikipedia title and mobile URL resolve to the same mock material", () => {
  const provider = new MockWikipediaProvider();
  assert.deepEqual(
    provider.resolve("Himalayas"),
    provider.resolve("https://simple.m.wikipedia.org/wiki/Himalayas#Life"),
  );
  assert.deepEqual(provider.resolve("not a sample"), []);
});
test("unsupported URLs cannot become titles or trigger network requests", () => {
  for (const input of [
    "https://example.org/wiki/Bird",
    "http://simple.wikipedia.org/wiki/Bird",
    "https://simple.wikipedia.org:8080/wiki/Bird",
    "https://user@simple.wikipedia.org/wiki/Bird",
    "https://simple.wikipedia.org/wiki/Bird?x=1",
    "https://simple.wikipedia.org/wiki/%ZZ",
    "https://simple.wikipedia.org/wiki/Special:Random",
  ])
    assert.throws(() => parseTitle(input));
});
test("action schema rejects oversized guesses and invalid quiz options", () => {
  assert.equal(
    actionSchema.safeParse({
      type: "draft",
      itemId: "id",
      questionType: "meaning",
      question: "뜻?",
      guess: "가".repeat(1001),
      production: "",
    }).success,
    false,
  );
  assert.equal(
    actionSchema.safeParse({ type: "attempt", itemId: "id", selectedId: "d" })
      .success,
    false,
  );
  assert.equal(
    actionSchema.safeParse({ type: "attempt", itemId: "id", selectedId: null })
      .success,
    true,
  );
});
test("TSV has exactly three fields and safely escapes multiline Unicode content", () => {
  const card: Card = {
    id: "1",
    itemId: "i",
    sessionId: "s",
    expression: "x",
    meaning: "뜻",
    front: '한글\t"<>&\r\n😀',
    back: "test's",
    direction: "recognition",
    status: "confirmed",
    blocked: false,
    version: 1,
    exportedAt: null,
    attribution: "창작 Mock CC0",
  };
  const output = serializeTsv([card]);
  const lines = output.trimEnd().split("\n");
  assert.equal(lines.length, 4);
  assert.equal(lines[3].split("\t").length, 3);
  assert.ok(output.includes("&lt;&gt;&amp;<br>😀"));
  assert.ok(output.includes("CC0"));
  assert.equal(output.charCodeAt(0), 35);
  assert.throws(() => serializeTsv([{ ...card, status: "draft" }]));
  assert.throws(() => serializeTsv([{ ...card, blocked: true }]));
  assert.throws(() => serializeTsv([]));
});
