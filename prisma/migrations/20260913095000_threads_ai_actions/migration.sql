-- CreateTable
CREATE TABLE "ThreadsAiAction" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "responseMode" TEXT NOT NULL DEFAULT 'analysis',
    "model" TEXT NOT NULL DEFAULT 'gpt-5.6-terra',
    "reasoningEffort" TEXT NOT NULL DEFAULT 'none',
    "webSearch" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThreadsAiAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ThreadsAiAction_enabled_sortOrder_idx" ON "ThreadsAiAction"("enabled", "sortOrder");

-- Seed the initial composer actions. These rows remain fully editable.
INSERT INTO "ThreadsAiAction"
    ("label", "prompt", "responseMode", "model", "reasoningEffort", "webSearch", "enabled", "sortOrder", "updatedAt")
VALUES
    (
        'Исправить орфографию',
        'Проверь текст, в котором могут одновременно встречаться русский, сербский и английский языки. Исправь только опечатки и орфографические ошибки на языке каждого фрагмента. Сербский текст может быть написан латиницей или кириллицей. Не меняй лексику, смысл, стиль, грамматику, пунктуацию, регистр, переносы строк и форматирование. Всё, что относится не к орфографии, не исправляй, а при необходимости перечисли в рекомендациях. Если орфографических ошибок нет, верни исходный текст без изменений.',
        'replace_text',
        'gpt-5.6-terra',
        'none',
        false,
        true,
        10,
        CURRENT_TIMESTAMP
    ),
    (
        'Проверить факты',
        'Найди в тексте проверяемые фактические утверждения и проверь их по актуальным надёжным источникам в интернете. Для каждого существенного утверждения дай краткий вердикт и объяснение. Явно отделяй подтверждённые факты, ошибки, спорные или непроверяемые утверждения. Не оценивай мнение, стиль и художественные формулировки как фактические ошибки. Отвечай на языке, который преобладает в исходном тексте.',
        'analysis',
        'gpt-5.6-sol',
        'medium',
        true,
        true,
        20,
        CURRENT_TIMESTAMP
    );
