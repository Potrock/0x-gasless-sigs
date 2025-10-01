# Gasless Swap Minimum Reproduction

Minimal script to test gasless swaps using Pimlico, Kernel (ERC-7702), and 0x API.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Fill in your `.env`:
```bash
PIMLICO_API_KEY=your_pimlico_api_key
ZEROX_API_KEY=your_0x_api_key
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
BASE_RPC_URL=https://mainnet.base.org  # optional
```

## Get API Keys

- **Pimlico**: [https://dashboard.pimlico.io](https://dashboard.pimlico.io)
- **0x**: [https://0x.org/](https://0x.org/)

## Configure Swap

Edit `index.ts` (lines 39-44) to set your tokens and amount:

```typescript
const SELL_TOKEN = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC
const BUY_TOKEN = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";   // USDT
const SELL_AMOUNT = "1";  // 1 USDC
const DECIMALS = 6;       // USDC decimals
const SLIPPAGE_BPS = 100; // 1%
```

## Run

```bash
npm start
```

## What It Does

1. Creates an ERC-7702 smart account with Pimlico
2. Gets a gasless quote from 0x
3. Handles token approval (Permit or on-chain)
4. Signs and submits the trade
5. Polls for confirmation

## Requirements

- Node.js 18+
- EOA with tokens on Base
- Pimlico API key
- 0x API key
