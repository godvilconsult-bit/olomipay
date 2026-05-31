//! OlomiPay Peer Lending — Soroban Smart Contract
//!
//! Lenders list USDC loans at set interest rates.
//! Borrowers put up 10% collateral. Defaulters lose collateral.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype,
    token::Client as TokenClient,
    Address, Env, Symbol,
};

#[contracttype]
#[derive(Clone, PartialEq)]
pub enum LoanStatus {
    Open,
    Funded,
    Repaid,
    Defaulted,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct LoanListing {
    pub lender:           Address,
    pub amount:           i128,
    pub interest_bps:     u32,     // e.g. 500 = 5%
    pub duration_days:    u32,     // 7, 14, or 30
    pub collateral_bps:   u32,     // 1000 = 10%
    pub status:           LoanStatus,
    pub borrower:         Option<Address>,
    pub collateral_held:  i128,
    pub funded_at:        u64,
    pub due_at:           u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    Loan(u32),
    Counter,
}

#[contract]
pub struct LendingContract;

#[contractimpl]
impl LendingContract {
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Counter, &0u32);
        env.storage().instance().extend_ttl(100_000, 100_000);
    }

    /// Lender lists a loan offer.
    pub fn list_loan(
        env:          Env,
        lender:       Address,
        amount:       i128,
        interest_bps: u32,
        duration_days: u32,
    ) -> u32 {
        lender.require_auth();
        assert!(amount > 0, "amount must be positive");
        assert!(interest_bps <= 2000, "interest cannot exceed 20%");
        assert!(
            duration_days == 7 || duration_days == 14 || duration_days == 30,
            "duration must be 7, 14, or 30 days"
        );

        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();

        // Lock lender's USDC in contract
        TokenClient::new(&env, &token).transfer(&lender, &env.current_contract_address(), &amount);

        let id: u32 = env.storage().instance().get(&DataKey::Counter).unwrap_or(0);
        let loan = LoanListing {
            lender: lender.clone(),
            amount,
            interest_bps,
            duration_days,
            collateral_bps: 1000, // 10% collateral required
            status:         LoanStatus::Open,
            borrower:       None,
            collateral_held: 0,
            funded_at:      0,
            due_at:         0,
        };

        env.storage().persistent().set(&DataKey::Loan(id), &loan);
        env.storage().persistent().extend_ttl(&DataKey::Loan(id), 6_307_200, 6_307_200);
        env.storage().instance().set(&DataKey::Counter, &(id + 1));

        env.events().publish((Symbol::new(&env, "loan_listed"), lender), (id, amount, interest_bps));
        id
    }

    /// Borrower requests a loan by posting collateral.
    pub fn request_loan(env: Env, borrower: Address, loan_id: u32) {
        borrower.require_auth();

        let mut loan: LoanListing = env.storage().persistent()
            .get(&DataKey::Loan(loan_id))
            .expect("loan not found");

        assert!(loan.status == LoanStatus::Open, "loan not available");
        assert!(loan.lender != borrower, "cannot borrow own loan");

        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let collateral = loan.amount * loan.collateral_bps as i128 / 10_000;

        // Borrower posts collateral
        TokenClient::new(&env, &token).transfer(&borrower, &env.current_contract_address(), &collateral);

        let now = env.ledger().timestamp();
        loan.borrower       = Some(borrower.clone());
        loan.collateral_held = collateral;
        loan.status         = LoanStatus::Funded;
        loan.funded_at      = now;
        loan.due_at         = now + loan.duration_days as u64 * 86_400;

        // Transfer loan amount to borrower
        TokenClient::new(&env, &token).transfer(&env.current_contract_address(), &borrower, &loan.amount);

        env.storage().persistent().set(&DataKey::Loan(loan_id), &loan);
        env.events().publish(
            (Symbol::new(&env, "loan_funded"), borrower),
            (loan_id, loan.amount, collateral),
        );
    }

    /// Borrower repays principal + interest. Gets collateral back.
    pub fn repay_loan(env: Env, borrower: Address, loan_id: u32) {
        borrower.require_auth();

        let mut loan: LoanListing = env.storage().persistent()
            .get(&DataKey::Loan(loan_id))
            .expect("loan not found");

        assert!(loan.status == LoanStatus::Funded, "loan not active");
        assert!(loan.borrower.clone().unwrap() == borrower, "not the borrower");

        let token:    Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let interest  = loan.amount * loan.interest_bps as i128 / 10_000;
        let repayment = loan.amount + interest;

        // Borrower repays principal + interest to lender
        TokenClient::new(&env, &token).transfer(&borrower, &loan.lender, &repayment);

        // Return collateral to borrower
        TokenClient::new(&env, &token).transfer(
            &env.current_contract_address(),
            &borrower,
            &loan.collateral_held,
        );

        loan.status = LoanStatus::Repaid;
        env.storage().persistent().set(&DataKey::Loan(loan_id), &loan);

        env.events().publish(
            (Symbol::new(&env, "loan_repaid"), borrower),
            (loan_id, repayment),
        );
    }

    /// Liquidate overdue loan — anyone can call after due_at.
    pub fn liquidate_loan(env: Env, loan_id: u32) {
        let mut loan: LoanListing = env.storage().persistent()
            .get(&DataKey::Loan(loan_id))
            .expect("loan not found");

        assert!(loan.status == LoanStatus::Funded, "loan not active");
        assert!(env.ledger().timestamp() > loan.due_at, "loan not yet due");

        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();

        // Send collateral to lender as compensation
        TokenClient::new(&env, &token).transfer(
            &env.current_contract_address(),
            &loan.lender,
            &loan.collateral_held,
        );

        loan.status = LoanStatus::Defaulted;
        env.storage().persistent().set(&DataKey::Loan(loan_id), &loan);

        env.events().publish(
            (Symbol::new(&env, "loan_defaulted"), loan.lender),
            (loan_id, loan.collateral_held),
        );
    }

    pub fn get_loan(env: Env, loan_id: u32) -> LoanListing {
        env.storage().persistent()
            .get(&DataKey::Loan(loan_id))
            .expect("loan not found")
    }
}
