import { Wallet } from "@cashu/cashu-ts";
import type { Proof } from "@cashu/cashu-ts";

export const TEST_MINT_URL =
  process.env.TEST_MINT_URL ?? "https://mint.minibits.cash/Bitcoin";

/**
 * Create a funded test wallet from a pre-funded Cashu token.
 *
 * Set TEST_FUNDING_TOKEN to a cashuB... token string with enough sats
 * to cover all tests (~3 sats). The token is swapped for fresh proofs
 * at the mint — no Lightning required.
 *
 * For local development with Docker (FakeWallet), omit TEST_FUNDING_TOKEN
 * and set TEST_MINT_URL=http://localhost:3338 to use auto-funded mint quotes.
 */
export async function createFundedWallet(
  amount: number,
  unit = "sat",
): Promise<{ wallet: Wallet; proofs: Proof[] }> {
  const wallet = new Wallet(TEST_MINT_URL, { unit });
  await wallet.loadMint();

  const fundingToken = process.env.TEST_FUNDING_TOKEN;

  if (fundingToken) {
    // Swap the pre-funded token for fresh proofs
    const proofs = await wallet.receive(fundingToken);
    return { wallet, proofs };
  }

  // Fallback: FakeWallet auto-pay (Docker/local mint only)
  const quote = await wallet.createMintQuote(amount);

  let paid = false;
  for (let i = 0; i < 10 && !paid; i++) {
    const status = await wallet.checkMintQuote(quote.quote);
    if (status.state === "PAID") {
      paid = true;
    } else {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  if (!paid) {
    throw new Error(
      "Mint quote not paid. Set TEST_FUNDING_TOKEN for real mints, or use Docker with FakeWallet.",
    );
  }

  const proofs = await wallet.mintProofs(amount, quote.quote);
  return { wallet, proofs };
}
