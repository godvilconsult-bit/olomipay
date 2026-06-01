-- ============================================================
-- Safe full-schema migration — all statements are idempotent
-- (IF NOT EXISTS / ADD VALUE IF NOT EXISTS) so this is safe
-- to run against databases that already have partial schemas.
-- ============================================================

-- ── Extend existing enums safely ────────────────────────────
ALTER TYPE "KycStatus"  ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE "TxType"     ADD VALUE IF NOT EXISTS 'SAVINGS_DEPOSIT';
ALTER TYPE "TxType"     ADD VALUE IF NOT EXISTS 'SAVINGS_WITHDRAW';
ALTER TYPE "TxType"     ADD VALUE IF NOT EXISTS 'BILL_PAYMENT';
ALTER TYPE "TxType"     ADD VALUE IF NOT EXISTS 'BANK_WITHDRAWAL';
ALTER TYPE "TxStatus"   ADD VALUE IF NOT EXISTS 'EXPIRED';

-- ── New enums ────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "Frequency"     AS ENUM ('DAILY','WEEKLY','BIWEEKLY','MONTHLY');             EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ClaimStatus"   AS ENUM ('PENDING','CLAIMED','EXPIRED','RETURNED');          EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "StakeStatus"   AS ENUM ('ACTIVE','UNLOCKED','WITHDRAWN');                  EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ConvType"      AS ENUM ('DIRECT','GROUP');                                 EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "MessageType"   AS ENUM ('TEXT','PAYMENT','PAYMENT_REQUEST','IMAGE','SYSTEM'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PaymentStatus" AS ENUM ('PENDING','CONFIRMED','FAILED','EXPIRED');          EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ChamaStatus"   AS ENUM ('FORMING','ACTIVE','COMPLETED','PAUSED');           EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "LoanStatus"    AS ENUM ('OPEN','FUNDED','REPAID','DEFAULTED');              EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "RewardTier"    AS ENUM ('BRONZE','SILVER','GOLD','PLATINUM');               EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "BusinessPlan"  AS ENUM ('STARTER','PROFESSIONAL','ENTERPRISE');             EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "BondStatus"    AS ENUM ('OPEN','CLOSED','MATURED','REDEEMED');              EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "Country"       AS ENUM ('TZ','KE','UG','RW','ZM');                          EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── User — add missing columns ───────────────────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "country"          TEXT NOT NULL DEFAULT 'TZ';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "chatPublicKey"    TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "chatSecretKeyEnc" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isOnline"         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenAt"       TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profilePicUrl"    TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isAdmin"          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isFeeCollector"   BOOLEAN NOT NULL DEFAULT false;

-- ── ExchangeRateCache ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ExchangeRateCache" (
  "id"        TEXT NOT NULL DEFAULT 'singleton',
  "usdToTzs"  DOUBLE PRECISION NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExchangeRateCache_pkey" PRIMARY KEY ("id")
);

-- ── BankAccount ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "BankAccount" (
  "id"            TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "bankName"      TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "swiftCode"     TEXT NOT NULL,
  "accountName"   TEXT NOT NULL,
  "isVerified"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BankAccount_userId_idx" ON "BankAccount"("userId");

-- ── SavingsPosition ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SavingsPosition" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "principal"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "yieldEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "depositedAt" TIMESTAMP(3),
  "lastYieldAt" TIMESTAMP(3),
  CONSTRAINT "SavingsPosition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SavingsPosition_userId_key" ON "SavingsPosition"("userId");

-- ── BillPayment ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "BillPayment" (
  "id"            TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "billerName"    TEXT NOT NULL,
  "billerCode"    TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "amountTzs"     DOUBLE PRECISION NOT NULL,
  "amountUsdc"    DOUBLE PRECISION NOT NULL,
  "reference"     TEXT,
  "token"         TEXT,
  "status"        TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillPayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BillPayment_userId_idx" ON "BillPayment"("userId");

-- ── PendingClaim ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PendingClaim" (
  "id"         TEXT NOT NULL,
  "senderId"   TEXT NOT NULL,
  "toPhone"    TEXT NOT NULL,
  "claimToken" TEXT NOT NULL,
  "amountUsdc" DOUBLE PRECISION NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "claimedAt"  TIMESTAMP(3),
  "status"     TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PendingClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PendingClaim_claimToken_key" ON "PendingClaim"("claimToken");
CREATE INDEX IF NOT EXISTS "PendingClaim_claimToken_idx"        ON "PendingClaim"("claimToken");
CREATE INDEX IF NOT EXISTS "PendingClaim_toPhone_idx"           ON "PendingClaim"("toPhone");

-- ── ScheduledPayment ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ScheduledPayment" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "toAddress"      TEXT NOT NULL,
  "toPhone"        TEXT,
  "toName"         TEXT,
  "amount"         DOUBLE PRECISION NOT NULL,
  "asset"          TEXT NOT NULL DEFAULT 'USDC',
  "frequency"      TEXT NOT NULL,
  "nextRunAt"      TIMESTAMP(3) NOT NULL,
  "endDate"        TIMESTAMP(3),
  "memo"           TEXT,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "executionCount" INTEGER NOT NULL DEFAULT 0,
  "lastRunAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScheduledPayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ScheduledPayment_userId_idx"            ON "ScheduledPayment"("userId");
CREATE INDEX IF NOT EXISTS "ScheduledPayment_nextRunAt_isActive_idx" ON "ScheduledPayment"("nextRunAt","isActive");

-- ── PushSubscription ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PushSubscription" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "endpoint"  TEXT NOT NULL,
  "p256dhKey" TEXT NOT NULL,
  "authKey"   TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx"          ON "PushSubscription"("userId");

-- ── Notification ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Notification" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "isRead"    BOOLEAN NOT NULL DEFAULT false,
  "data"      JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx"  ON "Notification"("userId","isRead");
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId","createdAt");

-- ── RateHistory ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RateHistory" (
  "id"        TEXT NOT NULL,
  "usdToTzs"  DOUBLE PRECISION NOT NULL,
  "date"      TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RateHistory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RateHistory_date_key" ON "RateHistory"("date");

-- ── StakePosition ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "StakePosition" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "amountUsdc"   DOUBLE PRECISION NOT NULL,
  "lockDays"     INTEGER NOT NULL,
  "apyBps"       INTEGER NOT NULL,
  "stakedAt"     TIMESTAMP(3) NOT NULL,
  "unlockAt"     TIMESTAMP(3) NOT NULL,
  "yieldClaimed" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "contractKey"  TEXT,
  "status"       TEXT NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT "StakePosition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StakePosition_userId_key" ON "StakePosition"("userId");

-- ── Chama ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Chama" (
  "id"               TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "contractId"       TEXT,
  "adminId"          TEXT NOT NULL,
  "contributionUsdc" DOUBLE PRECISION NOT NULL,
  "frequencyDays"    INTEGER NOT NULL,
  "currentRound"     INTEGER NOT NULL DEFAULT 0,
  "status"           TEXT NOT NULL DEFAULT 'FORMING',
  "nextDueAt"        TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Chama_pkey" PRIMARY KEY ("id")
);

-- ── ChamaMember ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ChamaMember" (
  "id"          TEXT NOT NULL,
  "chamaId"     TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "position"    INTEGER NOT NULL,
  "hasReceived" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "ChamaMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChamaMember_chamaId_userId_key" ON "ChamaMember"("chamaId","userId");
CREATE INDEX IF NOT EXISTS "ChamaMember_chamaId_idx"              ON "ChamaMember"("chamaId");

-- ── LoanListing ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "LoanListing" (
  "id"             TEXT NOT NULL,
  "lenderId"       TEXT NOT NULL,
  "amountUsdc"     DOUBLE PRECISION NOT NULL,
  "interestBps"    INTEGER NOT NULL,
  "durationDays"   INTEGER NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'OPEN',
  "borrowerId"     TEXT,
  "contractLoanId" INTEGER,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAt"          TIMESTAMP(3),
  CONSTRAINT "LoanListing_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LoanListing_status_idx"   ON "LoanListing"("status");
CREATE INDEX IF NOT EXISTS "LoanListing_lenderId_idx" ON "LoanListing"("lenderId");

-- ── CreditScore ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CreditScore" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "score"        INTEGER NOT NULL DEFAULT 40,
  "loansRepaid"  INTEGER NOT NULL DEFAULT 0,
  "defaults"     INTEGER NOT NULL DEFAULT 0,
  "monthsActive" INTEGER NOT NULL DEFAULT 0,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditScore_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CreditScore_userId_key" ON "CreditScore"("userId");

-- ── RewardPoints ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RewardPoints" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "balance"      INTEGER NOT NULL DEFAULT 0,
  "totalEarned"  INTEGER NOT NULL DEFAULT 0,
  "tier"         TEXT NOT NULL DEFAULT 'BRONZE',
  "streak"       INTEGER NOT NULL DEFAULT 0,
  "lastActivity" TIMESTAMP(3),
  CONSTRAINT "RewardPoints_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RewardPoints_userId_key" ON "RewardPoints"("userId");

-- ── VirtualCard ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "VirtualCard" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "cardRef"      TEXT NOT NULL,
  "maskedNumber" TEXT NOT NULL,
  "expiryMonth"  INTEGER NOT NULL,
  "expiryYear"   INTEGER NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'active',
  "dailyLimit"   DOUBLE PRECISION NOT NULL DEFAULT 500,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VirtualCard_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VirtualCard_userId_key"  ON "VirtualCard"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "VirtualCard_cardRef_key" ON "VirtualCard"("cardRef");

-- ── Merchant ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Merchant" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "shopName"   TEXT NOT NULL,
  "category"   TEXT NOT NULL,
  "qrPayload"  TEXT NOT NULL,
  "totalSales" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Merchant_userId_key" ON "Merchant"("userId");

-- ── Business ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Business" (
  "id"           TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "tin"          TEXT NOT NULL,
  "contactName"  TEXT NOT NULL,
  "email"        TEXT NOT NULL,
  "phone"        TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "apiKey"       TEXT NOT NULL,
  "plan"         TEXT NOT NULL DEFAULT 'STARTER',
  "country"      TEXT NOT NULL DEFAULT 'TZ',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Business_tin_key"    ON "Business"("tin");
CREATE UNIQUE INDEX IF NOT EXISTS "Business_email_key"  ON "Business"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "Business_apiKey_key" ON "Business"("apiKey");

-- ── PayrollRun ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PayrollRun" (
  "id"             TEXT NOT NULL,
  "businessId"     TEXT NOT NULL,
  "totalAmount"    DOUBLE PRECISION NOT NULL,
  "recipientCount" INTEGER NOT NULL,
  "stellarTxId"    TEXT,
  "status"         TEXT NOT NULL DEFAULT 'PENDING',
  "csvUrl"         TEXT,
  "executedAt"     TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- ── PayrollRecipient ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PayrollRecipient" (
  "id"           TEXT NOT NULL,
  "payrollRunId" TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "phone"        TEXT,
  "address"      TEXT,
  "amountUsdc"   DOUBLE PRECISION NOT NULL,
  "department"   TEXT,
  "reference"    TEXT,
  "status"       TEXT NOT NULL DEFAULT 'PENDING',
  "stellarTxId"  TEXT,
  CONSTRAINT "PayrollRecipient_pkey" PRIMARY KEY ("id")
);

-- ── GovProgram ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "GovProgram" (
  "id"          TEXT NOT NULL,
  "businessId"  TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "budgetUsdc"  DOUBLE PRECISION NOT NULL,
  "disbursed"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "startDate"   TIMESTAMP(3) NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'active',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovProgram_pkey" PRIMARY KEY ("id")
);

-- ── GovBeneficiary ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "GovBeneficiary" (
  "id"          TEXT NOT NULL,
  "programId"   TEXT NOT NULL,
  "nationalId"  TEXT NOT NULL,
  "fullName"    TEXT NOT NULL,
  "phone"       TEXT NOT NULL,
  "amountUsdc"  DOUBLE PRECISION NOT NULL,
  "ward"        TEXT,
  "district"    TEXT,
  "status"      TEXT NOT NULL DEFAULT 'PENDING',
  "reference"   TEXT NOT NULL,
  "stellarTxId" TEXT,
  "disbursedAt" TIMESTAMP(3),
  CONSTRAINT "GovBeneficiary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GovBeneficiary_reference_key"  ON "GovBeneficiary"("reference");
CREATE INDEX IF NOT EXISTS "GovBeneficiary_programId_idx"         ON "GovBeneficiary"("programId");
CREATE INDEX IF NOT EXISTS "GovBeneficiary_nationalId_idx"        ON "GovBeneficiary"("nationalId");

-- ── Bond ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Bond" (
  "id"             TEXT NOT NULL,
  "contractBondId" INTEGER,
  "name"           TEXT NOT NULL,
  "faceValueUsdc"  DOUBLE PRECISION NOT NULL,
  "couponRateBps"  INTEGER NOT NULL,
  "maturityDate"   TIMESTAMP(3) NOT NULL,
  "totalSupply"    DOUBLE PRECISION NOT NULL,
  "invested"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "minInvestment"  DOUBLE PRECISION NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'OPEN',
  "description"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Bond_pkey" PRIMARY KEY ("id")
);

-- ── BondHolding ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "BondHolding" (
  "id"             TEXT NOT NULL,
  "bondId"         TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "amountInvested" DOUBLE PRECISION NOT NULL,
  "couponClaimed"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "investedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BondHolding_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BondHolding_bondId_userId_key" ON "BondHolding"("bondId","userId");

-- ── Webhook ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Webhook" (
  "id"         TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "url"        TEXT NOT NULL,
  "events"     TEXT[] NOT NULL,
  "secret"     TEXT NOT NULL,
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- ── AuditLog ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id"         TEXT NOT NULL,
  "adminId"    TEXT NOT NULL,
  "action"     TEXT NOT NULL,
  "resource"   TEXT NOT NULL,
  "resourceId" TEXT,
  "metadata"   JSONB,
  "ipAddress"  TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AuditLog_adminId_idx"   ON "AuditLog"("adminId");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- ── DevApiKey ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DevApiKey" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "keyHash"      TEXT NOT NULL,
  "lastUsedAt"   TIMESTAMP(3),
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "isActive"     BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DevApiKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DevApiKey_keyHash_key" ON "DevApiKey"("keyHash");

-- ── Chat: Conversation ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Conversation" (
  "id"                 TEXT NOT NULL,
  "type"               TEXT NOT NULL DEFAULT 'DIRECT',
  "groupName"          TEXT,
  "groupAvatar"        TEXT,
  "groupAdminId"       TEXT,
  "lastMessageAt"      TIMESTAMP(3),
  "lastMessagePreview" TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

-- ── Chat: ConversationMember ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "ConversationMember" (
  "id"             TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "joinedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastReadAt"     TIMESTAMP(3),
  "isMuted"        BOOLEAN NOT NULL DEFAULT false,
  "isArchived"     BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "ConversationMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ConversationMember_conversationId_userId_key" ON "ConversationMember"("conversationId","userId");
CREATE INDEX IF NOT EXISTS "ConversationMember_userId_idx"                       ON "ConversationMember"("userId");

-- ── Chat: Message ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Message" (
  "id"               TEXT NOT NULL,
  "conversationId"   TEXT NOT NULL,
  "senderId"         TEXT NOT NULL,
  "type"             TEXT NOT NULL DEFAULT 'TEXT',
  "encryptedContent" TEXT,
  "plainContent"     TEXT,
  "amountUsdc"       DOUBLE PRECISION,
  "amountTzs"        DOUBLE PRECISION,
  "stellarTxId"      TEXT,
  "paymentStatus"    TEXT,
  "paymentNote"      TEXT,
  "mediaUrl"         TEXT,
  "mediaThumbUrl"    TEXT,
  "mediaMimeType"    TEXT,
  "replyToId"        TEXT,
  "isDeleted"        BOOLEAN NOT NULL DEFAULT false,
  "deletedAt"        TIMESTAMP(3),
  "deliveredAt"      TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message"("conversationId","createdAt");
CREATE INDEX IF NOT EXISTS "Message_senderId_idx"                 ON "Message"("senderId");

-- ── Chat: MessageReceipt ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "MessageReceipt" (
  "id"        TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "readAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MessageReceipt_messageId_userId_key" ON "MessageReceipt"("messageId","userId");

-- ── Chat: GroupKey ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "GroupKey" (
  "id"             TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "encryptedKey"   TEXT NOT NULL,
  CONSTRAINT "GroupKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GroupKey_conversationId_userId_key" ON "GroupKey"("conversationId","userId");

-- ── Chat: BlockedUser ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "BlockedUser" (
  "id"        TEXT NOT NULL,
  "blockerId" TEXT NOT NULL,
  "blockedId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlockedUser_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BlockedUser_blockerId_blockedId_key" ON "BlockedUser"("blockerId","blockedId");

-- ── Foreign Keys (safe — skip if already exist) ───────────────
DO $$ BEGIN
  ALTER TABLE "BankAccount"        ADD CONSTRAINT "BankAccount_userId_fkey"        FOREIGN KEY ("userId")        REFERENCES "User"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "SavingsPosition"    ADD CONSTRAINT "SavingsPosition_userId_fkey"    FOREIGN KEY ("userId")        REFERENCES "User"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "BillPayment"        ADD CONSTRAINT "BillPayment_userId_fkey"        FOREIGN KEY ("userId")        REFERENCES "User"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ScheduledPayment"   ADD CONSTRAINT "ScheduledPayment_userId_fkey"   FOREIGN KEY ("userId")        REFERENCES "User"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "PushSubscription"   ADD CONSTRAINT "PushSubscription_userId_fkey"   FOREIGN KEY ("userId")        REFERENCES "User"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Notification"       ADD CONSTRAINT "Notification_userId_fkey"       FOREIGN KEY ("userId")        REFERENCES "User"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "StakePosition"      ADD CONSTRAINT "StakePosition_userId_fkey"      FOREIGN KEY ("userId")        REFERENCES "User"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Chama"              ADD CONSTRAINT "Chama_adminId_fkey"              FOREIGN KEY ("adminId")       REFERENCES "User"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ChamaMember"        ADD CONSTRAINT "ChamaMember_chamaId_fkey"        FOREIGN KEY ("chamaId")       REFERENCES "Chama"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ChamaMember"        ADD CONSTRAINT "ChamaMember_userId_fkey"         FOREIGN KEY ("userId")        REFERENCES "User"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "LoanListing"        ADD CONSTRAINT "LoanListing_lenderId_fkey"       FOREIGN KEY ("lenderId")      REFERENCES "User"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "LoanListing"        ADD CONSTRAINT "LoanListing_borrowerId_fkey"     FOREIGN KEY ("borrowerId")    REFERENCES "User"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "CreditScore"        ADD CONSTRAINT "CreditScore_userId_fkey"         FOREIGN KEY ("userId")        REFERENCES "User"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "RewardPoints"       ADD CONSTRAINT "RewardPoints_userId_fkey"        FOREIGN KEY ("userId")        REFERENCES "User"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "VirtualCard"        ADD CONSTRAINT "VirtualCard_userId_fkey"         FOREIGN KEY ("userId")        REFERENCES "User"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Merchant"           ADD CONSTRAINT "Merchant_userId_fkey"            FOREIGN KEY ("userId")        REFERENCES "User"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "PayrollRun"         ADD CONSTRAINT "PayrollRun_businessId_fkey"      FOREIGN KEY ("businessId")    REFERENCES "Business"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "PayrollRecipient"   ADD CONSTRAINT "PayrollRecipient_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "GovProgram"         ADD CONSTRAINT "GovProgram_businessId_fkey"      FOREIGN KEY ("businessId")    REFERENCES "Business"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "GovBeneficiary"     ADD CONSTRAINT "GovBeneficiary_programId_fkey"   FOREIGN KEY ("programId")     REFERENCES "GovProgram"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "BondHolding"        ADD CONSTRAINT "BondHolding_bondId_fkey"         FOREIGN KEY ("bondId")        REFERENCES "Bond"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "BondHolding"        ADD CONSTRAINT "BondHolding_userId_fkey"         FOREIGN KEY ("userId")        REFERENCES "User"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Webhook"            ADD CONSTRAINT "Webhook_businessId_fkey"         FOREIGN KEY ("businessId")    REFERENCES "Business"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "DevApiKey"          ADD CONSTRAINT "DevApiKey_userId_fkey"           FOREIGN KEY ("userId")        REFERENCES "User"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_userId_fkey"  FOREIGN KEY ("userId")        REFERENCES "User"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Message"            ADD CONSTRAINT "Message_conversationId_fkey"     FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Message"            ADD CONSTRAINT "Message_senderId_fkey"           FOREIGN KEY ("senderId")      REFERENCES "User"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Message"            ADD CONSTRAINT "Message_replyToId_fkey"          FOREIGN KEY ("replyToId")     REFERENCES "Message"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "MessageReceipt"     ADD CONSTRAINT "MessageReceipt_messageId_fkey"   FOREIGN KEY ("messageId")     REFERENCES "Message"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "MessageReceipt"     ADD CONSTRAINT "MessageReceipt_userId_fkey"      FOREIGN KEY ("userId")        REFERENCES "User"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "GroupKey"           ADD CONSTRAINT "GroupKey_conversationId_fkey"    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "BlockedUser"        ADD CONSTRAINT "BlockedUser_blockerId_fkey"      FOREIGN KEY ("blockerId")     REFERENCES "User"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "BlockedUser"        ADD CONSTRAINT "BlockedUser_blockedId_fkey"      FOREIGN KEY ("blockedId")     REFERENCES "User"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;
