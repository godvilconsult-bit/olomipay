//! OlomiPay Chama — Rotating Savings Group (ROSCA) Soroban Contract
//!
//! Enforces fairness in a traditional East African "chama" where members
//! contribute monthly and one member receives the full pot each round.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype,
    token::Client as TokenClient,
    Address, Env, Map, String, Symbol, Vec, vec,
};

#[contracttype]
#[derive(Clone, PartialEq)]
pub enum ChamaStatus {
    Forming,
    Active,
    Completed,
    Paused,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ChamaState {
    pub name:                        String,
    pub admin:                       Address,
    pub token:                       Address,
    pub members:                     Vec<Address>,
    pub contribution_amount:         i128,
    pub frequency_days:              u32,
    pub current_round:               u32,
    pub current_recipient_index:     u32,
    pub next_contribution_due:       u64,
    pub total_contributed_this_round: i128,
    pub status:                      ChamaStatus,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Chama(u32),        // chama_id → ChamaState
    Contributed(u32, Address), // (chama_id, member) → bool this round
    Counter,           // next chama_id
}

#[contract]
pub struct ChamaContract;

#[contractimpl]
impl ChamaContract {
    /// Create a new chama group.
    pub fn create_chama(
        env:                 Env,
        admin:               Address,
        name:                String,
        token:               Address,
        contribution_amount: i128,
        members:             Vec<Address>,
        frequency_days:      u32,
    ) -> u32 {
        admin.require_auth();
        assert!(members.len() >= 2, "need at least 2 members");
        assert!(contribution_amount > 0, "contribution must be positive");

        let id: u32 = env.storage().instance().get(&DataKey::Counter).unwrap_or(0);
        let next_due = env.ledger().timestamp() + frequency_days as u64 * 86_400;

        let state = ChamaState {
            name,
            admin: admin.clone(),
            token,
            members,
            contribution_amount,
            frequency_days,
            current_round:                   0,
            current_recipient_index:         0,
            next_contribution_due:           next_due,
            total_contributed_this_round:    0,
            status:                          ChamaStatus::Active,
        };

        env.storage().persistent().set(&DataKey::Chama(id), &state);
        env.storage().persistent().extend_ttl(&DataKey::Chama(id), 6_307_200, 6_307_200);
        env.storage().instance().set(&DataKey::Counter, &(id + 1));

        env.events().publish((Symbol::new(&env, "chama_created"), admin), (id, frequency_days));
        id
    }

    /// Member contributes their share for the current round.
    pub fn contribute(env: Env, chama_id: u32, member: Address) {
        member.require_auth();

        let mut state: ChamaState = env.storage().persistent()
            .get(&DataKey::Chama(chama_id))
            .expect("chama not found");

        assert!(state.status == ChamaStatus::Active, "chama not active");

        // Verify member belongs to chama
        let is_member = state.members.iter().any(|m| m == member);
        assert!(is_member, "not a member of this chama");

        // Check not already contributed this round
        let contrib_key = DataKey::Contributed(chama_id, member.clone());
        assert!(
            !env.storage().persistent().has(&contrib_key),
            "already contributed this round"
        );

        // Transfer contribution to contract
        TokenClient::new(&env, &state.token).transfer(
            &member,
            &env.current_contract_address(),
            &state.contribution_amount,
        );

        env.storage().persistent().set(&contrib_key, &true);
        env.storage().persistent().extend_ttl(&contrib_key, 6_307_200, 6_307_200);

        state.total_contributed_this_round += state.contribution_amount;
        env.storage().persistent().set(&DataKey::Chama(chama_id), &state);

        env.events().publish(
            (Symbol::new(&env, "contributed"), member),
            (chama_id, state.contribution_amount, state.current_round),
        );
    }

    /// Trigger payout to current round's recipient. Called by admin.
    pub fn payout(env: Env, chama_id: u32) {
        let mut state: ChamaState = env.storage().persistent()
            .get(&DataKey::Chama(chama_id))
            .expect("chama not found");

        state.admin.require_auth();
        assert!(state.status == ChamaStatus::Active, "chama not active");

        let total_pot = state.contribution_amount * state.members.len() as i128;
        assert!(
            state.total_contributed_this_round >= total_pot,
            "not all members have contributed"
        );

        let recipient = state.members.get(state.current_recipient_index).unwrap();

        TokenClient::new(&env, &state.token).transfer(
            &env.current_contract_address(),
            &recipient,
            &total_pot,
        );

        // Clear contribution flags for next round
        for member in state.members.iter() {
            let key = DataKey::Contributed(chama_id, member.clone());
            if env.storage().persistent().has(&key) {
                env.storage().persistent().remove(&key);
            }
        }

        env.events().publish(
            (Symbol::new(&env, "chama_payout"), recipient.clone()),
            (chama_id, total_pot, state.current_round),
        );

        state.current_round               += 1;
        state.total_contributed_this_round = 0;
        state.current_recipient_index      = (state.current_recipient_index + 1)
            % state.members.len() as u32;
        state.next_contribution_due       += state.frequency_days as u64 * 86_400;

        // Complete when all members have received
        if state.current_round >= state.members.len() as u32 {
            state.status = ChamaStatus::Completed;
        }

        env.storage().persistent().set(&DataKey::Chama(chama_id), &state);
    }

    pub fn get_chama(env: Env, chama_id: u32) -> ChamaState {
        env.storage().persistent()
            .get(&DataKey::Chama(chama_id))
            .expect("chama not found")
    }

    pub fn has_contributed(env: Env, chama_id: u32, member: Address) -> bool {
        env.storage().persistent().has(&DataKey::Contributed(chama_id, member))
    }
}
