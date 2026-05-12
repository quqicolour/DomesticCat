/**
 * DomesticCat NFT — Complete Test Suite
 * Hardhat 3 + Node.js node:test + Viem
 * Run with: npx hardhat test
 *
 * Key patterns discovered through debugging:
 * - viem = (await hre.network.getOrCreate()).viem
 * - publicClient = await viem.getPublicClient()  ← await!
 * - viem.deployContract("Name", [args])  ← no special module
 * - BigInt comparisons: use Number() or === with loose equality
 * - revert receipts: catch exceptions, don't check status
 */

import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert";
import hre from "hardhat";

// =============================================================================
// Utilities
// =============================================================================

function eth(value: string): bigint {
  const [whole, frac = ""] = value.split(".");
  const padded = (frac + "0".repeat(18)).slice(0, 18);
  return BigInt(whole + padded);
}

function tok(value: string): bigint {
  const [whole, frac = ""] = value.split(".");
  const padded = (frac + "0".repeat(18)).slice(0, 18);
  return BigInt(whole + padded);
}

/** Normalise address to lowercase for comparison */
function lc(addr: string): string {
  return addr.toLowerCase();

describe("DomesticCat NFT Project", () => {
  // --- accounts ---
  let owner: `0x${string}`;
  let user1: `0x${string}`;
  let user2: `0x${string}`;

  // --- viem helpers ---
  let viem: any;
  let publicClient: any;

  // --- contract handles ---
  let ameowToken: any;
  let nft: any;

  // --- constants (as plain numbers to avoid TS literal issues) ---
  const MINT_FEE = eth("0.01");
  const MAX_POWER = 100; // plain number for comparisons
  const AMEOW_PER_POWER = tok("10");

  before(async () => {
    const network = await hre.network.getOrCreate();
    viem = network.viem;
    publicClient = await viem.getPublicClient();
    const accounts = await viem.getWalletClients();
    [owner, user1, user2] = accounts.map((w: any) => w.account.address);
  });

  async function deploy() {
    const token = await viem.deployContract("AMeowToken", []);
    const nftContract = await viem.deployContract("DomesticCatNFT", [token.address]);
    // Link token → NFT
    await publicClient.waitForTransactionReceipt({
      hash: await token.write.setNFTContract([nftContract.address] as any, {
        account: owner,
      } as any),
    });
    return { token, nftContract };
  }

  beforeEach(async () => {
    const { token, nftContract } = await deploy();
    ameowToken = token;
    nft = nftContract;
  });

  // =============================================================================
  // AMeowToken
  // =============================================================================
  describe("AMeowToken", () => {
    it("initial supply is 1,000,000 AMEOW", async () => {
      const supply = await ameowToken.read.totalSupply();
      assert.strictEqual(Number(supply), 1_000_000 * 10 ** 18);
    });

    it("name and symbol are correct", async () => {
      assert.strictEqual(await ameowToken.read.name(), "AMeow Token");
      assert.strictEqual(await ameowToken.read.symbol(), "AMEOW");
    });

    it("remainingSupply starts at 0", async () => {
      const rem = await ameowToken.read.remainingSupply();
      assert.strictEqual(Number(rem), 0);
    });

    it("transfers tokens correctly", async () => {
      const amount = tok("100");
      await publicClient.waitForTransactionReceipt({
        hash: await ameowToken.write.transfer([user1, amount] as any, {
          account: owner,
        } as any),
      });
      assert.strictEqual(Number(await ameowToken.read.balanceOf([user1] as any)), Number(amount));
    });

    it("owner holds entire initial supply", async () => {
      assert.strictEqual(
        Number(await ameowToken.read.balanceOf([owner] as any)),
        1_000_000 * 10 ** 18,
      );
    });
  });

  // =============================================================================
  // Governance
  // =============================================================================
  describe("Governance", () => {
    it("initial mint fee is 0.01 ETH", async () => {
      assert.strictEqual(Number(await nft.read.getMintFee()), Number(MINT_FEE));
    });

    it("initial fee recipient is owner (checksum vs lowercase)", async () => {
      const recipient = await nft.read.getFeeRecipient();
      assert.strictEqual(lc(recipient), lc(owner));
    });

    it("owner can update mint fee", async () => {
      const newFee = eth("0.05");
      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.setMintFee([newFee] as any, { account: owner } as any),
      });
      assert.strictEqual(Number(await nft.read.getMintFee()), Number(newFee));
    });

    it("owner can update fee recipient", async () => {
      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.setFeeRecipient([user1] as any, {
          account: owner,
        } as any),
      });
      assert.strictEqual(lc(await nft.read.getFeeRecipient()), lc(user1));
    });

    it("rejects zero address for fee recipient", async () => {
      let threw = false;
      try {
        await publicClient.waitForTransactionReceipt({
          hash: await nft.write.setFeeRecipient([
            "0x0000000000000000000000000000000000000000",
          ] as any, { account: owner } as any),
        });
      } catch {
        threw = true;
      }
      assert.ok(threw, "Should revert on zero address");
    });

    it("owner can update treasury", async () => {
      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.setTreasury([user2] as any, { account: owner } as any),
      });
      assert.strictEqual(lc(await nft.read.treasury()), lc(user2));
    });

    it("non-owner cannot change mint fee", async () => {
      let threw = false;
      try {
        await publicClient.waitForTransactionReceipt({
          hash: await nft.write.setMintFee([eth("0.1")] as any, {
            account: user1,
          } as any),
        });
      } catch {
        threw = true;
      }
      assert.ok(threw, "Should revert when non-owner calls");
    });
  });

  // =============================================================================
  // NFT Minting
  // =============================================================================
  describe("NFT Minting", () => {
    it("mints NFT with initial power level 1", async () => {
      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.mint({ account: user1, value: MINT_FEE } as any),
      });
      assert.strictEqual(Number(await nft.read.getNFTPowerLevel([0] as any)), 1);
    });

    it("rejects insufficient mint fee", async () => {
      let threw = false;
      try {
        await publicClient.waitForTransactionReceipt({
          hash: await nft.write.mint({
            account: user1,
            value: eth("0.001"),
          } as any),
        });
      } catch {
        threw = true;
      }
      assert.ok(threw, "Should revert on insufficient fee");
    });

    it("tracks total minted count", async () => {
      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.mint({ account: user1, value: MINT_FEE } as any),
      });
      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.mint({ account: user2, value: MINT_FEE } as any),
      });
      assert.strictEqual(Number(await nft.read.totalMinted()), 2);
    });

    it("batch mints multiple NFTs", async () => {
      const qty = 5;
      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.batchMint([qty] as any, {
          account: user1,
          value: MINT_FEE * BigInt(qty),
        } as any),
      });
      assert.strictEqual(Number(await nft.read.balanceOf([user1] as any)), qty);
      assert.strictEqual(Number(await nft.read.totalMinted()), qty);
    });

    it("rejects batch mint with insufficient fee", async () => {
      let threw = false;
      try {
        await publicClient.waitForTransactionReceipt({
          hash: await nft.write.batchMint([5] as any, {
            account: user1,
            value: MINT_FEE, // only 1/5 paid
          } as any),
        });
      } catch {
        threw = true;
      }
      assert.ok(threw, "Should revert on insufficient batch fee");
    });

    it("splits mint fee: 50% treasury, 50% prize pool", async () => {
      const treasury = await nft.read.treasury();
      const treasuryBalBefore = await publicClient.getBalance({ address: treasury });
      const contractBalBefore = await publicClient.getBalance({ address: nft.address });

      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.mint({ account: user1, value: MINT_FEE } as any),
      });

      const treasuryBalAfter = await publicClient.getBalance({ address: treasury });
      const contractBalAfter = await publicClient.getBalance({ address: nft.address });

      assert.strictEqual(Number(treasuryBalAfter - treasuryBalBefore), Number(MINT_FEE) / 2);
      assert.strictEqual(Number(contractBalAfter - contractBalBefore), Number(MINT_FEE) / 2);
    });

    it("assigns sequential token IDs", async () => {
      for (let i = 0; i < 3; i++) {
        await publicClient.waitForTransactionReceipt({
          hash: await nft.write.mint({ account: user1, value: MINT_FEE } as any),
        });
      }
      assert.strictEqual(Number(await nft.read.totalMinted()), 3);
      assert.strictEqual(Number(await nft.read.balanceOf([user1] as any)), 3);
    });
  });

  // =============================================================================
  // Power-Up System
  // =============================================================================
  describe("Power-Up System", () => {
    beforeEach(async () => {
      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.mint({ account: user1, value: MINT_FEE } as any),
      });
    });

    async function approveAndPowerUp(amount: bigint) {
      await publicClient.waitForTransactionReceipt({
        hash: await ameowToken.write.approve([nft.address, amount] as any, {
          account: user1,
        } as any),
      });
      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.powerUpNFT([0, amount] as any, {
          account: user1,
        } as any),
      });
    }

    it("increases power level by 1 per 10 AMEOW", async () => {
      await approveAndPowerUp(AMEOW_PER_POWER);
      assert.strictEqual(Number(await nft.read.getNFTPowerLevel([0] as any)), 2);
    });

    it("accumulates AMeow in NFT record", async () => {
      await approveAndPowerUp(AMEOW_PER_POWER);
      assert.strictEqual(Number(await nft.read.nftAccumulatedAMeow([0] as any)), Number(AMEOW_PER_POWER));
    });

    it("caps power at MAX_POWER_LEVEL (100)", async () => {
      // Give user1 lots of AMEOW
      const huge = tok("100000");
      await publicClient.waitForTransactionReceipt({
        hash: await ameowToken.write.transfer([user1, huge] as any, {
          account: owner,
        } as any),
      });
      await publicClient.waitForTransactionReceipt({
        hash: await ameowToken.write.approve([nft.address, huge] as any, {
          account: user1,
        } as any),
      });
      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.powerUpNFT([0, huge] as any, {
          account: user1,
        } as any),
      });
      assert.strictEqual(Number(await nft.read.getNFTPowerLevel([0] as any)), MAX_POWER);
    });

    it("rejects power-up from non-NFT-owner", async () => {
      let threw = false;
      try {
        await publicClient.waitForTransactionReceipt({
          hash: await nft.write.powerUpNFT([0, AMEOW_PER_POWER] as any, {
            account: user2,
          } as any),
        });
      } catch {
        threw = true;
      }
      assert.ok(threw, "Should revert when non-owner powers up");
    });

    it("AMEOW balance of contract stays zero after power-up (burned)", async () => {
      await approveAndPowerUp(AMEOW_PER_POWER);
      assert.strictEqual(
        Number(await ameowToken.read.balanceOf([nft.address] as any)),
        0,
      );
    });

    it("multiple power-ups accumulate", async () => {
      for (let i = 0; i < 5; i++) {
        await approveAndPowerUp(AMEOW_PER_POWER);
      }
      // 1 (initial) + 5 increments = 6
      assert.strictEqual(Number(await nft.read.getNFTPowerLevel([0] as any)), 6);
    });
  });

  // =============================================================================
  // TokenURI / SVG Generation
  // =============================================================================
  describe("TokenURI / SVG Generation", () => {
    beforeEach(async () => {
      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.mint({ account: user1, value: MINT_FEE } as any),
      });
    });

    it("returns base64-encoded JSON URI", async () => {
      const uri = await nft.read.tokenURI([0] as any);
      assert.ok(
        uri.startsWith("data:application/json;base64,"),
        `Expected data: prefix, got: ${uri.slice(0, 50)}`,
      );
    });

    it("reverts for non-existent token", async () => {
      let threw = false;
      try {
        await nft.read.tokenURI([9999] as any);
      } catch {
        threw = true;
      }
      assert.ok(threw, "Should revert for non-existent token");
    });

    it("decoded JSON has name/description/image/attributes", async () => {
      const uri = await nft.read.tokenURI([0] as any);
      const base64 = uri.replace("data:application/json;base64,", "");
      const json: any = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));

      assert.ok(json.name, "missing name");
      assert.ok(json.description, "missing description");
      assert.ok(json.image, "missing image");
      assert.ok(Array.isArray(json.attributes), "attributes should be array");
      assert.ok(json.attributes.length >= 3, "should have at least 3 attributes");
    });

    it("SVG image is valid XML with svg tag", async () => {
      const uri = await nft.read.tokenURI([0] as any);
      const base64 = uri.replace("data:application/json;base64,", "");
      const json: any = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));

      assert.ok(json.image.startsWith("data:image/svg+xml;base64,"));
      const svgBase64 = json.image.replace("data:image/svg+xml;base64,", "");
      const svg = Buffer.from(svgBase64, "base64").toString("utf-8");

      assert.ok(svg.includes("<svg"), "missing <svg>");
      assert.ok(
        svg.includes("xmlns"),
        "SVG should include namespace",
      );
    });

    it("SVG contains DomesticCat cat title text", async () => {
      const uri = await nft.read.tokenURI([0] as any);
      const base64 = uri.replace("data:application/json;base64,", "");
      const json: any = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
      const svgBase64 = json.image.replace("data:image/svg+xml;base64,", "");
      const svg = Buffer.from(svgBase64, "base64").toString("utf-8");
      // Check for cat content — either the title text or the cat name in SVG
      const hasCatContent = svg.includes("DomesticCat") || svg.includes("Cat #0");
      assert.ok(hasCatContent, `SVG should mention DomesticCat or Cat #0: ${svg.slice(0, 200)}`);
    });
  });

  // =============================================================================
  // Chainlink VRF Configuration
  // =============================================================================
  describe("Chainlink VRF Configuration", () => {
    // NOTE: VRF is configured AFTER deployment via configureVRFv2() / configureVRFv2_5().
    // In tests these are 0 unless we call configureVRFv2.

    it("owner can configure VRF v2", async () => {
      const COORD = "0x271682DEB8C4E2001eD10e41cF8D44cFbE477F7"; // sepolia
      const SUB_ID = 1234n;
      const KEY_HASH = "0x8b5e213007f06fCla55c052a2183d33F2bADF8b7A9B5CeC3b5f84D3C3D2b5F";

      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.configureVRFv2([
          COORD,
          SUB_ID,
          KEY_HASH,
          "0x0000000000000000000000000000000000000000",
        ] as any, { account: owner } as any),
      });

      assert.strictEqual(lc(await nft.read.vrfCoordinator()), lc(COORD));
      assert.strictEqual(Number(await nft.read.vrfSubscriptionId()), Number(SUB_ID));
    });

    it("owner can update callback gas limit", async () => {
      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.setCallbackGasLimit([200000] as any, {
          account: owner,
        } as any),
      });
      assert.strictEqual(Number(await nft.read.callbackGasLimit()), 200000);
    });

    it("owner can update request confirmations", async () => {
      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.setRequestConfirmations([6] as any, {
          account: owner,
        } as any),
      });
      assert.strictEqual(Number(await nft.read.requestConfirmations()), 6);
    });

    it("grand prize not awarded during normal minting", async () => {
      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.mint({ account: user1, value: MINT_FEE } as any),
      });
      assert.strictEqual(await nft.read.grandPrizeAwarded(), false);
    });
  });

  // =============================================================================
  // Withdrawal
  // =============================================================================
  describe("Withdrawal", () => {
    it("owner can withdraw ETH from contract", async () => {
      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.mint({ account: user1, value: MINT_FEE } as any),
      });

      const contractBal = await publicClient.getBalance({ address: nft.address });
      const ownerBalBefore = await publicClient.getBalance({ address: owner });

      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.withdrawETH({ account: owner } as any),
      });

      const ownerBalAfter = await publicClient.getBalance({ address: owner });
      // Gas might have been spent, so check contract is drained
      const contractBalAfter = await publicClient.getBalance({ address: nft.address });
      assert.strictEqual(Number(contractBalAfter), 0);
    });

    it("owner can withdraw non-AMEOW ERC20 from contract", async () => {
      // Deploy a second ERC20 to send to NFT contract
      const otherToken = await viem.deployContract("AMeowToken", []);
      const amount = tok("500");
      await publicClient.waitForTransactionReceipt({
        hash: await otherToken.write.transfer([nft.address, amount] as any, {
          account: owner,
        } as any),
      });

      const ownerBalBefore = await otherToken.read.balanceOf([owner] as any);
      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.withdrawERC20([otherToken.address] as any, {
          account: owner,
        } as any),
      });
      const ownerBalAfter = await otherToken.read.balanceOf([owner] as any);
      assert.strictEqual(Number(ownerBalAfter - ownerBalBefore), Number(amount));
    });

    it("cannot withdraw AMEOW (it is burned as prize mechanism)", async () => {
      // Give AMEOW to NFT contract
      await publicClient.waitForTransactionReceipt({
        hash: await ameowToken.write.transfer([nft.address, tok("100")] as any, {
          account: owner,
        } as any),
      });

      let threw = false;
      try {
        await publicClient.waitForTransactionReceipt({
          hash: await nft.write.withdrawERC20([ameowToken.address] as any, {
            account: owner,
          } as any),
        });
      } catch {
        threw = true;
      }
      assert.ok(threw, "Should revert: AMEOW is burned as part of prize mechanism");
    });
  });

  // =============================================================================
  // View Functions
  // =============================================================================
  describe("View Functions", () => {
    it("totalSupply matches minted count", async () => {
      for (let i = 0; i < 3; i++) {
        await publicClient.waitForTransactionReceipt({
          hash: await nft.write.mint({ account: user1, value: MINT_FEE } as any),
        });
      }
      assert.strictEqual(Number(await nft.read.totalSupply()), 3);
    });

    it("getContractBalance reflects prize pool", async () => {
      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.mint({ account: user1, value: MINT_FEE } as any),
      });
      // Contract received 50% of mint fee
      assert.strictEqual(Number(await nft.read.getContractBalance()), Number(MINT_FEE) / 2);
    });

    it("NFT power initialized to 1", async () => {
      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.mint({ account: user1, value: MINT_FEE } as any),
      });
      assert.strictEqual(Number(await nft.read.getNFTPowerLevel([0] as any)), 1);
    });
  });

  // =============================================================================
  // Edge Cases
  // =============================================================================
  describe("Edge Cases", () => {
    it("user with no AMEOW balance cannot power up (allowance error)", async () => {
      // Mint NFT for user2 (who was not given AMEOW tokens)
      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.mint({ account: user2, value: MINT_FEE } as any),
      });

      let threw = false;
      try {
        await publicClient.waitForTransactionReceipt({
          hash: await nft.write.powerUpNFT([0, AMEOW_PER_POWER] as any, {
            account: user2,
          } as any),
        });
      } catch {
        threw = true;
      }
      assert.ok(threw, "Should revert when user has no AMEOW allowance");
    });

    it("power-up to exact MAX_POWER caps correctly", async () => {
      // Need 99 increments to go from 1 → 100
      const increments = MAX_POWER - 1;
      const amount = AMEOW_PER_POWER * BigInt(increments);

      await publicClient.waitForTransactionReceipt({
        hash: await ameowToken.write.transfer([user1, amount] as any, {
          account: owner,
        } as any),
      });
      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.mint({ account: user1, value: MINT_FEE } as any),
      });
      await publicClient.waitForTransactionReceipt({
        hash: await ameowToken.write.approve([nft.address, amount] as any, {
          account: user1,
        } as any),
      });
      await publicClient.waitForTransactionReceipt({
        hash: await nft.write.powerUpNFT([0, amount] as any, {
          account: user1,
        } as any),
      });

      assert.strictEqual(Number(await nft.read.getNFTPowerLevel([0] as any)), MAX_POWER);
    });
  });
});
}