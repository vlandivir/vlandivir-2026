-- CreateTable
CREATE TABLE "EmailSyncState" (
    "id" SERIAL NOT NULL,
    "account" TEXT NOT NULL,
    "mailbox" TEXT NOT NULL DEFAULT 'INBOX',
    "uidValidity" BIGINT NOT NULL,
    "lastUid" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailThread" (
    "id" SERIAL NOT NULL,
    "account" TEXT NOT NULL,
    "gmThreadId" TEXT NOT NULL,
    "subject" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" SERIAL NOT NULL,
    "account" TEXT NOT NULL,
    "gmMsgId" TEXT NOT NULL,
    "threadId" INTEGER NOT NULL,
    "uid" BIGINT NOT NULL,
    "mailbox" TEXT NOT NULL DEFAULT 'INBOX',
    "messageId" TEXT,
    "fromAddress" TEXT,
    "fromName" TEXT,
    "toAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ccAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT,
    "date" TIMESTAMP(3),
    "snippet" TEXT,
    "bodyText" TEXT,
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "seen" BOOLEAN NOT NULL DEFAULT false,
    "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "sizeBytes" INTEGER,
    "rawKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAttachment" (
    "id" SERIAL NOT NULL,
    "messageId" INTEGER NOT NULL,
    "filename" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "sha256" TEXT,
    "inline" BOOLEAN NOT NULL DEFAULT false,
    "storageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailSyncState_account_mailbox_key" ON "EmailSyncState"("account", "mailbox");

-- CreateIndex
CREATE UNIQUE INDEX "EmailThread_account_gmThreadId_key" ON "EmailThread"("account", "gmThreadId");

-- CreateIndex
CREATE INDEX "EmailMessage_status_idx" ON "EmailMessage"("status");

-- CreateIndex
CREATE INDEX "EmailMessage_threadId_idx" ON "EmailMessage"("threadId");

-- CreateIndex
CREATE INDEX "EmailMessage_date_idx" ON "EmailMessage"("date");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_account_gmMsgId_key" ON "EmailMessage"("account", "gmMsgId");

-- CreateIndex
CREATE INDEX "EmailAttachment_messageId_idx" ON "EmailAttachment"("messageId");

-- CreateIndex
CREATE INDEX "EmailAttachment_sha256_idx" ON "EmailAttachment"("sha256");

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EmailThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
