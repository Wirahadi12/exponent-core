/**
 * S-1 end-to-end test (Exponent Core, localnet).
 *
 * Proves or kills S-1 by execution:
 *   add_liquidity with market_total_lp == 0 yields lp_out = 0, so a
 *   deposit_liquidity with min_lp_out == 0 takes the caller's full SY
 *   (and PT) and mints 0 LP — a silent loss of the deposited tokens.
 *
 * Flow:
 *   1. admin program: initialize_admin + add_principle_admin (HotAdmin)
 *   2. create SY mint (classic Token, 6 decimals), mint 20M SY to payer
 *   3. create address lookup table holding [market escrow_sy, vault escrow_sy]
 *   4. initialize_vault (mock SY program, rate 1.0)
 *   5. strip 1,200,000 SY -> 1,200,000 PT + 1,200,000 YT
 *   6. init_market_two (pt_init = sy_init = 1,000,000) -> 1,000,000 LP
 *   7. CONTROL: deposit 100,000/100,000 -> LP minted > 0 (harness sanity)
 *   8. burn ALL LP -> mint_lp supply 0
 *   9. S-1: deposit 100,000/100,000, min_lp_out = 0
 *      EXPECTED (S-1 true): tx succeeds, payer SY -100,000 exactly,
 *      market escrow SY +100,000 exactly, payer LP unchanged (0),
 *      mint_lp supply still 0, event lp_out == 0.
 *      If instead the tx reverts or LP > 0 is minted, S-1 is DEAD and the
 *      test fails with the observed numbers.
 *
 * What this does NOT prove: anything about a real SY wrapper. The mock
 * (programs/mock_sy) answers the SY CPI with a fixed 1.0 exchange rate
 * and no emissions; see its header comment for the exact limits.
 *
 * Known assumptions (see s1-results.md if the run fails on one of these):
 * - Anchor IDL encodes precise_number::Number (tuple struct [u64;4],
 *   1e12 precision, ONE = [1_000_000_000_000, 0, 0, 0]) as an object
 *   { "0": [BN, BN, BN, BN] }. If the coder rejects it, try the array
 *   form [BN, BN, BN, BN].
 * - anchor keys sync aligns Core/Admin declare_ids to fresh local
 *   keypairs; the test reads the admin keypair from
 *   target/deploy/exponent_admin-keypair.json (uber_admin signer).
 * - The Metaplex Token Metadata program is cloned onto the local
 *   validator by the workflow (vault init creates PT metadata).
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ExponentCore } from "../target/types/exponent_core";
import { ExponentAdmin } from "../target/types/exponent_admin";
import {
  AddressLookupTableProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  burn,
  createMint,
  getAccount,
  getAssociatedTokenAddress,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { expect } from "chai";
import * as fs from "fs";
import BN from "bn.js";

// Mock SY program id (programs/mock_sy/mock_sy-keypair.json, generated
// locally; throwaway localnet-only keypair, committed to the fork).
const MOCK_SY_PROGRAM_ID = new PublicKey(
  "9VDhEFjTeMVTxSkGuRtCWqFTHgdK9uNRHCTAf14p5cbq"
);
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

const SY_DECIMALS = 6;
const sy = (n: number): number => n * 1_000_000; // base units per SY
const STRIP_AMT = sy(1_200_000);
const PT_INIT = sy(1_000_000);
const SY_INIT = sy(1_000_000);
const CONTROL_AMT = sy(100_000);
const S1_AMT = sy(100_000);

const START_TS_OFFSET = 3600; // vault starts 1h ago
const DURATION = 365 * 24 * 3600; // 1 year
const SEED_ID = 1;

/** precise_number::Number::ONE (1e12 fixed point) as the IDL expects it. */
function numberOne(): any {
  return {
    "0": [new BN(1_000_000_000_000), new BN(0), new BN(0), new BN(0)],
  };
}

function cpiAccounts(depositAltIndex: number): any {
  return {
    getSyState: [],
    depositSy: [
      { altIndex: depositAltIndex, isSigner: false, isWritable: true },
    ],
    withdrawSy: [],
    claimEmission: [],
    getPositionState: [],
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("S-1 zero LP supply", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;
  const core = anchor.workspace.ExponentCore as Program<ExponentCore>;
  const adminProg = anchor.workspace.ExponentAdmin as Program<ExponentAdmin>;

  let adminKeypair: Keypair;
  let adminPda: PublicKey;
  let mintSy: PublicKey;
  let payerSyAta: PublicKey;

  const vault = Keypair.generate();
  let authorityPda: PublicKey;
  let mintPtPda: PublicKey;
  let mintYtPda: PublicKey;
  let escrowYtPda: PublicKey;
  let vaultEscrowSy: PublicKey;
  let yieldPositionPda: PublicKey;
  let metadataPda: PublicKey;

  let marketPda: PublicKey;
  let mintLpPda: PublicKey;
  let marketEscrowPt: PublicKey;
  let marketEscrowSy: PublicKey;
  let marketEscrowLp: PublicKey;
  let payerPtAta: PublicKey;
  let payerYtAta: PublicKey;
  let payerLpAta: PublicKey;
  let altAddress: PublicKey;

  it("sets up admin, SY mint, vault and lookup table", async () => {
    await provider.connection.requestAirdrop(
      payer.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await sleep(1000);

    // --- admin program: uber_admin is the admin program's own keypair ---
    adminKeypair = Keypair.fromSecretKey(
      Uint8Array.from(
        JSON.parse(
          fs.readFileSync(
            "target/deploy/exponent_admin-keypair.json",
            "utf8"
          )
        )
      )
    );
    [adminPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("admin")],
      adminProg.programId
    );
    await adminProg.methods
      .initializeAdmin()
      .accounts({
        adminAccount: adminPda,
        feePayer: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    await adminProg.methods
      .addPrincipleAdmin({ hotAdmin: {} })
      .accounts({
        adminAccount: adminPda,
        newAdmin: payer.publicKey,
        feePayer: payer.publicKey,
        uberAdmin: adminKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminKeypair])
      .rpc();
    console.log("admin ready, hot admin =", payer.publicKey.toBase58());

    // --- SY mint (classic Token, 6 decimals) ---
    mintSy = await createMint(
      connection,
      payer,
      payer.publicKey,
      null,
      SY_DECIMALS
    );
    const payerSy = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mintSy,
      payer.publicKey
    );
    payerSyAta = payerSy.address;
    await mintTo(
      connection,
      payer,
      mintSy,
      payerSyAta,
      payer.publicKey,
      sy(20_000_000)
    );
    console.log("SY mint =", mintSy.toBase58());

    // --- derive vault PDAs ---
    [authorityPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("authority"), vault.publicKey.toBuffer()],
      core.programId
    );
    [mintPtPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("mint_pt"), vault.publicKey.toBuffer()],
      core.programId
    );
    [mintYtPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("mint_yt"), vault.publicKey.toBuffer()],
      core.programId
    );
    [escrowYtPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_yt"), vault.publicKey.toBuffer()],
      core.programId
    );
    vaultEscrowSy = await getAssociatedTokenAddress(mintSy, authorityPda);
    [yieldPositionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("yield_position"),
        vault.publicKey.toBuffer(),
        authorityPda.toBuffer(),
      ],
      core.programId
    );
    [metadataPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mintPtPda.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    );

    // --- derive market PDAs ---
    [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), vault.publicKey.toBuffer(), Buffer.from([SEED_ID])],
      core.programId
    );
    [mintLpPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("mint_lp"), marketPda.toBuffer()],
      core.programId
    );
    [marketEscrowPt] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_pt"), marketPda.toBuffer()],
      core.programId
    );
    [marketEscrowSy] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_sy"), marketPda.toBuffer()],
      core.programId
    );
    [marketEscrowLp] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_lp"), marketPda.toBuffer()],
      core.programId
    );
    payerLpAta = await getAssociatedTokenAddress(mintLpPda, payer.publicKey);

    // --- address lookup table: [0] market escrow_sy, [1] vault escrow_sy ---
    const recentSlot = await connection.getSlot();
    const [createIx, alt] =
      AddressLookupTableProgram.createLookupTable({
        authority: payer.publicKey,
        payer: payer.publicKey,
        recentSlot,
      });
    altAddress = alt;
    const extendIx = AddressLookupTableProgram.extendLookupTable({
      payer: payer.publicKey,
      authority: payer.publicKey,
      lookupTable: altAddress,
      addresses: [marketEscrowSy, vaultEscrowSy],
    });
    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(createIx)
    );
    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(extendIx)
    );
    await sleep(2000); // let the table activate
    const table = await connection.getAddressLookupTable(altAddress);
    expect(table.value).to.not.be.null;
    expect(table.value.state.addresses.map((a) => a.toBase58())).to.include(
      marketEscrowSy.toBase58()
    );
    expect(table.value.state.addresses.map((a) => a.toBase58())).to.include(
      vaultEscrowSy.toBase58()
    );
    console.log("ALT ready:", altAddress.toBase58());

    // --- initialize_vault ---
    const startTs = Math.floor(Date.now() / 1000) - START_TS_OFFSET;
    await core.methods
      .initializeVault(
        startTs,
        DURATION,
        0, // interest_bps_fee
        cpiAccounts(1), // vault deposit_sy -> ALT[1] = vault escrow_sy
        1, // min_op_size_strip
        1, // min_op_size_merge
        "S1 Test PT",
        "S1PT",
        ""
      )
      .accounts({
        payer: payer.publicKey,
        admin: adminPda,
        authority: authorityPda,
        vault: vault.publicKey,
        mintPt: mintPtPda,
        mintYt: mintYtPda,
        escrowYt: escrowYtPda,
        escrowSy: vaultEscrowSy,
        mintSy,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        treasuryTokenAccount: payerSyAta,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        syProgram: MOCK_SY_PROGRAM_ID,
        addressLookupTable: altAddress,
        yieldPosition: yieldPositionPda,
        metadata: metadataPda,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: vaultEscrowSy, isWritable: true, isSigner: false },
      ])
      .signers([vault])
      .rpc();
    console.log("vault ready:", vault.publicKey.toBase58());
  });

  it("strips SY into PT + YT at rate 1.0", async () => {
    const pt = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mintPtPda,
      payer.publicKey
    );
    payerPtAta = pt.address;
    const yt = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mintYtPda,
      payer.publicKey
    );
    payerYtAta = yt.address;

    await core.methods
      .strip(new BN(STRIP_AMT))
      .accounts({
        depositor: payer.publicKey,
        authority: authorityPda,
        vault: vault.publicKey,
        sySrc: payerSyAta,
        escrowSy: vaultEscrowSy,
        ytDst: payerYtAta,
        ptDst: payerPtAta,
        mintYt: mintYtPda,
        mintPt: mintPtPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        addressLookupTable: altAddress,
        syProgram: MOCK_SY_PROGRAM_ID,
        yieldPosition: yieldPositionPda,
      })
      .rpc();

    const ptBal = (await getAccount(connection, payerPtAta)).amount;
    const ytBal = (await getAccount(connection, payerYtAta)).amount;
    console.log("after strip: PT =", ptBal.toString(), "YT =", ytBal.toString());
    expect(ptBal).to.equal(BigInt(STRIP_AMT));
    expect(ytBal).to.equal(BigInt(STRIP_AMT));
  });

  it("inits market (1,000,000 PT + 1,000,000 SY -> 1,000,000 LP)", async () => {
    await core.methods
      .initMarketTwo(
        0, // ln_fee_rate_root
        1, // rate_scalar_root
        1, // init_rate_anchor
        numberOne(), // sy_exchange_rate = 1.0
        new BN(PT_INIT),
        new BN(SY_INIT),
        0, // fee_treasury_sy_bps
        cpiAccounts(0), // market deposit_sy -> ALT[0] = market escrow_sy
        SEED_ID
      )
      .accounts({
        payer: payer.publicKey,
        adminSigner: payer.publicKey,
        market: marketPda,
        vault: vault.publicKey,
        mintSy,
        mintPt: mintPtPda,
        mintLp: mintLpPda,
        escrowPt: marketEscrowPt,
        escrowSy: marketEscrowSy,
        escrowLp: marketEscrowLp,
        ptSrc: payerPtAta,
        sySrc: payerSyAta,
        lpDst: payerLpAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        syProgram: MOCK_SY_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        addressLookupTable: altAddress,
        admin: adminPda,
        tokenTreasuryFeeSy: payerSyAta,
      })
      .remainingAccounts([
        { pubkey: marketEscrowSy, isWritable: true, isSigner: false },
      ])
      .rpc();

    const lpBal = (await getAccount(connection, payerLpAta)).amount;
    const supply = (await getMint(connection, mintLpPda)).supply;
    console.log("after market init: LP =", lpBal.toString(), "supply =", supply.toString());
    expect(lpBal).to.equal(BigInt(PT_INIT));
    expect(supply).to.equal(BigInt(PT_INIT));
  });

  it("CONTROL: normal deposit mints LP > 0", async () => {
    const lpBefore = (await getAccount(connection, payerLpAta)).amount;
    await core.methods
      .marketTwoDepositLiquidity(
        new BN(CONTROL_AMT),
        new BN(CONTROL_AMT),
        new BN(0)
      )
      .accounts({
        depositor: payer.publicKey,
        market: marketPda,
        tokenPtSrc: payerPtAta,
        tokenSySrc: payerSyAta,
        tokenPtEscrow: marketEscrowPt,
        tokenSyEscrow: marketEscrowSy,
        tokenLpDst: payerLpAta,
        mintLp: mintLpPda,
        addressLookupTable: altAddress,
        tokenProgram: TOKEN_PROGRAM_ID,
        syProgram: MOCK_SY_PROGRAM_ID,
      })
      .rpc();
    const lpAfter = (await getAccount(connection, payerLpAta)).amount;
    const minted = lpAfter - lpBefore;
    console.log("CONTROL: LP minted =", minted.toString());
    expect(minted > 0n).to.equal(true);
  });

  it("drains LP supply to zero via SPL burn", async () => {
    const lpBal = (await getAccount(connection, payerLpAta)).amount;
    console.log("LP to burn =", lpBal.toString());
    expect(lpBal > 0n).to.equal(true);
    await burn(
      connection,
      payer,
      payerLpAta,
      mintLpPda,
      payer.publicKey,
      lpBal
    );
    const supply = (await getMint(connection, mintLpPda)).supply;
    const lpAfter = (await getAccount(connection, payerLpAta)).amount;
    console.log("after burn: supply =", supply.toString(), "payer LP =", lpAfter.toString());
    expect(supply).to.equal(0n);
    expect(lpAfter).to.equal(0n);
  });

  it("S-1: deposit with zero LP supply takes SY and mints 0 LP", async () => {
    const syBefore = (await getAccount(connection, payerSyAta)).amount;
    const lpBefore = (await getAccount(connection, payerLpAta)).amount;
    const escrowSyBefore = (await getAccount(connection, marketEscrowSy)).amount;
    const supplyBefore = (await getMint(connection, mintLpPda)).supply;
    expect(supplyBefore).to.equal(0n);
    expect(lpBefore).to.equal(0n);

    const sig = await core.methods
      .marketTwoDepositLiquidity(new BN(S1_AMT), new BN(S1_AMT), new BN(0))
      .accounts({
        depositor: payer.publicKey,
        market: marketPda,
        tokenPtSrc: payerPtAta,
        tokenSySrc: payerSyAta,
        tokenPtEscrow: marketEscrowPt,
        tokenSyEscrow: marketEscrowSy,
        tokenLpDst: payerLpAta,
        mintLp: mintLpPda,
        addressLookupTable: altAddress,
        tokenProgram: TOKEN_PROGRAM_ID,
        syProgram: MOCK_SY_PROGRAM_ID,
      })
      .rpc();

    const syAfter = (await getAccount(connection, payerSyAta)).amount;
    const lpAfter = (await getAccount(connection, payerLpAta)).amount;
    const escrowSyAfter = (await getAccount(connection, marketEscrowSy)).amount;
    const supplyAfter = (await getMint(connection, mintLpPda)).supply;

    // Best-effort: read lp_out from the emitted DepositLiquidityEvent.
    let eventLpOut: string | null = null;
    try {
      const tx = await connection.getTransaction(sig, {
        maxSupportedTransactionVersion: 0,
      });
      const logs = tx?.meta?.logMessages ?? [];
      const parser = new anchor.EventParser(core.programId, core.coder);
      parser.parseLogs(logs, (event) => {
        if (event.name === "DepositLiquidityEvent") {
          eventLpOut = (event.data as any).lpOut.toString();
        }
      });
    } catch (e) {
      console.log("event parse skipped:", (e as Error).message);
    }

    console.log("=== S-1 VERDICT ===");
    console.log("tx:", sig);
    console.log("payer SY before/after:", syBefore.toString(), "->", syAfter.toString(),
      "delta:", (syBefore - syAfter).toString());
    console.log("escrow SY before/after:", escrowSyBefore.toString(), "->", escrowSyAfter.toString(),
      "delta:", (escrowSyAfter - escrowSyBefore).toString());
    console.log("payer LP before/after:", lpBefore.toString(), "->", lpAfter.toString());
    console.log("mint_lp supply before/after:", supplyBefore.toString(), "->", supplyAfter.toString());
    console.log("event lp_out:", eventLpOut);
    console.log("S-1 CONFIRMED = tx succeeded AND SY taken in full AND LP minted == 0");

    // The S-1 assertions. If the tx had reverted, .rpc() above would have
    // thrown and the test would fail there (S-1 dead by revert).
    expect(syBefore - syAfter).to.equal(BigInt(S1_AMT));
    expect(escrowSyAfter - escrowSyBefore).to.equal(BigInt(S1_AMT));
    expect(lpAfter).to.equal(0n);
    expect(supplyAfter).to.equal(0n);
    if (eventLpOut !== null) {
      expect(eventLpOut).to.equal("0");
    }
  });
});
