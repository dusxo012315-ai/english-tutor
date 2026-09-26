# Archived Integrated Tutor browser tests

`integrated-tutor.spec.ts` documents the previous in-app API UI. It is not included in any current Playwright configuration. The original server adapter (`src/server/adapters/openai.ts`) and offline contract tests (`tests/tutor.test.ts`) remain available for a future server-side OpenAIProvider.

The paid smoke test (`tests/tutor.live.test.ts`) is outside the normal test suite and is disabled unless `ENABLE_ARCHIVED_OPENAI_TESTS=true` is explicitly set. Current Companion acceptance tests never call OpenAI or send a message to ChatGPT.
