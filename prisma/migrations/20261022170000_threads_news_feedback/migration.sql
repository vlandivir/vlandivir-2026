-- Store explicit owner feedback without changing existing posts or collection.
ALTER TABLE "ThreadsNewsPost" ADD COLUMN "feedback" TEXT;
ALTER TABLE "ThreadsNewsPost" ADD COLUMN "feedbackAt" TIMESTAMP(3);
ALTER TABLE "ThreadsNewsPost" ADD CONSTRAINT "ThreadsNewsPost_feedback_check"
CHECK ("feedback" IN ('interesting', 'uninteresting'));

CREATE INDEX "ThreadsNewsPost_feedback_publishedAt_id_idx"
ON "ThreadsNewsPost"("feedback", "publishedAt", "id");
