/**
 * Auto-creates all database tables on startup.
 * Runs before the API starts — safe to run multiple times (IF NOT EXISTS).
 */

import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';


export async function setupDatabase(): Promise<void> {
  console.log('[db] Setting up database tables...');
  try {
    // ── Create enums first ────────────────────────────────────────────────────
    const enums = [
      `DO $$ BEGIN CREATE TYPE "KycStatus" AS ENUM ('PENDING','SUBMITTED','APPROVED','REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
      `DO $$ BEGIN CREATE TYPE "TxType" AS ENUM ('DEPOSIT','SEND','RECEIVE','WITHDRAW','BILL','SCHEDULED','SWAP','STAKE','UNSTAKE','LOAN','REPAY'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
      `DO $$ BEGIN CREATE TYPE "TxStatus" AS ENUM ('PENDING','CONFIRMED','FAILED','EXPIRED'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
      `DO $$ BEGIN CREATE TYPE "Frequency" AS ENUM ('DAILY','WEEKLY','BIWEEKLY','MONTHLY'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
      `DO $$ BEGIN CREATE TYPE "ClaimStatus" AS ENUM ('PENDING','CLAIMED','EXPIRED'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
      `DO $$ BEGIN CREATE TYPE "StakeStatus" AS ENUM ('ACTIVE','UNLOCKED','WITHDRAWN'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
      `DO $$ BEGIN CREATE TYPE "ChamaStatus" AS ENUM ('FORMING','ACTIVE','COMPLETED','PAUSED'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
      `DO $$ BEGIN CREATE TYPE "LoanStatus" AS ENUM ('OPEN','FUNDED','REPAID','DEFAULTED'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
      `DO $$ BEGIN CREATE TYPE "RewardTier" AS ENUM ('BRONZE','SILVER','GOLD','PLATINUM'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
      `DO $$ BEGIN CREATE TYPE "BusinessPlan" AS ENUM ('STARTER','PROFESSIONAL','ENTERPRISE'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
      `DO $$ BEGIN CREATE TYPE "BondStatus" AS ENUM ('OPEN','CLOSED','MATURED','REDEEMED'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
      `DO $$ BEGIN CREATE TYPE "Country" AS ENUM ('TZ','KE','UG','RW','ZM'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
      `DO $$ BEGIN CREATE TYPE "ConvType" AS ENUM ('DIRECT','GROUP'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
      `DO $$ BEGIN CREATE TYPE "MessageType" AS ENUM ('TEXT','PAYMENT','PAYMENT_REQUEST','IMAGE','SYSTEM'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
      `DO $$ BEGIN CREATE TYPE "PaymentStatus" AS ENUM ('PENDING','CONFIRMED','FAILED','EXPIRED'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    ];
    for (const sql of enums) {
      await prisma.$executeRawUnsafe(sql);
    }

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "User" (
        "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "phone" TEXT NOT NULL UNIQUE,
        "pinHash" TEXT NOT NULL,
        "stellarPubKey" TEXT NOT NULL UNIQUE,
        "stellarSecret" TEXT NOT NULL,
        "kycStatus" TEXT NOT NULL DEFAULT 'PENDING',
        "kycName" TEXT,
        "kycIdType" TEXT,
        "kycIdNumber" TEXT,
        "dailyVolumeTzs" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "dailyVolumeDate" TIMESTAMP,
        "country" TEXT NOT NULL DEFAULT 'TZ',
        "chatPublicKey" TEXT,
        "chatSecretKeyEnc" TEXT,
        "isOnline" BOOLEAN NOT NULL DEFAULT false,
        "lastSeenAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Add missing columns to existing User table safely
    const userCols = [
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "kycName" TEXT`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "kycIdType" TEXT`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "kycIdNumber" TEXT`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "chatPublicKey" TEXT`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "chatSecretKeyEnc" TEXT`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isOnline" BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "country" TEXT NOT NULL DEFAULT 'TZ'`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dailyVolumeTzs" DOUBLE PRECISION NOT NULL DEFAULT 0`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dailyVolumeDate" TIMESTAMP`,
    ];
    for (const sql of userCols) {
      await prisma.$executeRawUnsafe(sql).catch(() => {});
    }

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RefreshToken" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "token" TEXT NOT NULL UNIQUE,
        "userId" TEXT NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Transaction" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "amountTzs" DOUBLE PRECISION,
        "amountUsdc" DOUBLE PRECISION,
        "stellarTxId" TEXT,
        "toAddress" TEXT,
        "memo" TEXT,
        "metadata" TEXT,
        "errorMsg" TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "metadata" TEXT`).catch(() => {});

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "BankAccount" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "bankName" TEXT NOT NULL,
        "accountNumber" TEXT NOT NULL,
        "swiftCode" TEXT NOT NULL,
        "accountName" TEXT NOT NULL,
        "isVerified" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SavingsPosition" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL UNIQUE,
        "principal" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "yieldEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "depositedAt" TIMESTAMP,
        "lastYieldAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SavingsGoal" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "emoji" TEXT NOT NULL DEFAULT '🎯',
        "targetAmount" DOUBLE PRECISION NOT NULL,
        "savedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "targetDate" TIMESTAMP,
        "autoSaveAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "autoSaveFreq" TEXT NOT NULL DEFAULT 'none',
        "nextAutoSaveAt" TIMESTAMP,
        "status" TEXT NOT NULL DEFAULT 'active',
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "SavingsGoal_userId_idx" ON "SavingsGoal" ("userId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Agent" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL UNIQUE,
        "code" TEXT NOT NULL UNIQUE,
        "businessName" TEXT NOT NULL,
        "city" TEXT NOT NULL,
        "country" TEXT NOT NULL DEFAULT 'TZ',
        "phone" TEXT NOT NULL,
        "commissionPct" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
        "commissionEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "perTxLimitUsdc" DOUBLE PRECISION NOT NULL DEFAULT 500,
        "dailyLimitUsdc" DOUBLE PRECISION NOT NULL DEFAULT 2000,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "Agent_country_status_idx" ON "Agent" ("country","status");
      ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "perTxLimitUsdc" DOUBLE PRECISION NOT NULL DEFAULT 500;
      ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "dailyLimitUsdc" DOUBLE PRECISION NOT NULL DEFAULT 2000;

      CREATE TABLE IF NOT EXISTS "AgentTransaction" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "agentId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "amountUsdc" DOUBLE PRECISION NOT NULL,
        "localAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "currency" TEXT NOT NULL DEFAULT 'TZS',
        "code" TEXT,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "stellarTxId" TEXT,
        "commissionUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "expiresAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
      ALTER TABLE "AgentTransaction" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP;
      CREATE INDEX IF NOT EXISTS "AgentTransaction_agentId_idx" ON "AgentTransaction" ("agentId");
      CREATE INDEX IF NOT EXISTS "AgentTransaction_userId_idx" ON "AgentTransaction" ("userId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "BillPayment" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "billerName" TEXT NOT NULL,
        "billerCode" TEXT NOT NULL,
        "accountNumber" TEXT NOT NULL,
        "amountTzs" DOUBLE PRECISION NOT NULL,
        "amountUsdc" DOUBLE PRECISION NOT NULL,
        "reference" TEXT NOT NULL,
        "token" TEXT,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ScheduledPayment" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "toAddress" TEXT NOT NULL,
        "toPhone" TEXT,
        "toName" TEXT,
        "amount" DOUBLE PRECISION NOT NULL,
        "asset" TEXT NOT NULL DEFAULT 'USDC',
        "frequency" TEXT NOT NULL,
        "nextRunAt" TIMESTAMP NOT NULL,
        "endDate" TIMESTAMP,
        "memo" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "executionCount" INTEGER NOT NULL DEFAULT 0,
        "lastRunAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PushSubscription" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "endpoint" TEXT NOT NULL UNIQUE,
        "p256dhKey" TEXT NOT NULL,
        "authKey" TEXT NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Staff accounts — back-office admins with username + password (SEPARATE
    // from app users, who log in with phone + PIN). Created by the SUPER_ADMIN.
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Staff" (
        "id"           TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "username"     TEXT NOT NULL UNIQUE,
        "passwordHash" TEXT NOT NULL,
        "name"         TEXT,
        "role"         TEXT NOT NULL DEFAULT 'SUPPORT',
        "isActive"     BOOLEAN NOT NULL DEFAULT true,
        "createdBy"    TEXT,
        "lastLoginAt"  TIMESTAMP,
        "createdAt"    TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "failedLoginCount" INT NOT NULL DEFAULT 0`).catch(() => {});
    await prisma.$executeRawUnsafe(`ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP`).catch(() => {});

    // Account-lockout fields — lock after repeated failed logins.
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedLoginCount" INT NOT NULL DEFAULT 0`).catch(() => {});
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP`).catch(() => {});

    // Security events — failed logins, lockouts, suspicious activity (for the
    // System Health / security view + alerting).
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SecurityEvent" (
        "id"        TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "type"      TEXT NOT NULL,
        "phone"     TEXT,
        "detail"    TEXT,
        "ip"        TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SecurityEvent_createdAt_idx" ON "SecurityEvent" ("createdAt")`).catch(() => {});

    // Native push (FCM/APNs) device tokens for the iOS/Android apps.
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DeviceToken" (
        "id"        TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "userId"    TEXT NOT NULL,
        "token"     TEXT NOT NULL UNIQUE,
        "platform"  TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Notification" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "body" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "isRead" BOOLEAN NOT NULL DEFAULT false,
        "data" JSONB,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PendingClaim" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "senderId" TEXT NOT NULL,
        "toPhone" TEXT NOT NULL,
        "claimToken" TEXT NOT NULL UNIQUE,
        "amountUsdc" DOUBLE PRECISION NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "claimedAt" TIMESTAMP,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "StakePosition" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL UNIQUE,
        "amountUsdc" DOUBLE PRECISION NOT NULL,
        "lockDays" INTEGER NOT NULL,
        "apyBps" INTEGER NOT NULL,
        "stakedAt" TIMESTAMP NOT NULL,
        "unlockAt" TIMESTAMP NOT NULL,
        "yieldClaimed" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "contractKey" TEXT,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Chama" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "contractId" TEXT,
        "adminId" TEXT NOT NULL,
        "contributionUsdc" DOUBLE PRECISION NOT NULL,
        "frequencyDays" INTEGER NOT NULL,
        "currentRound" INTEGER NOT NULL DEFAULT 0,
        "status" TEXT NOT NULL DEFAULT 'FORMING',
        "nextDueAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ChamaMember" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "chamaId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "position" INTEGER NOT NULL,
        "hasReceived" BOOLEAN NOT NULL DEFAULT false,
        UNIQUE("chamaId", "userId")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "LoanListing" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "lenderId" TEXT NOT NULL,
        "amountUsdc" DOUBLE PRECISION NOT NULL,
        "interestBps" INTEGER NOT NULL,
        "durationDays" INTEGER NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'OPEN',
        "borrowerId" TEXT,
        "contractLoanId" INTEGER,
        "dueAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CreditScore" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL UNIQUE,
        "score" INTEGER NOT NULL DEFAULT 40,
        "loansRepaid" INTEGER NOT NULL DEFAULT 0,
        "defaults" INTEGER NOT NULL DEFAULT 0,
        "monthsActive" INTEGER NOT NULL DEFAULT 0,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RewardPoints" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL UNIQUE,
        "balance" INTEGER NOT NULL DEFAULT 0,
        "totalEarned" INTEGER NOT NULL DEFAULT 0,
        "tier" TEXT NOT NULL DEFAULT 'BRONZE',
        "streak" INTEGER NOT NULL DEFAULT 0,
        "lastActivity" TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "VirtualCard" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL UNIQUE,
        "cardRef" TEXT NOT NULL UNIQUE,
        "maskedNumber" TEXT NOT NULL,
        "expiryMonth" INTEGER NOT NULL,
        "expiryYear" INTEGER NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'active',
        "dailyLimit" DOUBLE PRECISION NOT NULL DEFAULT 500,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RateHistory" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "usdToTzs" DOUBLE PRECISION NOT NULL,
        "date" TIMESTAMP NOT NULL UNIQUE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Merchant" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL UNIQUE,
        "shopName" TEXT NOT NULL,
        "category" TEXT NOT NULL,
        "qrPayload" TEXT NOT NULL,
        "totalSales" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Business" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "tin" TEXT NOT NULL UNIQUE,
        "contactName" TEXT NOT NULL,
        "email" TEXT NOT NULL UNIQUE,
        "phone" TEXT NOT NULL,
        "passwordHash" TEXT NOT NULL,
        "apiKey" TEXT NOT NULL UNIQUE,
        "plan" TEXT NOT NULL DEFAULT 'STARTER',
        "country" TEXT NOT NULL DEFAULT 'TZ',
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PayrollRun" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "businessId" TEXT NOT NULL,
        "totalAmount" DOUBLE PRECISION NOT NULL,
        "recipientCount" INTEGER NOT NULL,
        "stellarTxId" TEXT,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "csvUrl" TEXT,
        "executedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PayrollRecipient" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "payrollRunId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "phone" TEXT,
        "address" TEXT,
        "amountUsdc" DOUBLE PRECISION NOT NULL,
        "department" TEXT,
        "reference" TEXT,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "stellarTxId" TEXT
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "GovProgram" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "businessId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "budgetUsdc" DOUBLE PRECISION NOT NULL,
        "disbursed" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "startDate" TIMESTAMP NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'active',
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "GovBeneficiary" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "programId" TEXT NOT NULL,
        "nationalId" TEXT NOT NULL,
        "fullName" TEXT NOT NULL,
        "phone" TEXT NOT NULL,
        "amountUsdc" DOUBLE PRECISION NOT NULL,
        "ward" TEXT,
        "district" TEXT,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "reference" TEXT NOT NULL UNIQUE,
        "stellarTxId" TEXT,
        "disbursedAt" TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Bond" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "contractBondId" INTEGER,
        "name" TEXT NOT NULL,
        "faceValueUsdc" DOUBLE PRECISION NOT NULL,
        "couponRateBps" INTEGER NOT NULL,
        "maturityDate" TIMESTAMP NOT NULL,
        "totalSupply" DOUBLE PRECISION NOT NULL,
        "invested" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "minInvestment" DOUBLE PRECISION NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'OPEN',
        "description" TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "BondHolding" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "bondId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "amountInvested" DOUBLE PRECISION NOT NULL,
        "couponClaimed" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "investedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE("bondId", "userId")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Webhook" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "businessId" TEXT NOT NULL,
        "url" TEXT NOT NULL,
        "events" TEXT[] NOT NULL,
        "secret" TEXT NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AuditLog" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "adminId" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "resource" TEXT NOT NULL,
        "resourceId" TEXT,
        "metadata" JSONB,
        "ipAddress" TEXT NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DevApiKey" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "keyHash" TEXT NOT NULL UNIQUE,
        "lastUsedAt" TIMESTAMP,
        "requestCount" INTEGER NOT NULL DEFAULT 0,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // ── Chat tables ───────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "User"
        ADD COLUMN IF NOT EXISTS "chatPublicKey"    TEXT,
        ADD COLUMN IF NOT EXISTS "chatSecretKeyEnc" TEXT,
        ADD COLUMN IF NOT EXISTS "isOnline"         BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "lastSeenAt"       TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "country"          TEXT NOT NULL DEFAULT 'TZ';
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Conversation" (
        "id"                 TEXT NOT NULL PRIMARY KEY,
        "type"               TEXT NOT NULL DEFAULT 'DIRECT',
        "groupName"          TEXT,
        "groupAvatar"        TEXT,
        "groupAdminId"       TEXT,
        "lastMessageAt"      TIMESTAMP,
        "lastMessagePreview" TEXT,
        "createdAt"          TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ConversationMember" (
        "id"             TEXT NOT NULL PRIMARY KEY,
        "conversationId" TEXT NOT NULL,
        "userId"         TEXT NOT NULL,
        "joinedAt"       TIMESTAMP NOT NULL DEFAULT NOW(),
        "lastReadAt"     TIMESTAMP,
        "isMuted"        BOOLEAN NOT NULL DEFAULT false,
        "isArchived"     BOOLEAN NOT NULL DEFAULT false,
        UNIQUE("conversationId", "userId")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Message" (
        "id"               TEXT NOT NULL PRIMARY KEY,
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
        "deletedAt"        TIMESTAMP,
        "deliveredAt"      TIMESTAMP,
        "paymentAsset"     TEXT DEFAULT 'USDC',
        "createdAt"        TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "paymentAsset" TEXT DEFAULT 'USDC'`).catch(() => {});

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MessageReceipt" (
        "id"        TEXT NOT NULL PRIMARY KEY,
        "messageId" TEXT NOT NULL,
        "userId"    TEXT NOT NULL,
        "readAt"    TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE("messageId", "userId")
      );
    `);

    // Immutable audit log of every admin/back-office action
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
        "id"         TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "adminId"    TEXT NOT NULL,
        "adminPhone" TEXT,
        "action"     TEXT NOT NULL,
        "targetId"   TEXT,
        "targetType" TEXT,
        "detail"     TEXT,
        "ip"         TEXT,
        "createdAt"  TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AdminAuditLog_created_idx" ON "AdminAuditLog" ("createdAt")`).catch(() => {});

    // Immutable public account number (OP-XXXX) — admin/audit source of truth
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountNo" TEXT`).catch(() => {});
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_accountNo_key" ON "User" ("accountNo") WHERE "accountNo" IS NOT NULL`).catch(() => {});
    // Backfill any users missing an accountNo (one-time; cheap on small tables)
    try {
      const { makeAccountNo } = await import('./accountNo');
      const missing = await prisma.user.findMany({ where: { accountNo: null }, select: { id: true } });
      for (const u of missing) {
        await prisma.user.update({ where: { id: u.id }, data: { accountNo: makeAccountNo(u.id) } }).catch(() => {});
      }
      if (missing.length) console.log(`[db] backfilled accountNo for ${missing.length} users`);
    } catch (e: any) { console.warn('[db] accountNo backfill skipped:', e.message); }

    // RBAC role + 2FA on the admin user
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "adminRole" TEXT`).catch(() => {});
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isFrozen" BOOLEAN NOT NULL DEFAULT false`).catch(() => {});
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "adminTotpSecret" TEXT`).catch(() => {});
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "adminTotpEnabled" BOOLEAN NOT NULL DEFAULT false`).catch(() => {});

    // Maker-checker (4-eyes) approval queue for money-moving actions
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AdminApproval" (
        "id"        TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "action"    TEXT NOT NULL,
        "payload"   TEXT,
        "makerId"   TEXT NOT NULL,
        "makerPhone" TEXT,
        "checkerId" TEXT,
        "status"    TEXT NOT NULL DEFAULT 'PENDING',
        "result"    TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "decidedAt" TIMESTAMP
      );
    `);
    // Multi-step approval: how many distinct sign-offs are required, and who has
    // signed off so far ([{adminId, phone, role, at}]). 4-eyes is the special
    // case requiredApprovals = 1 (one checker besides the maker).
    await prisma.$executeRawUnsafe(`ALTER TABLE "AdminApproval" ADD COLUMN IF NOT EXISTS "requiredApprovals" INT NOT NULL DEFAULT 3`).catch(() => {});
    await prisma.$executeRawUnsafe(`ALTER TABLE "AdminApproval" ADD COLUMN IF NOT EXISTS "approvals" JSONB NOT NULL DEFAULT '[]'::jsonb`).catch(() => {});

    // Auto-reconciler log — what the self-healing job did to stuck transactions
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AutoReconcileLog" (
        "id"        TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "action"    TEXT NOT NULL,
        "txId"      TEXT NOT NULL,
        "detail"    TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AutoReconcileLog_created_idx" ON "AutoReconcileLog" ("createdAt")`).catch(() => {});

    // Risk/fraud review log — flagged transactions for the async FinCrime agent
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RiskReview" (
        "id"         TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "userId"     TEXT NOT NULL,
        "amountUsdc" DOUBLE PRECISION,
        "decision"   TEXT NOT NULL,
        "score"      INTEGER NOT NULL DEFAULT 0,
        "reasons"    TEXT,
        "resolved"   BOOLEAN NOT NULL DEFAULT false,
        "createdAt"  TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RiskReview_user_idx" ON "RiskReview" ("userId")`).catch(() => {});
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RiskReview_created_idx" ON "RiskReview" ("createdAt")`).catch(() => {});

    // Idempotency for chat payments — prevents double-send on retry
    await prisma.$executeRawUnsafe(`ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "clientRef" TEXT`).catch(() => {});
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Message_clientRef_key" ON "Message" ("clientRef") WHERE "clientRef" IS NOT NULL`).catch(() => {});

    // Ledger backfill queue — money moved on-chain but a DB ledger write failed.
    // The reconciler drains this so internal records always catch up to chain truth.
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "LedgerBackfill" (
        "id"         TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "userId"     TEXT NOT NULL,
        "type"       TEXT NOT NULL,
        "amountUsdc" DOUBLE PRECISION,
        "stellarTxId" TEXT,
        "toAddress"  TEXT,
        "memo"       TEXT,
        "applied"    BOOLEAN NOT NULL DEFAULT false,
        "attempts"   INTEGER NOT NULL DEFAULT 0,
        "createdAt"  TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "LedgerBackfill_applied_idx" ON "LedgerBackfill" ("applied")`).catch(() => {});

    // In-app support tickets — customer opens a ticket that lands in the admin console
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SupportTicket" (
        "id"            TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "userId"        TEXT NOT NULL,
        "subject"       TEXT NOT NULL,
        "category"      TEXT NOT NULL DEFAULT 'GENERAL',
        "status"        TEXT NOT NULL DEFAULT 'OPEN',
        "priority"      TEXT NOT NULL DEFAULT 'NORMAL',
        "lastMessageAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "unreadForAdmin" BOOLEAN NOT NULL DEFAULT true,
        "unreadForUser"  BOOLEAN NOT NULL DEFAULT false,
        "createdAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"     TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SupportTicket_user_idx" ON "SupportTicket" ("userId")`).catch(() => {});
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SupportTicket_status_idx" ON "SupportTicket" ("status")`).catch(() => {});

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SupportTicketMessage" (
        "id"         TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "ticketId"   TEXT NOT NULL,
        "authorId"   TEXT NOT NULL,
        "authorType" TEXT NOT NULL DEFAULT 'USER',
        "body"       TEXT NOT NULL,
        "createdAt"  TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SupportTicketMessage_ticket_idx" ON "SupportTicketMessage" ("ticketId")`).catch(() => {});

    // Support case notes — append-only context per customer, carried across agents/shifts
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SupportNote" (
        "id"          TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "userId"      TEXT NOT NULL,
        "authorId"    TEXT NOT NULL,
        "authorPhone" TEXT,
        "note"        TEXT NOT NULL,
        "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SupportNote_user_idx" ON "SupportNote" ("userId")`).catch(() => {});

    // "Delete for me" — a message hidden only for a specific user
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MessageHidden" (
        "id"        TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "messageId" TEXT NOT NULL,
        "userId"    TEXT NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE("messageId", "userId")
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MessageHidden_user_idx" ON "MessageHidden" ("userId")`).catch(() => {});

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "GroupKey" (
        "id"             TEXT NOT NULL PRIMARY KEY,
        "conversationId" TEXT NOT NULL,
        "userId"         TEXT NOT NULL,
        "encryptedKey"   TEXT NOT NULL,
        UNIQUE("conversationId", "userId")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "BlockedUser" (
        "id"        TEXT NOT NULL PRIMARY KEY,
        "blockerId" TEXT NOT NULL,
        "blockedId" TEXT NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE("blockerId", "blockedId")
      );
    `);

    // Add admin columns if missing
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN NOT NULL DEFAULT false`).catch(() => {});
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isFeeCollector" BOOLEAN NOT NULL DEFAULT false`).catch(() => {});
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activationFeePaid" BOOLEAN NOT NULL DEFAULT false`).catch(() => {});
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT`).catch(() => {});

    console.log('[db] All tables created successfully ✓');

    // ── Seed admin user + bootstrap super-admin staff ─────────────────────────
    await seedAdmin();
    await seedSuperStaff();

  } catch (e: any) {
    console.error('[db] Setup error:', e.message);
  }
}

// Bootstrap the first SUPER_ADMIN staff account so the owner can log in to the
// admin panel with a username + password and create the rest of the staff.
// Configure via SUPERADMIN_USERNAME / SUPERADMIN_PASSWORD (defaults provided —
// CHANGE THE DEFAULT PASSWORD IMMEDIATELY in production).
async function seedSuperStaff() {
  try {
    const username = (process.env.SUPERADMIN_USERNAME ?? 'superadmin').toLowerCase().trim();
    const password = process.env.SUPERADMIN_PASSWORD ?? 'ChangeMe!2026';
    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "id" FROM "Staff" WHERE "username" = $1`, username,
    );
    if (existing.length) return; // already seeded
    const { hashPin } = await import('./crypto');
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Staff" ("username","passwordHash","name","role","isActive")
       VALUES ($1,$2,$3,'SUPER_ADMIN',true)`,
      username, hashPin(password), 'Super Admin',
    );
    console.log(`[db] ✓ Seeded SUPER_ADMIN staff "${username}" — change the password after first login`);
  } catch (e: any) {
    console.error('[db] seedSuperStaff error:', e.message);
  }
}

async function seedAdmin() {
  // Normalize phone — accept with or without country code
  const rawPhone      = process.env.ADMIN_PHONE ?? '+255752401012';
  const ADMIN_PHONES  = [rawPhone, rawPhone.replace(/^\+255/, '0'), '0' + rawPhone.replace(/^\+255/, '')].filter(Boolean);
  const PLATFORM_SECRET = process.env.STELLAR_SECRET_KEY;
  const PLATFORM_PUBLIC = process.env.STELLAR_PUBLIC_KEY ?? process.env.FEE_ACCOUNT;

  try {
    // Try to find admin by any phone variant
    let admin: any = null;
    for (const phone of ADMIN_PHONES) {
      admin = await prisma.user.findUnique({ where: { phone } });
      if (admin) break;
    }

    if (!admin) {
      console.log(`[db] Admin user ${rawPhone} not found — flags will be set on first login`);
      return;
    }

    // Build update: always set admin flags. The seed phone is the SUPER_ADMIN —
    // the only role that can assign other roles, add admins, and override/approve
    // anything (OWNER bypasses every RBAC gate via roleSatisfies()).
    const updateData: any = { isAdmin: true, isFeeCollector: true, adminRole: 'SUPER_ADMIN' };

    // Link admin's Stellar account to the platform keys so fees go to them
    if (PLATFORM_SECRET && PLATFORM_PUBLIC) {
      // Check that no OTHER user already owns the platform public key
      const existingOwner = await prisma.user.findFirst({
        where: { stellarPubKey: PLATFORM_PUBLIC, id: { not: admin.id } },
      });
      if (!existingOwner) {
        updateData.stellarPubKey = PLATFORM_PUBLIC;
        updateData.stellarSecret = PLATFORM_SECRET;
        console.log(`[db] Linking platform Stellar keys to admin ${admin.phone}`);
      }
    }

    await prisma.user.update({ where: { id: admin.id }, data: updateData });
    console.log(`[db] ✓ Admin seeded: ${admin.phone} (${admin.kycName ?? 'unnamed'}) — isAdmin=true isFeeCollector=true`);
  } catch (e: any) {
    console.error('[db] Admin seed error:', e.message);
  }
}
