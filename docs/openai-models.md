# OpenAI models

Last reviewed: 13 September 2026.

The shared model identifiers live in
[`src/openai-models.ts`](../src/openai-models.ts). Use those constants instead
of adding model strings to application code. Threads AI actions are the
exception: their selected model is stored in `ThreadsAiAction` so it can be
changed from the browser, but the API only accepts models from the shared
catalog.

## Current choices

- **`gpt-5.6-sol` — high accuracy.** Image description, handwriting
  recognition/refinement and Threads fact-checking. Fact-checking uses the
  Responses API with required `web_search`, medium reasoning and visible
  clickable citations.
- **`gpt-5.6-terra` — balanced default.** Translations, reels title/vision/text
  cleanup, reels and diary RAG answers, email classification, Email → GTD and
  Threads spelling correction. This is the default for bounded user-facing
  text tasks.
- **`gpt-5.6-luna` — economical auxiliary model.** Third independent
  handwriting-recognition pass and an optional choice for simple custom
  Threads actions. Do not make it the default for fact-checking.
- **`whisper-1` — timestamped transcription.** Kept for Subs and reels because
  `verbose_json` and word/segment timestamp granularities are only supported
  by Whisper. Newer transcribe models can be more accurate but do not satisfy
  the current subtitle data contract.
- **`text-embedding-3-small` — semantic search.** Kept because the shared
  `Embedding` table is `vector(1536)`. Changing the model or dimensions
  requires an explicit migration and complete reindex, not a drive-by model
  update.

Official references:

- [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [Web search and citations](https://developers.openai.com/api/docs/guides/tools-web-search)
- [Speech-to-text timestamp support](https://developers.openai.com/api/docs/guides/speech-to-text)

## API conventions

- Existing single-turn text and vision calls use Chat Completions.
- Configurable Threads actions use the Responses API. `replace_text` actions
  use strict JSON Schema with `{ text, message }`; `analysis` actions return
  text plus URL annotations.
- GPT-5.6 uses reasoning effort `none`, `low`, `medium` or `high`. Do not copy
  the older `minimal` value into GPT-5.6 requests.
- Draft text is always a separate user input, not interpolated into the
  editable action prompt.
- When web search is enabled, the caller must use `tool_choice: "required"` and
  the UI must render inline URL citations as visible clickable links.

## Overrides

Some older services retain domain-specific environment overrides:

- `HANDWRITING_LLM_MODELS` — up to three comma-separated vision models.
- `DIARY_LLM_MODEL` — diary RAG answer model.
- `REELS_LLM_MODEL` — reels generation, vision and RAG model.
- `EMAIL_LLM_MODEL` — email classification and Email → GTD model.
- `EMBEDDING_MODEL` — embedding model; changing it may require a schema change
  and reindex.

These variables are optional. Production uses the source defaults unless a
variable is explicitly passed through the deploy workflow. A newly introduced
environment variable must be added to local `.env`, the deploy workflow and
GitHub secrets according to `AGENTS.md`.

## Verification record

On 13 September 2026 the current OpenAI account returned HTTP 200 for Sol,
Terra and Luna. A live mixed RU/SR/EN spelling sample on Terra corrected only
the deliberately misspelled words, and a Sol fact-check used web search,
rejected a false population claim and returned an inline citation.

When changing defaults, repeat a small task-specific evaluation rather than
assuming that a newer or larger model is automatically better. At minimum test
mixed-language spelling preservation, fact-check citations, image input and
the structured-output parsers affected by the change.
