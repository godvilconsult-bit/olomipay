/**
 * One-off: add a USDC trustline to the dedicated fee wallet.
 *
 * Run from backend/ with the fee secret in the env (it never leaves your machine):
 *
 *   PowerShell:
 *     $env:FEE_WALLET_SECRET="S..."; $env:STELLAR_NETWORK="mainnet"; node scripts/setup-fee-wallet.mjs
 *   Git Bash:
 *     FEE_WALLET_SECRET="S..." STELLAR_NETWORK="mainnet" node scripts/setup-fee-wallet.mjs
 *
 * On testnet it auto-funds via Friendbot. On mainnet you must first send ~2 XLM
 * to the fee wallet (the script tells you the address if it isn't funded).
 */
import * as S from '@stellar/stellar-sdk';

const SECRET = process.env.FEE_WALLET_SECRET;
if (!SECRET) { console.error('❌ Set FEE_WALLET_SECRET in the environment.'); process.exit(1); }

const NET    = (process.env.STELLAR_NETWORK ?? 'testnet') === 'mainnet' ? 'mainnet' : 'testnet';
const ISSUER = process.env.USDC_ISSUER ?? (NET === 'mainnet'
  ? 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'   // Circle mainnet USDC
  : 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'); // testnet USDC
const HORIZON = NET === 'mainnet' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';
const PASS    = NET === 'mainnet' ? S.Networks.PUBLIC : S.Networks.TESTNET;

const kp  = S.Keypair.fromSecret(SECRET.trim());
const pub = kp.publicKey();
console.log('Network    :', NET);
console.log('Fee wallet :', pub);
console.log('USDC issuer:', ISSUER);

const server = new S.Horizon.Server(HORIZON);

let account;
try {
  account = await server.loadAccount(pub);
} catch {
  if (NET === 'testnet') {
    console.log('Account not found — funding via Friendbot…');
    await fetch('https://friendbot.stellar.org?addr=' + encodeURIComponent(pub));
    await new Promise(r => setTimeout(r, 4000));
    account = await server.loadAccount(pub);
  } else {
    console.error(`❌ Fee wallet is not funded. Send ~2 XLM to:\n   ${pub}\nthen run this again.`);
    process.exit(1);
  }
}

const USDC = new S.Asset('USDC', ISSUER);
if (account.balances.some(b => b.asset_code === 'USDC' && b.asset_issuer === ISSUER)) {
  console.log('✅ USDC trustline already exists — fee wallet is ready.');
  process.exit(0);
}

const tx = new S.TransactionBuilder(account, { fee: S.BASE_FEE, networkPassphrase: PASS })
  .addOperation(S.Operation.changeTrust({ asset: USDC, limit: '1000000000' }))
  .setTimeout(60)
  .build();
tx.sign(kp);
const res = await server.submitTransaction(tx);
console.log('✅ USDC trustline added! Fee wallet is ready. tx:', res.hash);
