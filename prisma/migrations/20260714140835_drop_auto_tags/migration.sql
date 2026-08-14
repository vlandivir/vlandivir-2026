-- Reels no longer have (auto-generated) tags
ALTER TABLE "Reel" DROP COLUMN "tags";

-- Drop dictionary tags that are not used by any map point or track
-- (they were auto-created while tagging reels)
DELETE FROM "MapTag"
WHERE "name" NOT IN (
  SELECT unnest("tags") FROM "MapPoint"
  UNION
  SELECT unnest("tags") FROM "MapTrack"
);
