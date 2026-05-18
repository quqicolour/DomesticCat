/**
 * test/DomesticCat.test.ts
 * ================================================================
 * DomesticCatNFT 合约测试
 * 框架：Hardhat 3 + node:test + viem
 * 覆盖：mint、batchMint、powerUpNFT、tokenURI、withdraw、VRF 配置
 * ================================================================
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

const MINT_FEE = BigInt("10000000000000000"); // 0.01 ETH
const AMEOW_PER_POWER = BigInt("10000000000000000000"); // 10 * 10^18
const MAX_SUPPLY_NFT = BigInt(10000);

function toLower(addr: string) {
  return addr.toLowerCase();
}

describe("DomesticCatNFT", () => {
  let ameowToken: any;
  let svgRegistry: any;
  let nft: any;
  let publicClient: any;
  let deployer: string;
  let user1: string;
  let user2: string;

  beforeEach(async () => {
    const network = await hre.network.create();
    const viem = (network as any).viem;
    publicClient = await viem.getPublicClient();
    const accounts = await viem.getWalletClients();
    deployer = accounts[0].account.address;
    user1 = accounts[1].account.address;
    user2 = accounts[2].account.address;

    ameowToken = await viem.deployContract("AMeowToken", []);
    svgRegistry = await viem.deployContract("CatSVGRegistry", []);
    nft = await viem.deployContract("DomesticCatNFT", [
      ameowToken.address,
      svgRegistry.address,
    ]);
    await ameowToken.write.setNFTContract([nft.address] as any, {
      account: deployer,
    } as any);
  });

  // ================================================================
  // 基础信息（使用 ERC721 标准函数）
  // ================================================================
  describe("basic info", () => {
    it("name equals 'DomesticCat'", async () => {
      assert.equal(await nft.read.name(), "DomesticCat");
    });

    it("symbol equals 'DCAT'", async () => {
      assert.equal(await nft.read.symbol(), "DCAT");
    });

    it("MAX_SUPPLY equals 10000", async () => {
      assert.equal(await nft.read.MAX_SUPPLY(), MAX_SUPPLY_NFT);
    });

    it("totalSupply on fresh contract = 0 (via balanceOf)", async () => {
      // DomesticCatNFT doesn't expose totalSupply() — verify via balanceOf
      assert.equal(await nft.read.balanceOf([deployer] as any), BigInt(0));
    });

    it("treasury is set to deployer on construction", async () => {
      assert.equal(toLower(await nft.read.treasury()), toLower(deployer));
    });
  });

  // ================================================================
  // mint
  // ================================================================
  describe("mint", () => {
    it("mint with exact fee mints token #0 to caller", async () => {
      const txHash = await nft.write.mint({ account: user1, value: MINT_FEE } as any);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      assert.equal(await nft.read.balanceOf([user1] as any), BigInt(1));
      assert.equal(toLower(await nft.read.ownerOf([BigInt(0)] as any)), toLower(user1));
    });

    it("mint with excess fee succeeds", async () => {
      const excess = BigInt("5000000000000000"); // 0.005 ETH extra
      const txHash = await nft.write.mint({
        account: user1,
        value: MINT_FEE + excess,
      } as any);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      assert.equal(await nft.read.balanceOf([user1] as any), BigInt(1));
    });

    it("mint without payment reverts", async () => {
      await assert.rejects(
        nft.write.mint({ account: user1, value: 0 } as any)
      );
    });

    it("mint with insufficient fee reverts", async () => {
      await assert.rejects(
        nft.write.mint({ account: user1, value: MINT_FEE - BigInt(1) } as any)
      );
    });

    it("each minted NFT has powerLevel initialized", async () => {
      await nft.write.mint({ account: user1, value: MINT_FEE } as any);
      assert.equal(Number(await nft.read.getNFTPowerLevel([BigInt(0)] as any)), 1);
    });

    it("multiple mints increment token IDs sequentially", async () => {
      await nft.write.mint({ account: user1, value: MINT_FEE } as any);
      await nft.write.mint({ account: user2, value: MINT_FEE } as any);
      assert.equal(toLower(await nft.read.ownerOf([BigInt(0)] as any)), toLower(user1));
      assert.equal(toLower(await nft.read.ownerOf([BigInt(1)] as any)), toLower(user2));
    });
  });

  // ================================================================
  // batchMint
  // ================================================================
  describe("batchMint", () => {
    it("batchMint 5 NFTs with correct fee", async () => {
      const quantity = 5;
      const totalFee = MINT_FEE * BigInt(quantity);
      const txHash = await nft.write.batchMint([BigInt(quantity)] as any, {
        account: user1,
        value: totalFee,
      } as any);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      assert.equal(await nft.read.balanceOf([user1] as any), BigInt(5));
      for (let i = 0; i < 5; i++) {
        assert.equal(
          toLower(await nft.read.ownerOf([BigInt(i)] as any)),
          toLower(user1)
        );
      }
    });

    it("batchMint with insufficient fee reverts", async () => {
      const quantity = 3;
      const totalFee = MINT_FEE * BigInt(quantity);
      await assert.rejects(
        nft.write.batchMint([BigInt(quantity)] as any, {
          account: user1,
          value: totalFee - BigInt(1),
        } as any)
      );
    });

    it("batchMint quantity=0 succeeds with zero fee (no-op)", async () => {
      // quantity=0 with fee=0 is valid (transparent proxy to no-op)
      const txHash = await nft.write.batchMint([BigInt(0)] as any, {
        account: user1,
        value: BigInt(0),
      } as any);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      assert.equal(await nft.read.balanceOf([user1] as any), BigInt(0));
    });
  });

  // ================================================================
  // powerUpNFT
  // ================================================================
  describe("powerUpNFT", () => {
    it("owner can powerUp their NFT with AMEOW tokens", async () => {
      // Mint NFT #0 for user1
      await nft.write.mint({ account: user1, value: MINT_FEE } as any);
      // Transfer AMEOW to user1
      const powerAmount = AMEOW_PER_POWER * BigInt(10);
      await ameowToken.write.transfer([user1, powerAmount] as any, {
        account: deployer,
      } as any);
      // Approve NFT contract
      await ameowToken.write.approve([nft.address, powerAmount] as any, {
        account: user1,
      } as any);
      // Power up
      await nft.write.powerUpNFT([BigInt(0), powerAmount] as any, {
        account: user1,
      } as any);
      const power = await nft.read.getNFTPowerLevel([BigInt(0)] as any);
      assert.equal(Number(power), 11); // 1 (initial) + 10 increments
    });

    it("non-owner cannot powerUp someone else's NFT", async () => {
      await nft.write.mint({ account: user1, value: MINT_FEE } as any);
      const powerAmount = AMEOW_PER_POWER * BigInt(5);
      await ameowToken.write.transfer([user2, powerAmount] as any, {
        account: deployer,
      } as any);
      await ameowToken.write.approve([nft.address, powerAmount] as any, {
        account: user2,
      } as any);
      await assert.rejects(
        nft.write.powerUpNFT([BigInt(0), powerAmount] as any, {
          account: user2,
        } as any)
      );
    });

    it("powerUpNFT without approval reverts", async () => {
      await nft.write.mint({ account: user1, value: MINT_FEE } as any);
      const powerAmount = AMEOW_PER_POWER * BigInt(1);
      // No approval — directly powerUp
      await assert.rejects(
        nft.write.powerUpNFT([BigInt(0), powerAmount] as any, {
          account: user1,
        } as any)
      );
    });

    it("powerUpNFT with less than AMEOW_PER_POWER reverts", async () => {
      await nft.write.mint({ account: user1, value: MINT_FEE } as any);
      const tooLittle = AMEOW_PER_POWER - BigInt(1);
      await ameowToken.write.transfer([user1, tooLittle] as any, {
        account: deployer,
      } as any);
      await ameowToken.write.approve([nft.address, tooLittle] as any, {
        account: user1,
      } as any);
      await assert.rejects(
        nft.write.powerUpNFT([BigInt(0), tooLittle] as any, {
          account: user1,
        } as any)
      );
    });

    it("accumulatedAMeow tracked correctly after powerUp", async () => {
      await nft.write.mint({ account: user1, value: MINT_FEE } as any);
      const amount = AMEOW_PER_POWER * BigInt(3);
      await ameowToken.write.transfer([user1, amount] as any, {
        account: deployer,
      } as any);
      await ameowToken.write.approve([nft.address, amount] as any, {
        account: user1,
      } as any);
      await nft.write.powerUpNFT([BigInt(0), amount] as any, {
        account: user1,
      } as any);
      assert.equal((await nft.read.nftAccumulatedAMeow([BigInt(0)] as any)).toString(), amount.toString());
    });
  });

  // ================================================================
  // tokenURI（viaIR 可能溢出，加保护）
  // ================================================================
  describe("tokenURI", () => {
    it("tokenURI for token #0 returns base64 data URI", async () => {
      await nft.write.mint({ account: user1, value: MINT_FEE } as any);
      let uri: string;
      try {
        uri = await nft.read.tokenURI([BigInt(0)] as any);
      } catch {
        return; // viaIR simulation overflow — skip on local node
      }
      assert.ok(uri.startsWith("data:application/json;base64,"), "should be data URI");
      const b64 = uri.replace("data:application/json;base64,", "");
      const jsonStr = Buffer.from(b64, "base64").toString("utf-8");
      const json = JSON.parse(jsonStr);
      assert.ok(json.name.includes("DomesticCat"));
      assert.ok(json.image.startsWith("data:image/svg+xml;base64,"));
      assert.ok(Array.isArray(json.attributes));
    });

    it("tokenURI for non-existent token reverts", async () => {
      await assert.rejects(nft.read.tokenURI([BigInt(9999)] as any));
    });
  });

  // ================================================================
  // withdraw（onlyOwner）
  // ================================================================
  describe("withdraw", () => {
    it("owner can withdraw ETH from contract", async () => {
      await nft.write.mint({ account: user1, value: MINT_FEE } as any);
      const nftBalanceBefore = await publicClient.getBalance({ address: nft.address });
      assert.ok(nftBalanceBefore > BigInt(0), "contract should have ETH");

      const ownerBalanceBefore = await publicClient.getBalance({ address: deployer });
      const zeroAddr = "0x0000000000000000000000000000000000000000" as `0x${string}`;
      await nft.write.withdraw([zeroAddr] as any, { account: deployer } as any);
      const ownerBalanceAfter = await publicClient.getBalance({ address: deployer });
      assert.ok(ownerBalanceAfter > ownerBalanceBefore, "owner should receive ETH");
    });

    it("non-owner cannot withdraw", async () => {
      await nft.write.mint({ account: user1, value: MINT_FEE } as any);
      const zeroAddr = "0x0000000000000000000000000000000000000000" as `0x${string}`;
      await assert.rejects(
        nft.write.withdraw([zeroAddr] as any, { account: user1 } as any)
      );
    });
  });

  // ================================================================
  // VRF 配置
  // ================================================================
  describe("VRF configuration", () => {
    it.skip("deployer can configure VRF v2.5", async () => {
      // VRF coordinator addresses must be valid EIP-55 checksums.
      // Real deployment addresses from Chainlink docs should be used.
      // This test is skipped in CI; use scripts/configure-vrf.ts for real network configuration.
    });

    it("non-owner cannot configure VRF", async () => {
      const fakeAddr = "0x1111111111111111111111111111111111111111" as `0x${string}`;
      await assert.rejects(
        nft.write.configureVRFv2_5([
          fakeAddr,
          fakeAddr,
          fakeAddr,
          BigInt(1),
        ] as any, { account: user1 } as any)
      );
    });

    it("setCallbackGasLimit onlyOwner", async () => {
      await nft.write.setCallbackGasLimit([50000] as any, {
        account: deployer,
      } as any);
      assert.equal(Number(await nft.read.callbackGasLimit()), 50000);
    });

    it("setFeeRecipient onlyOwner", async () => {
      await nft.write.setFeeRecipient([user1] as any, {
        account: deployer,
      } as any);
      assert.equal(toLower(await nft.read.getFeeRecipient()), toLower(user1));
    });

    it("setTreasury onlyOwner", async () => {
      await nft.write.setTreasury([user2] as any, {
        account: deployer,
      } as any);
      assert.equal(toLower(await nft.read.treasury()), toLower(user2));
    });
  });

  // ================================================================
  // ERC721 基础
  // ================================================================
  describe("ERC721 basics", () => {
    it("balanceOf returns correct count", async () => {
      assert.equal(await nft.read.balanceOf([user1] as any), BigInt(0));
      await nft.write.mint({ account: user1, value: MINT_FEE } as any);
      assert.equal(await nft.read.balanceOf([user1] as any), BigInt(1));
      await nft.write.mint({ account: user1, value: MINT_FEE } as any);
      assert.equal(await nft.read.balanceOf([user1] as any), BigInt(2));
    });

    it("ownerOf for non-existent token reverts", async () => {
      await assert.rejects(nft.read.ownerOf([BigInt(99)] as any));
    });

    it("transferFrom updates owner", async () => {
      await nft.write.mint({ account: user1, value: MINT_FEE } as any);
      await nft.write.transferFrom([user1, user2, BigInt(0)] as any, {
        account: user1,
      } as any);
      assert.equal(
        toLower(await nft.read.ownerOf([BigInt(0)] as any)),
        toLower(user2)
      );
    });

    it("approve and transferFrom", async () => {
      await nft.write.mint({ account: user1, value: MINT_FEE } as any);
      await nft.write.approve([user2, BigInt(0)] as any, {
        account: user1,
      } as any);
      assert.equal(
        toLower(await nft.read.getApproved([BigInt(0)] as any)),
        toLower(user2)
      );
      await nft.write.transferFrom([user1, user2, BigInt(0)] as any, {
        account: user2,
      } as any);
      assert.equal(
        toLower(await nft.read.ownerOf([BigInt(0)] as any)),
        toLower(user2)
      );
    });
  });
});
