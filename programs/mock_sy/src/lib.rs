#![allow(unexpected_cfgs)]
//! Mock SY program for the Exponent S-1 end-to-end test.
//!
//! NOT part of Exponent. Localnet-only test double, built and deployed by
//! `.github/workflows/s1-validation.yml`. The real SY wrappers are private
//! source, so this mock answers the exact CPI surface Exponent Core uses in
//! the tested flows:
//!
//!   [1]  mint_sy          -> NOT used by the tested flows (error)
//!   [2]  redeem_sy        -> NOT used by the tested flows (error)
//!   [3]  init personal account -> no-op OK (Core calls it in vault/market init)
//!   [5]  deposit_sy       -> returns SyState { exchange_rate: 1.0, emission_indexes: [] }
//!   [6]  withdraw_sy      -> returns SyState (same; not used by the tested flows)
//!   [7]  get_sy_state     -> returns SyState
//!   [8]  claim_emission   -> NOT used by the tested flows (error)
//!   [10] get_position     -> NOT used by the tested flows (error)
//!
//! What the mock does NOT do (and why that is fine):
//! - It does NOT move any tokens. Core itself transfers SY depositor ->
//!   escrow via the SPL Token program *before* the deposit CPI (see
//!   strip.rs, market_two_init.rs, deposit_liquidity.rs), so the mock only
//!   needs to answer the state query. The test's "SY taken" assertion is
//!   measured on the real token accounts, not on the mock.
//! - It does NOT model yield, emissions, or a changing exchange rate. The
//!   1.0 rate means 1 SY strips to exactly 1 PT + 1 YT, which is the
//!   neutral case for the S-1 loss mechanism: the loss is in the LP math
//!   (add_liquidity), not in the SY rate. A real SY wrapper with a rate
//!   != 1.0 would change the PT/SY amounts, not the zero-LP outcome.
//! - It does NOT verify the signer seeds or the passed accounts. Core
//!   invokes it with invoke_signed (vault/market PDA); the mock ignores
//!   the account list entirely.
//!
//! Consequence for the S-1 verdict: a PASS here proves the *handler* path
//! (init -> strip -> market init -> drain -> deposit with supply 0 takes
//! the full SY and mints 0 LP). It does NOT prove anything about a real SY
//! wrapper's behaviour. That limitation is inherent — the real wrappers
//! are closed source — and is stated in the test file and the results.

use borsh::BorshSerialize;
use precise_number::Number;
use solana_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program::set_return_data,
    program_error::ProgramError,
    pubkey::Pubkey,
};
use sy_common::SyState;

/// The neutral SY state: 1 SY == 1 unit of underlying, no emissions.
fn sy_state_one() -> SyState {
    SyState {
        exchange_rate: Number::ONE,
        emission_indexes: Vec::new(),
    }
}

fn process_instruction(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if data.is_empty() {
        msg!("mock_sy: empty instruction data");
        return Err(ProgramError::InvalidInstructionData);
    }
    match data[0] {
        // cpi_init_sy_personal_account: no-op, the "personal account" is
        // just the vault/market escrow token account, which Core creates.
        3 => {
            msg!("mock_sy: init personal account (no-op)");
            Ok(())
        }
        // cpi_deposit_sy / cpi_withdraw_sy / cpi_get_sy_state:
        // answer with the neutral state.
        5 | 6 | 7 => {
            let state = sy_state_one();
            let bytes = state.try_to_vec().map_err(|e| {
                msg!("mock_sy: serialize failed: {}", e);
                ProgramError::BorshIoError(e.to_string())
            })?;
            set_return_data(&bytes);
            msg!("mock_sy: returning SyState exchange_rate=1.0, emissions=[]");
            Ok(())
        }
        other => {
            msg!("mock_sy: unsupported discriminator {}", other);
            Err(ProgramError::InvalidInstructionData)
        }
    }
}

entrypoint!(process_instruction);
