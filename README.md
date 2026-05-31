# OlomiPay

> M-Pesa × Stellar bridge for Tanzania — deposit TZS, send USDC globally.

```
┌─────────────┐    STK Push    ┌──────────────┐    Soroban     ┌─────────────┐
│   M-Pesa    │◄──────────────►│  OlomiPay    │◄──────────────►│   Stellar   │
│  (Daraja)   │                │  (Anchor)    │                │  Testnet    │
└─────────────┘                └──────────────┘                └─────────────┘
                                     │
                               PostgreSQL + JWT
```

## Monorepo structure

```
olomipay/
├── contracts/olomipay/   Soroban smart contract (Rust)
├── backend/              Express + TypeScript anchor API
└── frontend/             Next.js 14 PWA
```

> **Windows users:** All commands below are for **PowerShell** (not CMD).
> Open PowerShell by pressing `Win + X` → "Windows PowerShell" or "Terminal".

---

## Phase 1 — Deploy Soroban Smart Contract

### 1.1 Install Rust

Open PowerShell and run:

```powershell
# Download and run the Rust installer
Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile "$env:TEMP\rustup-init.exe"
& "$env:TEMP\rustup-init.exe" -y

# Restart PowerShell after installation, then verify
rustup --version
cargo --version
```

### 1.2 Add WASM target

```powershell
rustup target add wasm32v1-none
rustup toolchain install stable --profile minimal
```

### 1.3 Install Stellar CLI

```powershell
# Option A — via cargo (recommended on Windows)
cargo install --locked stellar-cli --version 25.2.0

# Verify
stellar --version
```

### 1.4 Configure Stellar network

```powershell
# Add Stellar testnet config
stellar network add `
  --rpc-url https://soroban-testnet.stellar.org `
  --network-passphrase "Test SDF Network ; September 2015" `
  testnet
```

### 1.5 Generate keys and fund on testnet

```powershell
# Generate identities (stored locally by Stellar CLI)
stellar keys generate --global alice --network testnet
stellar keys generate --global fee-account --network testnet

# Fund both from the testnet faucet (friendbot)
stellar keys fund alice --network testnet
stellar keys fund fee-account --network testnet

# View the public keys (save these — you'll need them)
stellar keys address alice
stellar keys address fee-account
```

### 1.6 Build the contract

```powershell
# Navigate to the contracts workspace
cd C:\Users\olomi\STELLAR\olomipay\contracts

stellar contract build
# Output: olomipay\target\wasm32v1-none\release\olomipay.wasm
```

### 1.7 Deploy to testnet

```powershell
stellar contract deploy `
  --wasm .\olomipay\target\wasm32v1-none\release\olomipay.wasm `
  --source alice `
  --network testnet
# SAVE THE CONTRACT_ID that is printed — looks like C...56 chars
```

### 1.8 Initialize the contract

```powershell
# Replace <CONTRACT_ID>, <ALICE_PUBLIC_KEY>, <FEE_ACCOUNT_PUBLIC_KEY>
stellar contract invoke `
  --id <CONTRACT_ID> `
  --source alice `
  --network testnet `
  -- initialize `
  --admin <ALICE_PUBLIC_KEY> `
  --fee_account <FEE_ACCOUNT_PUBLIC_KEY> `
  --fee_bps 100

# Verify fee is set correctly (should return 100)
stellar contract invoke `
  --id <CONTRACT_ID> `
  --source alice `
  --network testnet `
  -- get_fee_bps
```

---

## Phase 2 — Backend

### 2.1 Prerequisites

```powershell
# Install Node.js 20+ from https://nodejs.org (LTS version)
node --version   # should print v20.x.x or higher
npm --version
```

### 2.2 Install dependencies

```powershell
cd C:\Users\olomi\STELLAR\olomipay\backend
npm install
```

### 2.3 Configure environment

```powershell
# Copy the example file
Copy-Item .env.example .env

# Open it in Notepad to edit
notepad .env
```

Fill in these values in `.env`:

```env
PORT=3001
DATABASE_URL=postgresql://user:password@localhost:5432/olomipay
JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
JWT_REFRESH_SECRET=<run same command again for a different value>
ENCRYPTION_KEY=<run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">

STELLAR_NETWORK=testnet
STELLAR_SECRET_KEY=<alice secret key — run: stellar keys show alice>
SOROBAN_CONTRACT_ID=<from Phase 1 step 1.7>
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org

USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
FEE_ACCOUNT=<fee-account public key from stellar keys address fee-account>

MPESA_CONSUMER_KEY=<from Daraja portal>
MPESA_CONSUMER_SECRET=<from Daraja portal>
MPESA_SHORTCODE=174379
MPESA_PASSKEY=<from Daraja portal>
MPESA_CALLBACK_URL=https://your-domain.com/api/mpesa/callback
MPESA_ENV=sandbox

CORS_ORIGIN=http://localhost:3000
```

### 2.4 Generate random secrets (helper commands)

```powershell
# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate JWT_REFRESH_SECRET (run again for different value)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Show alice secret key for STELLAR_SECRET_KEY
stellar keys show alice
```

### 2.5 Set up PostgreSQL database

**Option A — Install PostgreSQL locally:**
1. Download from https://www.postgresql.org/download/windows/
2. During install, set password for `postgres` user
3. After install, open pgAdmin or run in PowerShell:

```powershell
# Create the database (adjust path to your PostgreSQL install)
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE olomipay;"

# Update DATABASE_URL in .env:
# DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/olomipay
```

**Option B — Use Railway free tier (easier, no local install):**
1. Go to https://railway.app → New Project → Add PostgreSQL
2. Click the PostgreSQL service → Variables tab → copy `DATABASE_URL`
3. Paste it into your local `.env` file

### 2.6 Run database migrations

```powershell
cd C:\Users\olomi\STELLAR\olomipay\backend
npx prisma generate
npx prisma migrate dev --name init
```

### 2.7 Start the backend

```powershell
npm run dev
# API running at http://localhost:3001
# Test: open http://localhost:3001/health in your browser
```

---

## Phase 3 — Frontend

### 3.1 Install dependencies

```powershell
cd C:\Users\olomi\STELLAR\olomipay\frontend
npm install
```

### 3.2 Configure environment

```powershell
# Create .env.local
@"
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
"@ | Out-File -FilePath .env.local -Encoding utf8
```

### 3.3 Start the frontend

```powershell
npm run dev
# App running at http://localhost:3000
```

Open http://localhost:3000 in your browser — you'll see the OlomiPay landing page.

---

## Running both backend + frontend at once

Open **two separate PowerShell windows**:

**Window 1 — Backend:**
```powershell
cd C:\Users\olomi\STELLAR\olomipay\backend
npm run dev
```

**Window 2 — Frontend:**
```powershell
cd C:\Users\olomi\STELLAR\olomipay\frontend
npm run dev
```

---

## Deployment (free tier)

### Frontend → Vercel

```powershell
# Install Vercel CLI
npm install -g vercel

cd C:\Users\olomi\STELLAR\olomipay\frontend
vercel

# Follow the prompts, then add env vars in Vercel dashboard:
# https://vercel.com/dashboard → your project → Settings → Environment Variables
```

### Backend → Railway

1. Push your code to GitHub
2. Go to https://railway.app → New Project → Deploy from GitHub repo
3. Select the repo → set **Root Directory** to `backend`
4. Add a PostgreSQL database plugin
5. Go to Variables and add all values from your `.env` file
6. Railway gives you a public URL — set that as `MPESA_CALLBACK_URL`

---

## Troubleshooting Windows issues

### `stellar` not found after cargo install
```powershell
# Cargo binaries go to %USERPROFILE%\.cargo\bin — add to PATH:
$env:Path += ";$env:USERPROFILE\.cargo\bin"
# Make it permanent:
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";$env:USERPROFILE\.cargo\bin", "User")
```

### `wasm32v1-none` target not available
```powershell
# Ensure Rust is up to date (needs 1.84+)
rustup update stable
rustup target add wasm32v1-none
```

### `npx prisma migrate dev` fails — can't connect to DB
```powershell
# Check your DATABASE_URL in .env is correct
# Test connection:
node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); p.$connect().then(() => console.log('OK')).catch(e => console.error(e))"
```

### Port already in use
```powershell
# Find what's using port 3001
netstat -ano | findstr :3001
# Kill it (replace <PID> with the number from above)
taskkill /PID <PID> /F
```

### PowerShell execution policy error
```powershell
# Run as Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## API quick reference

```
POST /api/auth/register   { phone, pin }
POST /api/auth/login      { phone, pin }
GET  /api/auth/me

GET  /api/wallet/balance
GET  /api/wallet/history

POST /api/mpesa/deposit   { amountTzs }
POST /api/mpesa/callback  (Safaricom webhook)
POST /api/mpesa/withdraw  { amountUsdc, pin }
GET  /api/mpesa/rate

POST /api/send/stellar    { toAddress, amount, asset, memo, pin }
POST /api/send/phone      { toPhone, amount, asset, pin }
GET  /api/send/fee-preview?amount=10

POST /api/kyc/submit      { idType, idNumber, name }
GET  /api/kyc/status

GET  /api/admin/stats
GET  /api/admin/users
```

## Testnet resources

| Resource | URL |
|---|---|
| Stellar Testnet Horizon | https://horizon-testnet.stellar.org |
| Soroban RPC | https://soroban-testnet.stellar.org |
| Stellar Expert (testnet) | https://stellar.expert/explorer/testnet |
| M-Pesa Daraja sandbox | https://developer.safaricom.co.ke |
| Friendbot (free XLM) | https://friendbot.stellar.org?addr=G... |
| USDC testnet issuer | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |
