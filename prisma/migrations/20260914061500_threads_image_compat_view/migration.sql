-- Keep the currently deployed Prisma client working between migrate deploy
-- and deployment of the ThreadsMedia-aware application.
CREATE VIEW "ThreadsImage" AS
SELECT
  "id",
  "postId",
  "url",
  "key",
  "sortOrder",
  "createdAt"
FROM "ThreadsMedia"
WHERE "kind" = 'image';
