/**
 * test/AMeowToken.test.ts
 * ================================================================
 * AMeowToken 合约测试
 * 框架：Hardhat 3 + node:test + viem
 * 覆盖：部署、ERC20 转账、授权、burnFrom、setNFTContract、事件
 * ================================================================
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

const MAX_SUPPLY = BigInt("1000000000000000000000000"); // 1_000_000 * 10^18

describe("AMeowToken", () => {
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
  // 基础信息
  // ================================================================
  describe("basic info", () => {
    it("name equals 'AMeow Token'", async () => {
      assert.equal(await ameowToken.read.name(), "AMeow Token");
    });

    it("symbol equals 'AMEOW'", async () => {
      assert.equal(await ameowToken.read.symbol(), "AMEOW");
    });

    it("totalSupply equals MAX_SUPPLY on deploy", async () => {
      assert.equal(await ameowToken.read.totalSupply(), MAX_SUPPLY);
    });

    it("deployer balance equals MAX_SUPPLY", async () => {
      const bal = await ameowToken.read.balanceOf([deployer] as any);
      assert.equal(bal, MAX_SUPPLY);
    });

    it("remainingSupply equals 0 (all minted at constructor)", async () => {
      assert.equal(await ameowToken.read.remainingSupply(), BigInt(0));
    });
  });

  // ================================================================
  // ERC20 转账
  // ================================================================
  describe("transfer", () => {
    it("transfers amount from deployer to user1", async () => {
      const amount = BigInt("100000000000000000000000"); // 100k
      const before = await ameowToken.read.balanceOf([user1] as any);
      await ameowToken.write.transfer([user1, amount] as any, {
        account: deployer,
      } as any);
      const after = await ameowToken.read.balanceOf([user1] as any);
      assert.equal(after - before, amount);
    });

    it("transfer deducts sender balance", async () => {
      const amount = BigInt("50000000000000000000000"); // 50k
      const before = await ameowToken.read.balanceOf([deployer] as any);
      await ameowToken.write.transfer([user1, amount] as any, {
        account: deployer,
      } as any);
      const after = await ameowToken.read.balanceOf([deployer] as any);
      assert.equal(before - after, amount);
    });

    it("transfer to zero address reverts", async () => {
      const zero = "0x0000000000000000000000000000000000000000" as `0x${string}`;
      const tx = ameowToken.write.transfer([zero, BigInt(1)] as any, {
        account: deployer,
      } as any);
      await assert.rejects(tx);
    });

    it("transfer more than balance reverts", async () => {
      const tooMuch = MAX_SUPPLY + BigInt(1);
      const tx = ameowToken.write.transfer([user1, tooMuch] as any, {
        account: deployer,
      } as any);
      await assert.rejects(tx);
    });
  });

  // ================================================================
  // approve 与 transferFrom
  // ================================================================
  describe("approve and transferFrom", () => {
    it("approve sets allowance for user1", async () => {
      const amount = BigInt("200000000000000000000000"); // 200k
      await ameowToken.write.approve([user1, amount] as any, {
        account: deployer,
      } as any);
      const allowance = await ameowToken.read.allowance([deployer, user1] as any);
      assert.equal(allowance, amount);
    });

    it("transferFrom moves tokens using allowance", async () => {
      const amount = BigInt("100000000000000000000000"); // 100k
      await ameowToken.write.approve([user1, amount] as any, {
        account: deployer,
      } as any);
      const before = await ameowToken.read.balanceOf([user2] as any);
      await ameowToken.write.transferFrom([deployer, user2, amount] as any, {
        account: user1,
      } as any);
      const after = await ameowToken.read.balanceOf([user2] as any);
      assert.equal(after - before, amount);
    });

    it("transferFrom deducts full allowance", async () => {
      const amount = BigInt("100000000000000000000000");
      await ameowToken.write.approve([user1, amount] as any, {
        account: deployer,
      } as any);
      await ameowToken.write.transferFrom([deployer, user2, amount] as any, {
        account: user1,
      } as any);
      const allowance = await ameowToken.read.allowance([deployer, user1] as any);
      assert.equal(allowance, BigInt(0));
    });

    it("transferFrom without approval reverts", async () => {
      const amount = BigInt("1000");
      const tx = ameowToken.write.transferFrom([deployer, user2, amount] as any, {
        account: user1,
      } as any);
      await assert.rejects(tx);
    });
  });

  // ================================================================
  // burnFrom（仅 NFT 合约可调用）
  // ================================================================
  describe("burnFrom", () => {
    it.skip("NFT contract can call burnFrom to burn its own balance", async () => {
      // burnFrom 检查 msg.sender == i_nftContract，
      // 但 wallet.sendTransaction 的 msg.sender 是 signer EOA，
      // 无法伪造 NFT 合约身份，除非 NFT 有专门的 withdraw/burn 函数。
      // 本测试留作参考，实际需要 NFT 合约暴露 burn 接口。
    });

    it("non-NFT address calling burnFrom reverts", async () => {
      const amount = BigInt("1000");
      const tx = ameowToken.write.burnFrom([deployer, amount] as any, {
        account: user1,
      } as any);
      await assert.rejects(tx);
    });
  });

  // ================================================================
  // setNFTContract
  // ================================================================
  describe("setNFTContract", () => {
    it("initial domesticCatNFT is zero address", async () => {
      // beforeEach 已经 set 过，这里建一个新 token 测试初始状态
      const freshToken = await ((await hre.network.create()) as any).viem
        .deployContract("AMeowToken", []);
      const linked = await freshToken.read.domesticCatNFT();
      assert.equal(linked, "0x0000000000000000000000000000000000000000");
    });

    it("deployer can set NFT contract address", async () => {
      await ameowToken.write.setNFTContract([nft.address] as any, {
        account: deployer,
      } as any);
      const linked = await ameowToken.read.domesticCatNFT();
      assert.equal(linked.toLowerCase(), nft.address.toLowerCase());
    });

    it("setting zero address reverts", async () => {
      const zero = "0x0000000000000000000000000000000000000000" as `0x${string}`;
      const tx = ameowToken.write.setNFTContract([zero] as any, {
        account: deployer,
      } as any);
      await assert.rejects(tx);
    });
  });

  // ================================================================
  // events
  // ================================================================
  describe("events", () => {
    it("Transfer event emitted on transfer", async () => {
      const amount = BigInt("1000");
      const txHash = await ameowToken.write.transfer([user1, amount] as any, {
        account: deployer,
      } as any);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      // Transfer topic: 0xddf252ad...
      const topic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
      const logs = receipt.logs.filter((log: any) => log.topics[0] === topic);
      assert.ok(logs.length >= 1, "Transfer event should be present");
    });

    it("Approval event emitted on approve", async () => {
      const amount = BigInt("1000");
      const txHash = await ameowToken.write.approve([user1, amount] as any, {
        account: deployer,
      } as any);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const topic = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
      const logs = receipt.logs.filter((log: any) => log.topics[0] === topic);
      assert.ok(logs.length >= 1, "Approval event should be present");
    });
  });
});
