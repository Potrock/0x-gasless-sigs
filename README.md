# Gasless Swap Minimum Reproduction

This is a minimal TypeScript reproduction of the gasless swap flow using the same setup as in `agent-fe-alpha`:
- **Pimlico** for bundler and paymaster services
- **Kernel** (via `permissionless` library) for ERC-7702 smart accounts
- **0x Gasless API** (direct integration) for gasless swap quotes and submission
- **viem** for Ethereum interactions

## Architecture

The script demonstrates the complete gasless swap flow:

1. **Setup** - Initialize EOA, public client, wallet client
2. **Smart Account** - Create a Kernel 7702 smart account with Pimlico
3. **Quote** - Fetch a firm gasless quote from 0x via agent-app
4. **Approval** - Handle token approval (either on-chain via smart account or via Permit)
5. **Sign** - Sign EIP-712 messages for approval (if Permit) and trade
6. **Submit** - Submit signed messages to 0x via agent-app
7. **Poll** - Poll for transaction confirmation status

## Prerequisites

1. **Pimlico API Key** - Sign up at [https://dashboard.pimlico.io](https://dashboard.pimlico.io)
2. **0x API Key** - Get from [https://0x.org/](https://0x.org/)
3. **Private Key** - An EOA with some tokens on Base (e.g., USDC)
4. **Node.js** - Version 18 or higher

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

3. Edit `.env` and fill in:
   - `PIMLICO_API_KEY` - Your Pimlico API key
   - `ZEROX_API_KEY` - Your 0x API key
   - `PRIVATE_KEY` - Your private key (with 0x prefix)
   - `BASE_RPC_URL` - (Optional) Custom Base RPC URL

## Configuration

Edit `index.ts` to customize the swap:

```typescript
// Swap config - Example: USDC -> USDT on Base
const SELL_TOKEN = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base
const BUY_TOKEN = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2"; // USDT on Base
const SELL_AMOUNT = "1"; // 1 USDC (in UI units)
const DECIMALS = 6; // USDC decimals
const SLIPPAGE_BPS = 100; // 1%
```

## Running

```bash
npm start
```

## What It Does

The script will:

1. Create a Kernel ERC-7702 smart account using your EOA
2. Fetch a gasless swap quote directly from 0x API
3. Handle token approvals:
   - If the token supports Permit: Sign an EIP-712 approval
   - Otherwise: Send an on-chain approval transaction via the smart account
4. Sign the trade EIP-712 message
5. Submit both signatures directly to 0x API
6. Poll every 2 seconds for transaction confirmation (up to 2 minutes)

## Expected Output

```
🚀 Gasless Swap Minimum Reproduction

================================================================================

📋 Step 1: Setting up account and clients
--------------------------------------------------------------------------------
✅ Account address: 0x...

📋 Step 2: Setting up Pimlico and Kernel Smart Account
--------------------------------------------------------------------------------
✅ Smart account address: 0x...

📋 Step 3: Fetching gasless quote
--------------------------------------------------------------------------------
Sell: 1 tokens (1000000 base units)
Sell token: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
Buy token: 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2
Slippage: 1%

📡 Fetching quote from 0x: https://api.0x.org/gasless/quote?...

✅ Quote received:
   Buy quantity: 999500
   Sell quantity: 1000000
   ZID: abc123
   Approval required: true

📋 Step 4: No approval needed (using Permit)

📋 Step 5: Signing approval EIP-712 (Permit)
--------------------------------------------------------------------------------
✅ Approval signature: 0x1234...

📋 Step 6: Signing trade EIP-712
--------------------------------------------------------------------------------
✅ Trade signature: 0x5678...

📋 Step 7: Submitting gasless trade
--------------------------------------------------------------------------------
📤 Submitting gasless trade to 0x: https://api.0x.org/gasless/submit
✅ Trade submitted!
   Trade hash: 0xabc...
   ZID: abc123

📋 Step 8: Polling for transaction status
--------------------------------------------------------------------------------
⏳ Attempt 1: Status = pending
⏳ Attempt 2: Status = pending
⏳ Attempt 3: Status = confirmed

✅ Transaction confirmed!
   TX Hash: 0xdef...

================================================================================
✅ Script completed!
```

## Troubleshooting

### "Failed to fetch quote: 422"
- Check that your `ZEROX_API_KEY` is valid
- Ensure your tokens are valid and supported on Base
- Verify your account has sufficient balance

### "Failed to initialize Pimlico client"
- Check that your `PIMLICO_API_KEY` is correct
- Verify that Pimlico supports Base chain

### "Transaction not confirmed after N attempts"
- The swap may still be processing
- Check the trade hash on a block explorer
- Try increasing `maxAttempts` in the script

### "Approval failed"
- Ensure your account has tokens to approve
- The smart account may need to be funded with a small amount of ETH first (for deployment)

## Key Files

- `index.ts` - Main script with complete gasless swap flow
- `package.json` - Dependencies (viem, permissionless, @noble/curves)
- `.env.example` - Environment variable template
- `tsconfig.json` - TypeScript configuration

## Dependencies

- **viem** (^2.31.6) - Ethereum library for transactions and encoding
- **permissionless** (^0.2.52) - Account abstraction library (Kernel + Pimlico)
- **@noble/curves** (^1.4.0) - ECDSA signature utilities
- **dotenv** (^16.4.5) - Environment variable management
- **tsx** (^4.7.0) - TypeScript execution

## Architecture Alignment

This script mirrors the implementation in `agent-fe-alpha` and `agent-app`:

| Component | Implementation |
|-----------|----------------|
| **Frontend** (`agent-fe-alpha`) | Uses React hooks, Privy wallet, and Wagmi |
| **Backend** (`agent-app`) | Proxies 0x API with Go client |
| **This Script** | Direct 0x API integration with TypeScript |

### Comparison Table

| Step | agent-fe-alpha | agent-app | This Script |
|------|----------------|-----------|-------------|
| Account abstraction | `useCreatePimlicoAccount` | N/A | Pimlico + Kernel setup |
| Swap orchestration | `useGaslessSwap` | N/A | Main function steps 3-8 |
| Quote fetching | `getGaslessQuote` API client | Proxies to 0x | Direct 0x API call |
| Trade submission | `submitGasless` API client | Proxies to 0x | Direct 0x API call |
| Status polling | `useGaslessStatus` query | Proxies to 0x | Direct 0x API polling |

The key difference is that `agent-fe-alpha` calls `agent-app` which then calls 0x, while this script calls 0x directly. All three implementations use identical 0x API parameters and flow.

## API Integration Details

This script demonstrates direct integration with the 0x API. The key implementation details:

### 0x API Endpoints

- **Base URL**: `https://api.0x.org`
- **Quote**: `GET /gasless/quote?chainId={id}&buyToken={addr}&sellToken={addr}&sellAmount={amt}&taker={addr}&slippageBps={bps}`
- **Submit**: `POST /gasless/submit` with body `{ chainId, approval?, trade }`
- **Status**: `GET /gasless/status/{tradeHash}?chainId={id}`

### Required Headers

All requests must include:
```
accept: application/json
0x-api-key: <your-api-key>
0x-version: v2
```

### Response Format

The 0x API returns responses directly (no wrapper). Example quote response:
```json
{
  "allowanceTarget": "0x...",
  "approval": { "type": "permit", "hash": "0x...", "eip712": {...} },
  "trade": { "type": "settler_metatransaction", "hash": "0x...", "eip712": {...} },
  "buyAmount": "999500",
  "sellAmount": "1000000",
  ...
}
```

## References

- [Pimlico Documentation](https://docs.pimlico.io/)
- [Kernel Smart Accounts](https://docs.zerodev.app/sdk/core-api/create-account)
- [0x Gasless API Documentation](https://0x.org/docs/api#tag/Gasless-API)
- [0x API Dashboard](https://0x.org/)
- [ERC-7702 Specification](https://eips.ethereum.org/EIPS/eip-7702)
- [agent-app Gasless Implementation](../agent-app/source/zerox/api_client.go)
# 0x-gasless-sigs
