export const OPENAI_MODELS = {
  highAccuracy: 'gpt-5.6-sol',
  balanced: 'gpt-5.6-terra',
  economical: 'gpt-5.6-luna',
  timestampedTranscription: 'whisper-1',
  embeddings: 'text-embedding-3-small',
} as const;

export const THREADS_AI_MODELS = [
  OPENAI_MODELS.highAccuracy,
  OPENAI_MODELS.balanced,
  OPENAI_MODELS.economical,
] as const;

export type ThreadsAiModel = (typeof THREADS_AI_MODELS)[number];

export const REASONING_EFFORTS = ['none', 'low', 'medium', 'high'] as const;

export type OpenAiReasoningEffort = (typeof REASONING_EFFORTS)[number];
