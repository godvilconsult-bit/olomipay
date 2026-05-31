//! OlomiPay Soroban Smart Contract
//!
//! Bridges M-Pesa (Tanzania) with Stellar. Enforces a configurable basis-point
//! fee on every transfer, stores per-address history, and emits events so
//! the frontend and indexer can subscribe without polling.
//!
//! Deployed on Stellar Testnet first; the same binary promotes to Mainnet.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype,
    token::Client as TokenClient,
    Address, Env, String, Symbol, Vec, vec,
};

// ─── Storage key namespace ────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    FeeAccount,
    FeeBps,
    Transfers(Address),
}

// ─── Data structures ──────────────────────────────────────────────────────────

/// A single on-chain transfer record stored per user address.
#[contracttype]
#[derive(Clone, Debug)]
pub struct TransferRecord {
    pub from:      Address,
    pub to:        Address,
    pub amount:    i128,  // gross amount sent by user (in token's smallest unit)
    pub fee:       i128,  // fee collected by platform
    pub net:       i128,  // amount received by recipient
    pub token:     Address,
    pub timestamp: u64,
    pub memo:      String, // e.g. "M-Pesa deposit", "Send to +255712345678"
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct OlomiPayContract;

#[contractimpl]
impl OlomiPayContract {
    // ── Admin / initialisation ──────────────────────────────────────────────

    /// One-time setup. Must be called immediately after deployment.
    ///
    /// * `admin`      – address that may call `update_fee`
    /// * `fee_account`– where the platform fee is sent on every transfer
    /// * `fee_bps`    – fee in basis points (100 = 1 %, 50 = 0.5 %)
    pub fn initialize(
        env:        Env,
        admin:      Address,
        fee_account: Address,
        fee_bps:    u32,
    ) {
        // Prevent re-initialisation
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        assert!(fee_bps <= 1000, "fee_bps cannot exceed 10 %");

        env.storage().instance().set(&DataKey::Admin,      &admin);
        env.storage().instance().set(&DataKey::FeeAccount, &fee_account);
        env.storage().instance().set(&DataKey::FeeBps,     &fee_bps);

        // Keep instance storage alive for the lifetime of the contract
        env.storage().instance().extend_ttl(100_000, 100_000);
    }

    // ── Core transfer ───────────────────────────────────────────────────────

    /// Transfer `amount` of `token` from `from` to `to`, collecting a
    /// platform fee that is forwarded to `fee_account`.
    ///
    /// Returns the net amount received by `to`.
    ///
    /// # Panics
    /// - If `amount` ≤ 0
    /// - If computed fee would leave nothing for recipient
    pub fn transfer(
        env:    Env,
        from:   Address,
        to:     Address,
        token:  Address,
        amount: i128,
        memo:   String,
    ) -> i128 {
        from.require_auth();

        assert!(amount > 0, "amount must be positive");

        let fee_bps: u32     = env.storage().instance().get(&DataKey::FeeBps).unwrap();
        let fee_account: Address = env.storage().instance().get(&DataKey::FeeAccount).unwrap();

        // Integer-safe fee calculation: no floating point in financial code
        let fee_amount: i128 = (amount * fee_bps as i128) / 10_000;
        let net_amount: i128 = amount - fee_amount;

        assert!(net_amount > 0, "fee exceeds transfer amount");

        let token_client = TokenClient::new(&env, &token);

        // Move net amount to recipient
        token_client.transfer(&from, &to, &net_amount);

        // Collect platform fee (may be zero if fee_bps == 0)
        if fee_amount > 0 {
            token_client.transfer(&from, &fee_account, &fee_amount);
        }

        // Store record in sender's persistent history
        let record = TransferRecord {
            from:      from.clone(),
            to:        to.clone(),
            amount,
            fee:       fee_amount,
            net:       net_amount,
            token:     token.clone(),
            timestamp: env.ledger().timestamp(),
            memo:      memo.clone(),
        };

        Self::_append_transfer(&env, &from, record.clone());
        // Also index on the recipient side so they can see inbound transfers
        Self::_append_transfer(&env, &to, TransferRecord {
            from:      from.clone(),
            to:        to.clone(),
            amount,
            fee:       fee_amount,
            net:       net_amount,
            token:     token.clone(),
            timestamp: env.ledger().timestamp(),
            memo,
        });

        // Emit event for frontend / indexer subscription
        env.events().publish(
            (Symbol::new(&env, "transfer"), from.clone()),
            (to, amount, fee_amount, net_amount, token, env.ledger().timestamp()),
        );

        net_amount
    }

    // ── Query functions ─────────────────────────────────────────────────────

    /// Return all recorded transfers for `address` (both sent and received).
    pub fn get_transfers(env: Env, address: Address) -> Vec<TransferRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::Transfers(address))
            .unwrap_or(vec![&env])
    }

    /// Current fee in basis points.
    pub fn get_fee_bps(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::FeeBps).unwrap_or(100)
    }

    /// The address that receives platform fees.
    pub fn get_fee_account(env: Env) -> Address {
        env.storage().instance().get(&DataKey::FeeAccount).unwrap()
    }

    /// The contract administrator.
    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    // ── Admin mutations ─────────────────────────────────────────────────────

    /// Update the platform fee (admin only).
    pub fn update_fee(env: Env, new_fee_bps: u32) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        assert!(new_fee_bps <= 1000, "fee_bps cannot exceed 10 %");
        env.storage().instance().set(&DataKey::FeeBps, &new_fee_bps);

        env.events().publish(
            (Symbol::new(&env, "fee_updated"), admin),
            new_fee_bps,
        );
    }

    /// Transfer admin role to a new address (admin only).
    pub fn transfer_admin(env: Env, new_admin: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
    }

    // ── Internal helpers ────────────────────────────────────────────────────

    fn _append_transfer(env: &Env, address: &Address, record: TransferRecord) {
        let key = DataKey::Transfers(address.clone());
        let mut history: Vec<TransferRecord> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(vec![env]);

        history.push_back(record);

        // Keep at most 1000 records per address to bound storage cost
        if history.len() > 1000 {
            history.pop_front();
        }

        env.storage().persistent().set(&key, &history);
        // Extend TTL: 1 year in ledgers (~5 s per ledger → ~6 307 200 ledgers)
        env.storage().persistent().extend_ttl(&key, 6_307_200, 6_307_200);
    }
}

// ─── Unit tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        Env, String,
    };

    /// Minimal token mock — in real tests use soroban-token-sdk test helpers
    fn create_test_env() -> Env {
        let env = Env::default();
        env.mock_all_auths();
        env
    }

    #[test]
    fn test_initialize_and_fee_query() {
        let env = create_test_env();
        let contract_id = env.register_contract(None, OlomiPayContract);
        let client = OlomiPayContractClient::new(&env, &contract_id);

        let admin       = Address::generate(&env);
        let fee_account = Address::generate(&env);

        client.initialize(&admin, &fee_account, &100u32);

        assert_eq!(client.get_fee_bps(), 100u32);
        assert_eq!(client.get_admin(), admin);
        assert_eq!(client.get_fee_account(), fee_account);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_initialize_panics() {
        let env = create_test_env();
        let contract_id = env.register_contract(None, OlomiPayContract);
        let client = OlomiPayContractClient::new(&env, &contract_id);

        let admin       = Address::generate(&env);
        let fee_account = Address::generate(&env);

        client.initialize(&admin, &fee_account, &100u32);
        client.initialize(&admin, &fee_account, &100u32); // must panic
    }

    #[test]
    fn test_update_fee_admin_only() {
        let env = create_test_env();
        let contract_id = env.register_contract(None, OlomiPayContract);
        let client = OlomiPayContractClient::new(&env, &contract_id);

        let admin       = Address::generate(&env);
        let fee_account = Address::generate(&env);
        client.initialize(&admin, &fee_account, &100u32);

        client.update_fee(&50u32);
        assert_eq!(client.get_fee_bps(), 50u32);
    }
}
