//! OlomiPay Savings Vault — Soroban Smart Contract
//!
//! Users deposit USDC and earn 4.5% APY (simple interest).
//! Yield accrues per-second using integer arithmetic.
//! The admin can update the APY rate.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype,
    token::Client as TokenClient,
    Address, Env, Symbol, Vec, vec,
};

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,        // USDC token address
    ApyBps,       // 450 = 4.5%
    Balance(Address),
    TotalVault,
}

// ── Structs ───────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct SavingsBalance {
    pub principal:         i128,
    pub yield_earned:      i128,
    pub deposit_timestamp: u64,
    pub apy_bps:           u32,
    pub last_updated:      u64,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct SavingsVault;

#[contractimpl]
impl SavingsVault {
    /// One-time initialization.
    pub fn initialize(env: Env, admin: Address, token: Address, apy_bps: u32) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        assert!(apy_bps <= 5000, "APY cannot exceed 50%");

        env.storage().instance().set(&DataKey::Admin,   &admin);
        env.storage().instance().set(&DataKey::Token,   &token);
        env.storage().instance().set(&DataKey::ApyBps,  &apy_bps);
        env.storage().instance().set(&DataKey::TotalVault, &0i128);
        env.storage().instance().extend_ttl(100_000, 100_000);
    }

    /// Deposit USDC into the vault.
    pub fn deposit(env: Env, user: Address, amount: i128) {
        user.require_auth();
        assert!(amount > 0, "amount must be positive");

        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let apy_bps: u32   = env.storage().instance().get(&DataKey::ApyBps).unwrap();

        // Transfer USDC from user to this contract
        TokenClient::new(&env, &token).transfer(&user, &env.current_contract_address(), &amount);

        let now = env.ledger().timestamp();

        // Materialise any existing yield before adding principal
        let mut bal = Self::_get_balance(&env, &user);
        if bal.principal > 0 {
            bal.yield_earned += Self::_calc_yield(bal.principal, apy_bps, bal.last_updated, now);
        }

        bal.principal         += amount;
        bal.deposit_timestamp  = if bal.deposit_timestamp == 0 { now } else { bal.deposit_timestamp };
        bal.last_updated       = now;
        bal.apy_bps            = apy_bps;

        Self::_set_balance(&env, &user, &bal);

        // Update total vault
        let total: i128 = env.storage().instance().get(&DataKey::TotalVault).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalVault, &(total + amount));

        env.events().publish(
            (Symbol::new(&env, "deposit"), user),
            (amount, now),
        );
    }

    /// Withdraw principal + yield from vault.
    pub fn withdraw(env: Env, user: Address, amount: i128) -> i128 {
        user.require_auth();
        assert!(amount > 0, "amount must be positive");

        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let apy_bps: u32   = env.storage().instance().get(&DataKey::ApyBps).unwrap();
        let now = env.ledger().timestamp();

        let mut bal = Self::_get_balance(&env, &user);
        assert!(bal.principal > 0, "no savings position");

        // Materialise yield
        bal.yield_earned += Self::_calc_yield(bal.principal, apy_bps, bal.last_updated, now);
        bal.last_updated  = now;

        let available = bal.principal + bal.yield_earned;
        assert!(amount <= available, "insufficient balance");

        // Deduct from yield first, then principal
        let from_yield = amount.min(bal.yield_earned);
        let from_principal = amount - from_yield;
        bal.yield_earned  -= from_yield;
        bal.principal     -= from_principal;

        Self::_set_balance(&env, &user, &bal);

        // Update total vault
        let total: i128 = env.storage().instance().get(&DataKey::TotalVault).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalVault, &(total - from_principal).max(0));

        // Transfer USDC back to user
        TokenClient::new(&env, &token).transfer(&env.current_contract_address(), &user, &amount);

        env.events().publish(
            (Symbol::new(&env, "withdraw"), user),
            (amount, from_yield, now),
        );

        amount
    }

    /// Get savings balance including accrued (but not yet materialised) yield.
    pub fn get_balance(env: Env, user: Address) -> SavingsBalance {
        let apy_bps: u32 = env.storage().instance().get(&DataKey::ApyBps).unwrap_or(450);
        let now = env.ledger().timestamp();
        let mut bal = Self::_get_balance(&env, &user);
        if bal.principal > 0 {
            bal.yield_earned += Self::_calc_yield(bal.principal, apy_bps, bal.last_updated, now);
            bal.last_updated  = now;
        }
        bal
    }

    /// Total USDC locked in vault.
    pub fn get_total_vault(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalVault).unwrap_or(0)
    }

    /// Update APY rate (admin only).
    pub fn update_apy(env: Env, new_apy_bps: u32) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        assert!(new_apy_bps <= 5000, "APY cannot exceed 50%");
        env.storage().instance().set(&DataKey::ApyBps, &new_apy_bps);
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn _calc_yield(principal: i128, apy_bps: u32, from: u64, to: u64) -> i128 {
        if to <= from { return 0; }
        let seconds = (to - from) as i128;
        // yield = principal * apy_bps * seconds / (10000 * 365 * 24 * 3600)
        let year_seconds: i128 = 365 * 24 * 3600;
        principal * apy_bps as i128 * seconds / (10_000 * year_seconds)
    }

    fn _get_balance(env: &Env, user: &Address) -> SavingsBalance {
        env.storage().persistent()
            .get(&DataKey::Balance(user.clone()))
            .unwrap_or(SavingsBalance {
                principal:         0,
                yield_earned:      0,
                deposit_timestamp: 0,
                apy_bps:           450,
                last_updated:      0,
            })
    }

    fn _set_balance(env: &Env, user: &Address, bal: &SavingsBalance) {
        let key = DataKey::Balance(user.clone());
        env.storage().persistent().set(&key, bal);
        env.storage().persistent().extend_ttl(&key, 6_307_200, 6_307_200);
    }
}
