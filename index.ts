import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  encodeFunctionData,
  hexToNumber,
  toHex,
  type Signature,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { parseErc6492Signature } from "viem/utils";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { to7702KernelSmartAccount } from "permissionless/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import { secp256k1 } from "@noble/curves/secp256k1";

// =============================================================================
// Configuration
// =============================================================================

const PIMLICO_API_KEY = process.env.PIMLICO_API_KEY!;
const ZEROX_API_KEY = process.env.ZEROX_API_KEY!;
const PRIVATE_KEY = process.env.PRIVATE_KEY! as Hex;
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";

// Chain config
const CHAIN = base;
const CHAIN_ID = CHAIN.id;
const CHAIN_NAME = "base";

// 0x API config
const ZEROX_API_URL = "https://staging.api.0x.org";

// Swap config - Example: USDC -> USDT on Base
const SELL_TOKEN = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base
const BUY_TOKEN = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2"; // USDT on Base
const SELL_AMOUNT = "1"; // 1 USDC (in UI units)
const DECIMALS = 6; // USDC decimals
const SLIPPAGE_BPS = 100; // 1%

// ERC20 ABI for approve
const ERC20_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// =============================================================================
// Types from agent-app API
// =============================================================================

interface GaslessQuoteResult {
  allowance_target: Address;
  approval?: {
    type: string;
    hash: Hex;
    eip712: any;
  } | null;
  block_number: number;
  buy_quantity: string;
  buy_token: Address;
  liquidity_available: boolean;
  min_buy_quantity: string;
  sell_quantity: string;
  sell_token: Address;
  target: Address;
  token_metadata?: any;
  trade: {
    type: string;
    hash: Hex;
    eip712: any;
  };
  zid: string;
  issues?: {
    allowance?: { actual: string; spender: Address } | null;
    balance?: { token: Address; actual: string; expected: string } | null;
    simulation_incomplete?: boolean;
    invalid_sources_passed?: string[];
  };
}

interface GaslessSubmitResult {
  tradeHash: Hex;
  type: string;
  zid: string;
}

interface GaslessStatusResult {
  status: string;
  transactions?: any[];
  zid: string;
}

// =============================================================================
// API Client Functions
// =============================================================================

async function getGaslessQuote(params: {
  chainId: number;
  buyToken: Address;
  sellToken: Address;
  sellAmount: string;
  taker: Address;
  slippageBps: number;
}): Promise<GaslessQuoteResult> {
  const qs = new URLSearchParams({
    chainId: params.chainId.toString(),
    buyToken: params.buyToken,
    sellToken: params.sellToken,
    sellAmount: params.sellAmount,
    taker: params.taker,
    slippageBps: params.slippageBps.toString(),
  });

  const url = `${ZEROX_API_URL}/gasless/quote?${qs}`;
  console.log(`\n📡 Fetching quote from 0x: ${url}`);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      "0x-api-key": ZEROX_API_KEY,
      "0x-version": "v2",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch quote: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data as GaslessQuoteResult;
}

async function submitGasless(body: {
  chainId: number;
  approval?: {
    type: string;
    hash: Hex;
    eip712: any;
    signature: any;
  } | null;
  trade: {
    type: string;
    hash: Hex;
    eip712: any;
    signature: any;
  };
}): Promise<GaslessSubmitResult> {
  const url = `${ZEROX_API_URL}/gasless/submit`;
  console.log(`\n📤 Submitting gasless trade to 0x: ${url}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "0x-api-key": ZEROX_API_KEY,
      "0x-version": "v2",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to submit: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data as GaslessSubmitResult;
}

async function getGaslessStatus(
  chainId: number,
  tradeHash: Hex
): Promise<GaslessStatusResult> {
  const qs = new URLSearchParams({
    chainId: chainId.toString(),
  });

  const url = `${ZEROX_API_URL}/gasless/status/${tradeHash}?${qs}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      "0x-api-key": ZEROX_API_KEY,
      "0x-version": "v2",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch status: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data as GaslessStatusResult;
}

// =============================================================================
// Signature Utilities
// =============================================================================

export type SignatureExtended = Signature & {
  recoveryParam: number;
};

export enum SignatureType {
  Illegal = 0,
  Invalid = 1,
  EIP712 = 2,
  EthSign = 3,
}


async function splitSignature(signatureHex: Hex) {
  const { r, s } = secp256k1.Signature.fromCompact(signatureHex.slice(2, 130));
  const v = hexToNumber(`0x${signatureHex.slice(130)}`);
  const signatureType = SignatureType.EIP712;

  return padSignature({
    v: BigInt(v),
    r: toHex(r),
    s: toHex(s),
    recoveryParam: 1 - (v % 2),
  });

  /**
   * Sometimes signatures are split without leading bytes on the `r` and/or `s` fields.
   *
   * Add them if they don't exist.
   */
  function padSignature(signature: SignatureExtended): SignatureExtended {
    const hexLength = 64;

    const result = { ...signature };

    const hexExtractor = /^0(x|X)(?<hex>\w+)$/;
    const rMatch = signature.r.match(hexExtractor);
    const rHex = rMatch?.groups?.hex;
    if (rHex) {
      if (rHex.length !== hexLength) {
        result.r = `0x${rHex.padStart(hexLength, "0")}`;
      }
    }

    const sMatch = signature.s.match(hexExtractor);
    const sHex = sMatch?.groups?.hex;
    if (sHex) {
      if (sHex.length !== hexLength) {
        result.s = `0x${sHex.padStart(hexLength, "0")}`;
      }
    }
    return result;
  }
}

// =============================================================================
// Main Script
// =============================================================================

async function main() {
  console.log("🚀 Gasless Swap Minimum Reproduction\n");
  console.log("=" .repeat(80));

  // 1. Setup account and clients
  console.log("\n📋 Step 1: Setting up account and clients");
  console.log("-".repeat(80));

  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log(`✅ Account address: ${account.address}`);

  const publicClient = createPublicClient({
    chain: CHAIN,
    transport: http(BASE_RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    chain: CHAIN,
    transport: http(BASE_RPC_URL),
  });

  // 2. Setup Pimlico client and Kernel smart account
  console.log("\n📋 Step 2: Setting up Pimlico and Kernel Smart Account");
  console.log("-".repeat(80));

  const pimlicoUrl = `https://api.pimlico.io/v2/${CHAIN_NAME}/rpc?apikey=${PIMLICO_API_KEY}`;

  const pimlicoClient = createPimlicoClient({
    transport: http(pimlicoUrl),
    entryPoint: {
      address: entryPoint07Address,
      version: "0.7",
    },
  });

  const smartAccount = await to7702KernelSmartAccount({
    owner: account,
    entryPoint: {
      address: entryPoint07Address as any,
      version: "0.7" as any,
    },
    version: "0.3.1",
    client: publicClient,
  });

  const smartAccountClient = createSmartAccountClient({
    account: smartAccount,
    chain: CHAIN,
    bundlerTransport: http(pimlicoUrl),
    paymaster: pimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () =>
        (await pimlicoClient.getUserOperationGasPrice()).fast,
    },
  });

  console.log(`✅ Smart account address: ${smartAccount.address}`);

  // 3. Get gasless quote
  console.log("\n📋 Step 3: Fetching gasless quote");
  console.log("-".repeat(80));

  const sellAmountBase = parseUnits(SELL_AMOUNT, DECIMALS).toString();
  console.log(`Sell: ${SELL_AMOUNT} tokens (${sellAmountBase} base units)`);
  console.log(`Sell token: ${SELL_TOKEN}`);
  console.log(`Buy token: ${BUY_TOKEN}`);
  console.log(`Slippage: ${SLIPPAGE_BPS / 100}%`);

  const quote = await getGaslessQuote({
    chainId: CHAIN_ID,
    buyToken: BUY_TOKEN,
    sellToken: SELL_TOKEN,
    sellAmount: sellAmountBase,
    taker: account.address,
    slippageBps: SLIPPAGE_BPS,
  });

  console.log(`\n✅ Quote received:`);
  console.log(`   Buy quantity: ${quote.buy_quantity}`);
  console.log(`   Sell quantity: ${quote.sell_quantity}`);
  console.log(`   ZID: ${quote.zid}`);
  console.log(`   Approval required: ${!!quote.approval}`);

  // 4. Handle approval if needed
  if (quote.issues?.allowance && !quote.approval) {
    console.log("\n📋 Step 4: Approval needed (no Permit support)");
    console.log("-".repeat(80));

    const spender = quote.issues.allowance.spender;
    console.log(`Approving ${spender} to spend ${quote.sell_quantity}`);

    const approveData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, BigInt(quote.sell_quantity)],
    });

    const userOpHash = await smartAccountClient.sendUserOperation({
      calls: [
        {
          to: SELL_TOKEN as Address,
          value: BigInt(0),
          data: approveData,
        },
      ],
    });

    console.log(`⏳ Waiting for approval user operation: ${userOpHash}`);
    await smartAccountClient.waitForUserOperationReceipt({ hash: userOpHash });
    console.log(`✅ Approval confirmed`);
  } else {
    console.log("\n📋 Step 4: No approval needed (using Permit)");
  }

  // 5. Sign approval EIP-712 (if Permit is supported)
  // NOTE: Approval signatures use EOA for Permit
  let approvalSig: Hex | null = null;
  if (quote.approval) {
    console.log("\n📋 Step 5: Signing approval EIP-712 (Permit)");
    console.log("-".repeat(80));

    approvalSig = await walletClient.signTypedData({
      account,
      domain: quote.approval.eip712.domain,
      types: quote.approval.eip712.types,
      primaryType: quote.approval.eip712.primaryType,
      message: quote.approval.eip712.message,
    });

    console.log(`✅ Approval signature: ${approvalSig.slice(0, 20)}...`);
  } else {
    console.log("\n📋 Step 5: No Permit signature needed");
  }

  // 6. Sign trade EIP-712 with smart account
  console.log("\n📋 Step 6: Signing trade EIP-712");
  console.log("-".repeat(80));

  const tradeSig = await smartAccountClient.signTypedData({
    account: smartAccount,
    domain: quote.trade.eip712.domain,
    types: quote.trade.eip712.types,
    primaryType: quote.trade.eip712.primaryType,
    message: quote.trade.eip712.message,
  });

  console.log(`✅ Trade signature: ${tradeSig.slice(0, 20)}...`);

  // 7. Submit gasless trade
  console.log("\n📋 Step 7: Submitting gasless trade");
  console.log("-".repeat(80));

  // Split signatures before creating submit body
  let approvalDataToSubmit = null;
  if (quote.approval && approvalSig) {
    const approvalSplitSig = await splitSignature(approvalSig);
    approvalDataToSubmit = {
      type: quote.approval.type,
      hash: quote.approval.hash,
      eip712: quote.approval.eip712,
      signature: {
        ...approvalSplitSig,
        v: Number(approvalSplitSig.v),
        signatureType: SignatureType.EIP712,
      },
    };
  }

  const tradeSplitSig = await splitSignature(tradeSig);
  const tradeDataToSubmit = {
    type: quote.trade.type,
    hash: quote.trade.hash,
    eip712: quote.trade.eip712,
    signature: {
      ...tradeSplitSig,
      v: Number(tradeSplitSig.v),
      signatureType: SignatureType.EIP712,
    },
  };

  const submitBody = {
    chainId: CHAIN_ID,
    approval: approvalDataToSubmit,
    trade: tradeDataToSubmit,
  };

  const submitResult = await submitGasless(submitBody);
  console.log(`✅ Trade submitted!`);
  console.log(`   Trade hash: ${submitResult.tradeHash}`);
  console.log(`   ZID: ${submitResult.zid}`);

  // 8. Poll for status
  console.log("\n📋 Step 8: Polling for transaction status");
  console.log("-".repeat(80));

  let confirmed = false;
  let attempts = 0;
  const maxAttempts = 60; // 60 attempts * 2 seconds = 2 minutes

  while (!confirmed && attempts < maxAttempts) {
    attempts++;
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds

    const status = await getGaslessStatus(CHAIN_ID, submitResult.tradeHash);
    console.log(`⏳ Attempt ${attempts}: Status = ${status.status}`);

    if (status.status.toLowerCase() === "confirmed") {
      confirmed = true;
      console.log(`\n✅ Transaction confirmed!`);

      if (status.transactions && status.transactions.length > 0) {
        const lastTx = status.transactions[status.transactions.length - 1];
        if (lastTx && (lastTx as any).txHash) {
          console.log(`   TX Hash: ${(lastTx as any).txHash}`);
        }
      }
    }
  }

  if (!confirmed) {
    console.log(`\n⚠️  Transaction not confirmed after ${maxAttempts} attempts`);
  }

  console.log("\n" + "=".repeat(80));
  console.log("✅ Script completed!");
}

// Run the script
main().catch((error) => {
  console.error("\n❌ Error:", error);
  process.exit(1);
});
