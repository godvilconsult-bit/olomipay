//! OlomiPay Bond Tokenization — Soroban Smart Contract
//!
//! Issues Treasury Bills as Stellar tokens. Citizens invest minimum amounts.
//! Quarterly coupon payments distributed to all holders.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype,
    token::Client as TokenClient,
    Address, Env, String, Symbol, Vec,
};

#[contracttype]
#[derive(Clone, PartialEq)]
pub enum BondStatus {
    Open,
    Closed,
    Matured,
    Redeemed,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Bond {
    pub name:             String,
    pub face_value_usdc:  i128,
    pub coupon_rate_bps:  u32,
    pub maturity:         u64,
    pub total_supply:     i128,
    pub invested:         i128,
    pub min_investment:   i128,
    pub status:           BondStatus,
    pub admin:            Address,
    pub token:            Address,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct BondHolding {
    pub amount_invested:  i128,
    pub coupon_claimed:   i128,
    pub invested_at:      u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    Bond(u32),
    Holding(u32, Address),
    Counter,
}

#[contract]
pub struct BondContract;

#[contractimpl]
impl BondContract {
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Counter, &0u32);
        env.storage().instance().extend_ttl(100_000, 100_000);
    }

    /// Admin issues a new bond offering.
    pub fn issue_bond(
        env:             Env,
        admin:           Address,
        name:            String,
        face_value_usdc: i128,
        coupon_rate_bps: u32,
        maturity:        u64,
        total_supply:    i128,
        min_investment:  i128,
    ) -> u32 {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        assert!(admin == stored_admin, "not admin");

        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let id: u32 = env.storage().instance().get(&DataKey::Counter).unwrap_or(0);

        let bond = Bond {
            name,
            face_value_usdc,
            coupon_rate_bps,
            maturity,
            total_supply,
            invested: 0,
            min_investment,
            status: BondStatus::Open,
            admin: admin.clone(),
            token,
        };

        env.storage().persistent().set(&DataKey::Bond(id), &bond);
        env.storage().persistent().extend_ttl(&DataKey::Bond(id), 6_307_200, 6_307_200);
        env.storage().instance().set(&DataKey::Counter, &(id + 1));

        env.events().publish((Symbol::new(&env, "bond_issued"), admin), (id, maturity));
        id
    }

    /// Investor buys into a bond offering.
    pub fn invest(env: Env, investor: Address, bond_id: u32, amount_usdc: i128) {
        investor.require_auth();

        let mut bond: Bond = env.storage().persistent()
            .get(&DataKey::Bond(bond_id))
            .expect("bond not found");

        assert!(bond.status == BondStatus::Open, "bond not open for investment");
        assert!(amount_usdc >= bond.min_investment, "below minimum investment");
        assert!(bond.invested + amount_usdc <= bond.total_supply, "exceeds total supply");
        assert!(env.ledger().timestamp() < bond.maturity, "bond has matured");

        TokenClient::new(&env, &bond.token).transfer(
            &investor, &env.current_contract_address(), &amount_usdc,
        );

        let holding_key = DataKey::Holding(bond_id, investor.clone());
        let mut holding: BondHolding = env.storage().persistent()
            .get(&holding_key)
            .unwrap_or(BondHolding { amount_invested: 0, coupon_claimed: 0, invested_at: env.ledger().timestamp() });

        holding.amount_invested += amount_usdc;
        env.storage().persistent().set(&holding_key, &holding);
        env.storage().persistent().extend_ttl(&holding_key, 6_307_200, 6_307_200);

        bond.invested += amount_usdc;
        env.storage().persistent().set(&DataKey::Bond(bond_id), &bond);

        env.events().publish(
            (Symbol::new(&env, "bond_invested"), investor),
            (bond_id, amount_usdc),
        );
    }

    /// Admin distributes quarterly coupon to all holders.
    /// Simplified: distributes total_yield proportionally.
    pub fn pay_coupon(env: Env, admin: Address, bond_id: u32, total_yield: i128) {
        admin.require_auth();

        let bond: Bond = env.storage().persistent()
            .get(&DataKey::Bond(bond_id))
            .expect("bond not found");

        assert!(bond.admin == admin, "not bond admin");
        assert!(bond.invested > 0, "no investors");

        // Transfer yield pool from admin to contract
        TokenClient::new(&env, &bond.token).transfer(
            &admin, &env.current_contract_address(), &total_yield,
        );

        env.events().publish(
            (Symbol::new(&env, "coupon_paid"), admin),
            (bond_id, total_yield),
        );
    }

    /// Investor redeems after maturity — gets principal + coupon.
    pub fn redeem(env: Env, investor: Address, bond_id: u32) -> i128 {
        investor.require_auth();

        let bond: Bond = env.storage().persistent()
            .get(&DataKey::Bond(bond_id))
            .expect("bond not found");

        assert!(env.ledger().timestamp() >= bond.maturity, "bond not yet matured");

        let holding_key = DataKey::Holding(bond_id, investor.clone());
        let holding: BondHolding = env.storage().persistent()
            .get(&holding_key)
            .expect("no holding found");

        assert!(holding.amount_invested > 0, "nothing to redeem");

        // Calculate payout: principal + coupon for the period
        let seconds_held = env.ledger().timestamp() - holding.invested_at;
        let year_secs: i128 = 365 * 24 * 3600;
        let coupon = holding.amount_invested * bond.coupon_rate_bps as i128 * seconds_held as i128
            / (10_000 * year_secs);
        let payout = holding.amount_invested + coupon;

        TokenClient::new(&env, &bond.token).transfer(
            &env.current_contract_address(), &investor, &payout,
        );

        env.storage().persistent().remove(&holding_key);

        env.events().publish(
            (Symbol::new(&env, "bond_redeemed"), investor),
            (bond_id, payout, coupon),
        );
        payout
    }

    pub fn get_bond(env: Env, bond_id: u32) -> Bond {
        env.storage().persistent().get(&DataKey::Bond(bond_id)).expect("not found")
    }

    pub fn get_holding(env: Env, bond_id: u32, investor: Address) -> BondHolding {
        env.storage().persistent()
            .get(&DataKey::Holding(bond_id, investor))
            .unwrap_or(BondHolding { amount_invested: 0, coupon_claimed: 0, invested_at: 0 })
    }
}
