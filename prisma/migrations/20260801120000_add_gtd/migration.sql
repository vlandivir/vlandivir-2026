-- CreateEnum
CREATE TYPE "GtdIdentityProvider" AS ENUM ('GOOGLE', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "GtdTaskStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "GtdTaskEventType" AS ENUM ('CREATED', 'UPDATED', 'PROJECT_CHANGED', 'SNOOZED', 'ROTATED', 'COMPLETED', 'CANCELED', 'ATTACHMENT_ADDED');

-- CreateTable
CREATE TABLE "GtdWorkspace" (
    "id" TEXT NOT NULL,
    "nextOrder" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GtdWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtdIdentity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" "GtdIdentityProvider" NOT NULL,
    "providerId" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GtdIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtdLinkRequest" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "telegramIdentityId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GtdLinkRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtdProject" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GtdProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtdTask" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "content" TEXT NOT NULL,
    "status" "GtdTaskStatus" NOT NULL DEFAULT 'ACTIVE',
    "orderKey" BIGINT NOT NULL,
    "snoozedUntil" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GtdTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtdTaskEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "type" "GtdTaskEventType" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GtdTaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtdAttachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GtdAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GtdIdentity_provider_providerId_key" ON "GtdIdentity"("provider", "providerId");
CREATE UNIQUE INDEX "GtdIdentity_workspaceId_provider_key" ON "GtdIdentity"("workspaceId", "provider");
CREATE INDEX "GtdIdentity_workspaceId_idx" ON "GtdIdentity"("workspaceId");
CREATE UNIQUE INDEX "GtdLinkRequest_tokenHash_key" ON "GtdLinkRequest"("tokenHash");
CREATE INDEX "GtdLinkRequest_telegramIdentityId_idx" ON "GtdLinkRequest"("telegramIdentityId");
CREATE INDEX "GtdLinkRequest_expiresAt_idx" ON "GtdLinkRequest"("expiresAt");
CREATE INDEX "GtdProject_workspaceId_archivedAt_idx" ON "GtdProject"("workspaceId", "archivedAt");
CREATE INDEX "GtdTask_workspaceId_status_snoozedUntil_orderKey_idx" ON "GtdTask"("workspaceId", "status", "snoozedUntil", "orderKey");
CREATE INDEX "GtdTask_workspaceId_projectId_status_orderKey_idx" ON "GtdTask"("workspaceId", "projectId", "status", "orderKey");
CREATE INDEX "GtdTask_workspaceId_createdAt_idx" ON "GtdTask"("workspaceId", "createdAt");
CREATE INDEX "GtdTaskEvent_taskId_createdAt_idx" ON "GtdTaskEvent"("taskId", "createdAt");
CREATE UNIQUE INDEX "GtdAttachment_storageKey_key" ON "GtdAttachment"("storageKey");
CREATE INDEX "GtdAttachment_taskId_createdAt_idx" ON "GtdAttachment"("taskId", "createdAt");

ALTER TABLE "GtdIdentity" ADD CONSTRAINT "GtdIdentity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "GtdWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GtdLinkRequest" ADD CONSTRAINT "GtdLinkRequest_telegramIdentityId_fkey" FOREIGN KEY ("telegramIdentityId") REFERENCES "GtdIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GtdProject" ADD CONSTRAINT "GtdProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "GtdWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GtdTask" ADD CONSTRAINT "GtdTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "GtdWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GtdTask" ADD CONSTRAINT "GtdTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "GtdProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GtdTaskEvent" ADD CONSTRAINT "GtdTaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "GtdTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GtdAttachment" ADD CONSTRAINT "GtdAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "GtdTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
