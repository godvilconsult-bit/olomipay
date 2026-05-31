//! OlomiPay Staking Pool — Soroban Smart Contract
//!
//! Users stake USDC with lock periods (30/90/180 days) earning
//! 4.5% / 7% / 10% APY respectively. Early exit incurs 1% penalty.

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
    Token,
    TotalStaked,
    Position(Address),
    Apy30,   // basis points for 30-day lock
    Apy90,   // basis points for 90-day lock
    Apy180,  // basis points for 180-day lock
}

// ── Structs ───────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct StakePosition {
    pub amount:           i128,
    pub lock_period_days: u32,
    pub stake_timestamp:  u64,
    pub unlock_timestamp: u64,
    pub apy_bps:          u32,
    pub yield_claimed:    i128,
    pub yield_accrued:    i128,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct StakingPool;

#[contractimpl]
impl StakingPool {
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin,       &admin);
        env.storage().instance().set(&DataKey::Token,       &token);
        env.storage().instance().set(&DataKey::TotalStaked, &0i128);
        env.storage().instance().set(&DataKey::Apy30,       &450u32);  // 4.5%
        env.storage().instance().set(&DataKey::Apy90,       &700u32);  // 7%
        env.storage().instance().set(&DataKey::Apy180,      &1000u32); // 10%
        env.storage().instance().extend_ttl(100_000, 100_000);
    }

    /// Stake USDC with a lock period (30, 90, or 180 days).
    pub fn stake(env: Env, user: Address, amount: i128, lock_period_days: u32) {
        user.require_auth();
        assert!(amount > 0, "amount must be positive");
        assert!(
            lock_period_days == 30 || lock_period_days == 90 || lock_period_days == 180,
            "lock_period_days must be 30, 90, or 180"
        );

        // No double staking — unstake first
        assert!(
            !env.storage().persistent().has(&DataKey::Position(user.clone())),
            "already have active stake — unstake first"
        );

        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let apy_bps: u32 = match lock_period_days {
            30  => env.storage().instance().get(&DataKey::Apy30).unwrap(),
            90  => env.storage().instance().get(&DataKey::Apy90).unwrap(),
            180 => env.storage().instance().get(&DataKey::Apy180).unwrap(),
            _   => 450u32,
        };

        TokenClient::new(&env, &token).transfer(&user, &env.current_contract_address(), &amount);

        let now            = env.ledger().timestamp();
        let seconds_locked = lock_period_days as u64 * 86_400;
        let position = StakePosition {
            amount,
            lock_period_days,
            stake_timestamp:  now,
            unlock_timestamp: now + seconds_locked,
            apy_bps,
            yield_claimed:    0,
            yield_accrued:    0,
        };

        let key = DataKey::Position(user.clone());
        env.storage().persistent().set(&key, &position);
        env.storage().persistent().extend_ttl(&key, 6_307_200, 6_307_200);

        let total: i128 = env.storage().instance().get(&DataKey::TotalStaked).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalStaked, &(total + amount));

        env.events().publish((Symbol::new(&env, "staked"), user), (amount, lock_period_days, now));
    }

    /// Unstake — returns principal + yield. 1% penalty if before unlock time.
    pub fn unstake(env: Env, user: Address) -> i128 {
        user.require_auth();

        let key = DataKey::Position(user.clone());
        let pos: StakePosition = env.storage().persistent().get(&key)
            .expect("no stake position");

        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let now = env.ledger().timestamp();

        let accrued = Self::_calc_yield(pos.amount, pos.apy_bps, pos.stake_timestamp, now);
        let yield_net = accrued - pos.yield_claimed;

        let (payout, penalty) = if now >= pos.unlock_timestamp {
            (pos.amount + yield_net, 0i128)
        } else {
            let penalty = pos.amount / 100; // 1%
            (pos.amount - penalty + yield_net, penalty)
        };

        env.storage().persistent().remove(&key);

        let total: i128 = env.storage().instance().get(&DataKey::TotalStaked).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalStaked, &(total - pos.amount).max(0));

        TokenClient::new(&env, &token).transfer(&env.current_contract_address(), &user, &payout);

        env.events().publish(
            (Symbol::new(&env, "unstaked"), user),
            (payout, penalty, now),
        );
        payout
    }

    /// Claim yield without touching principal (90+ day stakers only).
    pub fn claim_yield(env: Env, user: Address) -> i128 {
        user.require_auth();

        let key = DataKey::Position(user.clone());
        let mut pos: StakePosition = env.storage().persistent().get(&key)
            .expect("no stake position");

        assert!(pos.lock_period_days >= 90, "claim_yield only available for 90+ day stakes");

        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let now = env.ledger().timestamp();

        let accrued   = Self::_calc_yield(pos.amount, pos.apy_bps, pos.stake_timestamp, now);
        let claimable = accrued - pos.yield_claimed;
        assert!(claimable > 0, "no yield to claim");

        pos.yield_claimed += claimable;
        env.storage().persistent().set(&key, &pos);

        TokenClient::new(&env, &token).transfer(&env.current_contract_address(), &user, &claimable);

        env.events().publish((Symbol::new(&env, "yield_claimed"), user), (claimable, now));
        claimable
    }

    /// Get stake position with live yield calculated.
    pub fn get_stake(env: Env, user: Address) -> StakePosition {
        let key = DataKey::Position(user.clone());
        let mut pos: StakePosition = env.storage().persistent().get(&key)
            .expect("no stake position");
        let now = env.ledger().timestamp();
        pos.yield_accrued = Self::_calc_yield(pos.amount, pos.apy_bps, pos.stake_timestamp, now)
            - pos.yield_claimed;
        pos
    }

    pub fn get_total_staked(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalStaked).unwrap_or(0)
    }

    pub fn update_apys(env: Env, apy30: u32, apy90: u32, apy180: u32) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&DataKey::Apy30,  &apy30);
        env.storage().instance().set(&DataKey::Apy90,  &apy90);
        env.storage().instance().set(&DataKey::Apy180, &apy180);
    }

    fn _calc_yield(principal: i128, apy_bps: u32, from: u64, to: u64) -> i128 {
        if to <= from { return 0; }
        let seconds     = (to - from) as i128;
        let year_secs: i128 = 365 * 24 * 3600;
        principal * apy_bps as i128 * seconds / (10_000 * year_secs)
    }
}
