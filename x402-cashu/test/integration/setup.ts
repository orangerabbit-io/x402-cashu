import { Wallet } from "@cashu/cashu-ts";
import type { Proof } from "@cashu/cashu-ts";

export const TEST_MINT_URL =
  process.env.TEST_MINT_URL ?? "http://localhost:3338";

/**
 * Create a funded test wallet by minting tokens from the test mint.
 * Uses FakeWallet backend which auto-pays mint quotes.
 *
 * Returns both the wallet and the minted proofs, since cashu-ts v3 does not
 * expose a getProofs() method — proofs must be captured from mintProofs().
 */
export async function createFundedWallet(
  amount: number,
  unit = "sat",
): Promise<{ wallet: Wallet; proofs: Proof[] }> {
  const wallet = new Wallet(TEST_MINT_URL, { unit });
  await wallet.loadMint();

  // Create a mint quote (FakeWallet auto-pays)
  const quote = await wallet.createMintQuote(amount);

  // Wait for quote to be paid (FakeWallet is instant but async)
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
    throw new Error("Mint quote not paid — is the test mint running?");
  }

  const proofs = await wallet.mintProofs(amount, quote.quote);
  return { wallet, proofs };
}
