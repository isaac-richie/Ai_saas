# XCM-AI StableVault Architecture

This document captures the full build architecture for a **fully functioning** MVP on Polkadot Hub with:
- An on-chain XCM execution path (Hub -> Asset Hub).
- A WETH9-style wrapped native token (WPAS) used as collateral.
- A SCALE-encoder script to generate valid `destination` and `message` bytes for XCM.

The goal is to demonstrate an end-to-end, verifiable flow:
`User -> Vault contract -> XCM precompile -> Asset Hub result`.

## Scope (MVP)
- **Chain**: Polkadot Hub testnet (EVM).
- **XCM destination**: Asset Hub (parachain ID 1000).
- **Collateral**: WETH9-style wrapped PAS (WPAS) deployed by us for determinism.
- **AI**: Off-chain service decides when to trigger a rebalance, not required for protocol correctness.

## Components
1. **WPAS (Wrapped PAS) contract**
   - Standard WETH9 pattern (deposit native, mint ERC-20; withdraw burns and sends native).
   - Deployed on Hub testnet, address stored in config.

2. **XCM StableVault contract**
   - Accepts WPAS deposits and mints `XAIS` (demo stable token).
   - Calls the XCM precompile to execute a message to Asset Hub.
   - Uses `weighMessage` then `execute` on the precompile.

3. **SCALE Encoder Script**
   - TypeScript script using `polkadot.js` types to build:
     - `VersionedMultiLocation` for destination (parents=1, X1(Parachain(1000))).
     - `VersionedXcm` message (e.g., `WithdrawAsset -> BuyExecution -> DepositAsset`).
   - Outputs the hex bytes used in the Solidity call.

4. **AI Orchestrator (off-chain)**
   - Reads risk metrics.
   - When rebalance is required, sends tx to `XCMStableVault.executeXcm(...)`.
   - Can be a simple Node/Express service for MVP.

5. **Frontend (Next.js)**
   - Wallet connect, WPAS wrap/unwrap, deposit, and trigger XCM.
   - Displays on-chain event receipt and beneficiary update verification.

## On-Chain Contracts

### 1) WPAS (WETH9-style)
Purpose: deterministic, verifiable ERC-20 collateral on Hub testnet.

Key functions:
- `deposit()` payable: mints 1:1 WPAS for native PAS.
- `withdraw(uint256)`: burns WPAS and sends native PAS.

Notes:
- Use a well-known WETH9 implementation (minimal and audited pattern).
- Record deployed address in a config file and in frontend env.

### 2) XCMStableVault
Purpose: accept collateral and execute a valid XCM message.

Core responsibilities:
- `depositCollateral(uint256 amount)`: transferFrom user WPAS into vault.
- `executeXcm(bytes message)`: calls XCM precompile with weighed message.
- `aiRebalance(bytes message)`: optional restricted entry point for AI trigger.

Hard requirements:
- Use XCM precompile at `0x00000000000000000000000000000000000a0000`.
- Call `weighMessage(message)` before `execute(message, weight)`.

## XCM Message Encoding Strategy
We do **not** hand-encode SCALE. We **always** generate it via a script.

### Destination (Asset Hub)
- `parents = 1`
- `interior = X1(Parachain(1000))`

### Message (minimal transfer)
Use a known, working pattern:
- `WithdrawAsset`
- `BuyExecution`
- `DepositAsset` to a beneficiary account on Asset Hub

If the transfer is not required for the MVP, you can still use a simpler
message that produces a verifiable side-effect. The only hard requirement
is that the precompile successfully executes and the result is observable.

## SCALE Encoder Script (TypeScript)
Location suggestion: `scripts/xcm-build.ts`

Inputs:
- Asset amount
- Beneficiary account (SS58 address on Asset Hub)

Outputs:
- `destinationHex`
- `messageHex`

The frontend or deploy script can load these hex bytes to call `executeXcm`.

## Execution Flow

### Flow A: User deposit
1. User wraps PAS into WPAS (deposit).
2. User approves WPAS to `XCMStableVault`.
3. User calls `depositCollateral` in the vault.
4. Vault mints `XAIS` (demo stable token).

### Flow B: AI-triggered XCM
1. AI service decides rebalance is required.
2. AI service calls encoder script to produce `destination` and `message`.
3. AI service sends tx to `executeXcm(message)`.
4. Contract weighs message and executes via precompile.
5. Asset Hub receives the message; user verifies the result.

## Observability
You must be able to show:
- The transaction calling `executeXcm` succeeded on Hub.
- The expected effect appears on Asset Hub (e.g., beneficiary balance change).

## Suggested Repo Layout
- `contracts/WPAS.sol`
- `contracts/XCMStableVault.sol`
- `scripts/xcm-build.ts`
- `scripts/deploy.ts`
- `frontend/` (Next.js app)
- `docs/ARCHITECTURE.md` (this document, or keep at repo root)

## Risks and Mitigations
- SCALE encoding mistakes: generate bytes via `polkadot.js` only.
- XCM weight mismatch: always `weighMessage` then `execute`.
- Asset Hub transfer fails: start with a known, minimal message; verify step-by-step.

## Milestones (4-5 days)
1. Deploy WPAS and vault, run local tests.
2. Generate valid XCM bytes and execute once.
3. Wire frontend flow and AI trigger.
4. Demo: deposit -> execute XCM -> verify Asset Hub result.

## Open Items (to confirm)
- Final RPC endpoints to use in production and frontend.
- Beneficiary address on Asset Hub for transfer verification.
- Exact XCM message type for the MVP.

