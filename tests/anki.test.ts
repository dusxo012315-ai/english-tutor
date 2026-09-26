import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { SqliteRepository } from "../src/data/repository";
import {
  emptyCandidateFields,
  normalizeExpression,
  findDuplicates,
  renderCandidate,
  candidateTsv,
  transitionCandidate,
  candidateFields,
  type AnkiCandidate,
  type CandidateFields,
} from "../src/domain/anki";
const fields = (expression = "be able to"): CandidateFields => ({
  ...emptyCandidateFields(),
  expression,
});
const create = async (
  r: SqliteRepository,
  sessionId: string | null,
  expression = "be able to",
) =>
  await r.execute({
    type: "createCandidate",
    requestId: crypto.randomUUID(),
    sessionId,
    fields: fields(expression),
    allowDuplicate: false,
  });
const get = async (r: SqliteRepository, id: string) =>
  (await r.getState()).ankiCandidates.find((c) => c.id === id)!;
const values = (c: AnkiCandidate): CandidateFields =>
  Object.fromEntries(
    Object.keys(emptyCandidateFields()).map((k) => [
      k,
      c[k as keyof CandidateFields],
    ]),
  ) as CandidateFields;
async function ready(r: SqliteRepository, id: string) {
  const c = await get(r, id);
  await r.execute({
    type: "updateCandidate",
    candidateId: id,
    expectedVersion: c.version,
    fields: { ...values(c), meaning: "할 수 있다" },
    status: "READY",
    allowDuplicate: true,
  });
  return await get(r, id);
}
test("AnkiCandidate creation trusts session type, supports Reading Listening Manual and Quick Add", async () => {
  const r = new SqliteRepository(":memory:");
  try {
    const reading = (await r.execute({ type: "start", articleId: "bird" })).id!;
    const listening = (
      await r.execute({
        type: "startListening",
        sourceUrl: "https://breakingnewsenglish.com/2609/260925-test.html",
        userProvidedTitle: "My lesson",
        level: "2",
      })
    ).id!;
    for (const [session, type] of [
      [reading, "READING"],
      [listening, "LISTENING"],
      [null, "MANUAL"],
    ] as const) {
      const result = await create(r, session, `${type} expression`);
      const c = await get(r, result.id!);
      assert.equal(c.sourceType, type);
      assert.equal(c.sourceSessionId, session);
      assert.equal(c.status, "CANDIDATE");
      assert.equal(c.meaning, "");
      assert.equal(c.exportedAt, null);
      assert.equal(c.version, 1);
    }
    await assert.rejects(async () => await create(r, "missing"), /세션/);
  } finally {
    await r.close();
  }
});
test("normalized duplicate detection includes legacy cards; warning does not create and Save anyway does", async () => {
  assert.equal(normalizeExpression(" Be   Able To "), "be able to");
  const r = new SqliteRepository(":memory:");
  try {
    const a = await create(r, null, "Be Able To");
    const b = await create(r, null, " be   able to ");
    assert.deepEqual(b.duplicateIds, [a.id]);
    assert.equal(
      findDuplicates((await r.getState()).ankiCandidates, "BE ABLE TO").length,
      1,
    );
    const action = {
      type: "createCandidate" as const,
      requestId: crypto.randomUUID(),
      sessionId: null,
      fields: fields("be able to"),
      allowDuplicate: true,
    };
    const saved = await r.execute(action);
    assert.ok(saved.id);
    await r.execute(action);
    assert.equal(
      findDuplicates((await r.getState()).ankiCandidates, "be able to").length,
      2,
    );
    const legacy = (await r.getState()).ankiCandidates.find(
      (c) => c.legacyCardId,
    )!;
    assert.ok(
      (await create(r, null, legacy.expression)).duplicateIds?.includes(
        legacy.id,
      ),
    );
  } finally {
    await r.close();
  }
});
test("Vocabulary and Sentence templates, editable overrides and attribution preview", () => {
  const c = {
    ...fields(),
    meaning: "할 수 있다",
    explanation: "다양한 시제",
    exampleSentence: "I will be able to swim.",
    attribution: "Wikipedia authors · CC BY-SA",
  };
  assert.equal(renderCandidate(c).front, "be able to");
  assert.match(renderCandidate(c).back, /Example:\nI will/);
  assert.equal(
    renderCandidate({ ...c, cardType: "SENTENCE" }).front,
    c.exampleSentence,
  );
  assert.match(
    renderCandidate({ ...c, cardType: "SENTENCE" }).back,
    /Key expression:\nbe able to/,
  );
  const custom = renderCandidate({
    ...c,
    frontOverride: "직접 앞면",
    backOverride: "직접 뒷면",
  });
  assert.equal(custom.front, "직접 앞면");
  assert.match(custom.back, /직접 뒷면[\s\S]*CC BY-SA/);
});
test("short expression, URL, deck and tag validation block long raw text and header injection", () => {
  assert.equal(
    candidateFields.safeParse(fields("word ".repeat(11))).success,
    false,
  );
  assert.equal(candidateFields.safeParse(fields("line\nline")).success, false);
  assert.equal(
    candidateFields.safeParse({ ...fields(), sourceUrl: "javascript:alert(1)" })
      .success,
    false,
  );
  assert.equal(
    candidateFields.safeParse({ ...fields(), targetDeck: "Deck\n#html:false" })
      .success,
    false,
  );
  assert.equal(
    candidateFields.safeParse({ ...fields(), tags: ["two words"] }).success,
    false,
  );
});
test("status transitions validate readiness, archive, optimistic version conflict and export atomically", async () => {
  const r = new SqliteRepository(":memory:");
  try {
    const id = (await create(r, null)).id!;
    const c = await get(r, id);
    assert.throws(() => transitionCandidate(c, "READY"), /뜻/);
    assert.throws(() => candidateTsv([c]), /Ready/);
    const complete = await ready(r, id);
    await assert.rejects(
      async () =>
        await r.execute({
          type: "updateCandidate",
          candidateId: id,
          expectedVersion: c.version,
          fields: values(complete),
          status: "READY",
          allowDuplicate: true,
        }),
      /변경/,
    );
    const bad = (await create(r, null, "incomplete")).id!;
    await assert.rejects(
      async () =>
        await r.execute({
          type: "exportCandidates",
          requestId: crypto.randomUUID(),
          candidates: [
            { id, version: complete.version },
            { id: bad, version: (await get(r, bad)).version },
          ],
          allowReexport: false,
        }),
      /Ready/,
    );
    assert.equal((await get(r, id)).status, "READY");
    const request = {
      type: "exportCandidates" as const,
      requestId: crypto.randomUUID(),
      candidates: [{ id, version: complete.version }],
      allowReexport: false,
    };
    const result = await r.execute(request);
    assert.ok(result.tsv);
    assert.equal((await get(r, id)).status, "EXPORTED");
    assert.ok((await get(r, id)).exportedAt);
    assert.equal((await r.execute(request)).tsv, result.tsv);
    assert.equal((await r.getState()).candidateExports.length, 1);
    await assert.rejects(
      async () =>
        await r.execute({
          ...request,
          requestId: crypto.randomUUID(),
          candidates: [{ id, version: (await get(r, id)).version }],
        }),
      /already been exported/,
    );
    await r.execute({
      ...request,
      requestId: crypto.randomUUID(),
      candidates: [{ id, version: (await get(r, id)).version }],
      allowReexport: true,
    });
    assert.equal((await r.getState()).candidateExports.length, 2);
    const exported = await get(r, id);
    await r.execute({
      type: "updateCandidate",
      candidateId: id,
      expectedVersion: exported.version,
      fields: values(exported),
      status: "ARCHIVED",
      allowDuplicate: true,
    });
    assert.equal((await get(r, id)).status, "ARCHIVED");
  } finally {
    await r.close();
  }
});
test("deck presets persist, multiple deck exports reject, saved content survives restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "anki-restart-"));
  const path = join(dir, "db");
  let r = new SqliteRepository(path, undefined, true);
  try {
    await r.execute({
      type: "deckPresets",
      decks: ["My English", "My Sentences"],
    });
    const a = await ready(r, (await create(r, null, "first phrase")).id!);
    const b = await ready(r, (await create(r, null, "second phrase")).id!);
    await r.execute({
      type: "updateCandidate",
      candidateId: b.id,
      expectedVersion: b.version,
      fields: { ...values(b), targetDeck: "My Sentences" },
      status: "READY",
      allowDuplicate: true,
    });
    await assert.rejects(
      async () => candidateTsv([a, await get(r, b.id)]),
      /하나/,
    );
    await r.close();
    r = new SqliteRepository(path, undefined, true);
    assert.deepEqual((await r.getState()).deckPresets, [
      "My English",
      "My Sentences",
    ]);
    assert.equal((await get(r, b.id)).targetDeck, "My Sentences");
  } finally {
    await r.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("at least 10 sample cards produce UTF-8 TSV with 3 consistent fields and escaped HTML/newlines", async () => {
  const r = new SqliteRepository(":memory:");
  try {
    const expressions = [
      "couldn't believe",
      "be able to",
      "connected speech",
      "tectonic plate",
      "A & B",
      "<strong>word</strong>",
      "café",
      "한글 표현",
      'say "hello"',
      "go → went",
    ];
    const cards = await Promise.all(
      expressions.map(async (expression, i) => {
        const id = (await create(r, null, expression)).id!;
        const c = await get(r, id);
        await r.execute({
          type: "updateCandidate",
          candidateId: id,
          expectedVersion: c.version,
          fields: {
            ...values(c),
            meaning: "한글 뜻\t탭\r\n새 줄",
            explanation: "특수문자 < > & \" apostrophe' 😀",
            exampleSentence: `Example ${i}.\nA second line.`,
            tags: ["english", "학습"],
          },
          status: "READY",
          allowDuplicate: true,
        });
        return await get(r, id);
      }),
    );
    const tsv = candidateTsv(cards);
    mkdirSync("artifacts/anki", { recursive: true });
    writeFileSync("artifacts/anki/sample-10-cards.tsv", tsv, "utf8");
    const bytes = readFileSync("artifacts/anki/sample-10-cards.tsv");
    assert.equal(new TextDecoder("utf-8", { fatal: true }).decode(bytes), tsv);
    const rows = tsv
      .trimEnd()
      .split("\n")
      .filter((l) => !l.startsWith("#"));
    assert.equal(rows.length, 10);
    rows.forEach((row) => {
      assert.equal(row.split("\t").length, 3);
      assert.equal(row.includes("\r"), false);
    });
    assert.match(tsv, /#columns:Front\tBack\tTags/);
    assert.match(tsv, /한글 뜻 탭<br>새 줄/);
    assert.match(tsv, /couldn&#39;t believe/);
    assert.match(tsv, /&lt;strong&gt;/);
    assert.match(tsv, /&amp;/);
    assert.match(tsv, /😀/);
  } finally {
    await r.close();
  }
});
test("actual v2 migration preserves original cards and imports exactly once, old edits sync until candidate is edited", async () => {
  const dir = mkdtempSync(join(tmpdir(), "anki-v2-"));
  const folder = join(dir, "migrations");
  mkdirSync(join(folder, "meta"), { recursive: true });
  const journal = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8"),
  );
  journal.entries = journal.entries.slice(0, 2);
  writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify(journal));
  for (const e of journal.entries)
    writeFileSync(
      join(folder, e.tag + ".sql"),
      readFileSync("drizzle/" + e.tag + ".sql"),
    );
  const path = join(dir, "db");
  const db = new Database(path);
  migrate(drizzle(db), { migrationsFolder: folder });
  const seed = new SqliteRepository(":memory:");
  const before = await seed.getState();
  await seed.close();
  db.prepare("INSERT INTO preferences VALUES (?,?)").run("local", 21);
  for (const a of before.articles)
    db.prepare("INSERT INTO snapshots VALUES (?,?)").run(
      a.id,
      JSON.stringify(a),
    );
  for (const s of before.sessions)
    db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
      s.id,
      s.articleId,
      JSON.stringify(s),
    );
  for (const i of before.items)
    db.prepare("INSERT INTO learning_items VALUES (?,?,?)").run(
      i.id,
      i.sessionId,
      JSON.stringify(i),
    );
  for (const c of before.cards)
    db.prepare("INSERT INTO cards VALUES (?,?,?)").run(
      c.id,
      c.itemId,
      JSON.stringify(c),
    );
  for (const s of before.learningSessions)
    db.prepare("INSERT INTO learning_sessions VALUES (?,?,?)").run(
      s.id,
      s.type,
      JSON.stringify(s),
    );
  await db.close();
  let r = new SqliteRepository(path, undefined, true);
  try {
    const old = structuredClone((await r.getState()).cards);
    const c = (await r.getState()).ankiCandidates.find(
      (c) => c.legacyCardId === old[0].id,
    )!;
    assert.equal(c.frontOverride, old[0].front);
    assert.equal(c.backOverride, old[0].back);
    assert.equal(c.attribution, old[0].attribution);
    const count = (await r.getState()).ankiCandidates.length;
    await r.close();
    r = new SqliteRepository(path, undefined, true);
    assert.equal((await r.getState()).ankiCandidates.length, count);
    assert.deepEqual((await r.getState()).cards, old);
    assert.equal((await get(r, c.id)).version, c.version);
    const original = old[0];
    await r.execute({
      type: "card",
      cardId: original.id,
      front: "Updated original",
      back: original.back,
      direction: original.direction,
      confirm: false,
      expectedVersion: original.version,
    });
    assert.equal((await get(r, c.id)).frontOverride, "Updated original");
    const migrated = await get(r, c.id);
    await r.execute({
      type: "updateCandidate",
      candidateId: c.id,
      expectedVersion: migrated.version,
      fields: {
        ...values(migrated),
        expression: "short expression",
        frontOverride: "Candidate edition",
      },
      status: "CANDIDATE",
      allowDuplicate: true,
    });
    await r.getState();
    assert.equal((await get(r, c.id)).frontOverride, "Candidate edition");
    assert.equal(
      (await r.getState()).cards.find((v) => v.id === original.id)?.front,
      "Updated original",
    );
  } finally {
    await r.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
