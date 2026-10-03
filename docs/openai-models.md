# OpenAI models

Last reviewed: 13 September 2026.

The shared model identifiers live in
[`src/openai-models.ts`](../src/openai-models.ts). Use those constants instead
of adding model strings to application code. Former Threads AI button settings
remain archived in `ThreadsAiAction`; this app no longer runs those actions.

## Current choices

- **`gpt-5.6-sol` — high accuracy.** Image description and handwriting
  recognition/refinement.
- **`gpt-5.6-terra` — balanced default.** Translations, reels title/vision/text
  cleanup, reels and diary RAG answers, email classification and Email → GTD.
  This is the default for bounded user-facing text tasks.
- **`gpt-5.6-luna` — economical auxiliary model.** Third independent
  handwriting-recognition pass.
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
- GPT-5.6 uses reasoning effort `none`, `low`, `medium` or `high`. Do not copy
  the older `minimal` value into GPT-5.6 requests.

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
Terra and Luna. The former Threads AI buttons passed live spelling and
fact-check samples before their removal. Those samples are historical evidence,
not active behavior in this app.

When changing defaults, repeat a small task-specific evaluation rather than
assuming that a newer or larger model is automatically better. Test the inputs
and structured-output parsers affected by the change.
