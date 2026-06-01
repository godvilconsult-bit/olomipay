/**
 * Auto-creates all database tables on startup.
 * Runs before the API starts — safe to run multiple times (IF NOT EXISTS).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
        "errorMsg" TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

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
        "createdAt"        TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MessageReceipt" (
        "id"        TEXT NOT NULL PRIMARY KEY,
        "messageId" TEXT NOT NULL,
        "userId"    TEXT NOT NULL,
        "readAt"    TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE("messageId", "userId")
      );
    `);

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
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT`).catch(() => {});

    console.log('[db] All tables created successfully ✓');

    // ── Seed admin user ───────────────────────────────────────────────────────
    await seedAdmin();

  } catch (e: any) {
    console.error('[db] Setup error:', e.message);
  }
}

async function seedAdmin() {
  const ADMIN_PHONE   = process.env.ADMIN_PHONE   ?? '+255752401012';
  const PLATFORM_KEY  = process.env.STELLAR_SECRET_KEY;

  try {
    // Find the admin user by phone
    const admin = await prisma.user.findUnique({ where: { phone: ADMIN_PHONE } });
    if (!admin) {
      console.log(`[db] Admin user ${ADMIN_PHONE} not found — will be set when they register`);
      return;
    }

    // Update admin flags
    const updateData: any = { isAdmin: true, isFeeCollector: true };

    // If platform stellar key is set and admin doesn't have it, link it
    if (PLATFORM_KEY && admin.stellarSecret !== PLATFORM_KEY) {
      const { generateKeypair } = await import('./stellar').catch(() => ({ generateKeypair: null }));
      // Keep existing keypair — just set the fee collector flag
    }

    await prisma.user.update({
      where: { phone: ADMIN_PHONE },
      data:  updateData,
    });

    console.log(`[db] Admin seeded: ${ADMIN_PHONE} (${admin.kycName ?? 'unnamed'})`);
  } catch (e: any) {
    console.error('[db] Admin seed error:', e.message);
  }
}
