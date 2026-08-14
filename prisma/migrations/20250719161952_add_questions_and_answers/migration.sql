-- CreateTable
CREATE TABLE "Question" (
    "id" SERIAL NOT NULL,
    "chatId" BIGINT NOT NULL,
    "questionText" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" SERIAL NOT NULL,
    "questionId" INTEGER NOT NULL,
    "textAnswer" TEXT,
    "numberAnswer" DOUBLE PRECISION,
    "answerDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Question_chatId_idx" ON "Question"("chatId");

-- CreateIndex
CREATE INDEX "Question_createdAt_idx" ON "Question"("createdAt");

-- CreateIndex
CREATE INDEX "Answer_questionId_idx" ON "Answer"("questionId");

-- CreateIndex
CREATE INDEX "Answer_answerDate_idx" ON "Answer"("answerDate");

-- CreateIndex
CREATE INDEX "Answer_createdAt_idx" ON "Answer"("createdAt");

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
