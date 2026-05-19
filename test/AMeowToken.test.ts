import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  deployAMeowFixture,
  expectRejects,
  findEvent,
  getAMeowAs,
  MAX_SUPPLY,
  waitForTx,
  ZERO_ADDRESS,
} from "./helpers.ts";

describe("AMeowToken", () => {
  let ctx: Awaited<ReturnType<typeof deployAMeowFixture>>;

  beforeEach(async () => {
    ctx = await deployAMeowFixture();
  });

  describe("Deployment", () => {
    it("sets ERC20 metadata and decimals", async () => {
      assert.equal(await ctx.ameow.read.name(), "AMeow Token");
      assert.equal(await ctx.ameow.read.symbol(), "AMEOW");
      assert.equal(await ctx.ameow.read.decimals(), 18);
    });

    it("mints the full fixed supply to the deployer", async () => {
      assert.equal(await ctx.ameow.read.MAX_SUPPLY(), MAX_SUPPLY);
      assert.equal(await ctx.ameow.read.totalSupply(), MAX_SUPPLY);
      assert.equal(await ctx.ameow.read.balanceOf([ctx.deployer.account.address]), MAX_SUPPLY);
      assert.equal(await ctx.ameow.read.remainingSupply(), 0n);
    });

    it("starts with no bound NFT contract and deployer as owner", async () => {
      assert.equal(await ctx.ameow.read.domesticCatNFT(), ZERO_ADDRESS);
      assert.equal(
        (await ctx.ameow.read.owner()).toLowerCase(),
        ctx.deployer.account.address.toLowerCase(),
      );
    });
  });

  describe("ERC20 behavior", () => {
    it("transfers tokens between accounts", async () => {
      await waitForTx(
        await ctx.ameow.write.transfer([ctx.user.account.address, 1_000n], {
          client: { wallet: ctx.deployer },
        }),
      );

      assert.equal(await ctx.ameow.read.balanceOf([ctx.user.account.address]), 1_000n);
    });

    it("emits Transfer on token transfers", async () => {
      const receipt = await waitForTx(
        await ctx.ameow.write.transfer([ctx.user.account.address, 1_000n], {
          client: { wallet: ctx.deployer },
        }),
      );

      const event = findEvent(receipt, ctx.ameow.abi, "Transfer");
      assert.ok(event);
      assert.equal((event.args as any).from.toLowerCase(), ctx.deployer.account.address.toLowerCase());
      assert.equal((event.args as any).to.toLowerCase(), ctx.user.account.address.toLowerCase());
      assert.equal((event.args as any).value, 1_000n);
    });

    it("reverts when a sender has insufficient balance", async () => {
      const ameowAsUser = await getAMeowAs(ctx.ameow.address, ctx.user);
      await expectRejects(() =>
        ameowAsUser.write.transfer([ctx.deployer.account.address, 1n]),
      );
    });

    it("reverts when transferring to the zero address", async () => {
      await expectRejects(() =>
        ctx.ameow.write.transfer([ZERO_ADDRESS, 1n], {
          client: { wallet: ctx.deployer },
        }),
      );
    });

    it("supports approve and transferFrom", async () => {
      await waitForTx(
        await ctx.ameow.write.approve([ctx.user.account.address, 500n], {
          client: { wallet: ctx.deployer },
        }),
      );

      assert.equal(
        await ctx.ameow.read.allowance([
          ctx.deployer.account.address,
          ctx.user.account.address,
        ]),
        500n,
      );

      const ameowAsUser = await getAMeowAs(ctx.ameow.address, ctx.user);
      await waitForTx(
        await ameowAsUser.write.transferFrom([
          ctx.deployer.account.address,
          ctx.user.account.address,
          300n,
        ]),
      );

      assert.equal(await ctx.ameow.read.balanceOf([ctx.user.account.address]), 300n);
      assert.equal(
        await ctx.ameow.read.allowance([
          ctx.deployer.account.address,
          ctx.user.account.address,
        ]),
        200n,
      );
    });
  });

  describe("NFT contract binding", () => {
    it("allows only the owner to bind the NFT contract", async () => {
      const ameowAsUser = await getAMeowAs(ctx.ameow.address, ctx.user);
      await expectRejects(() =>
        ameowAsUser.write.setNFTContract([ctx.user.account.address]),
      );

      await waitForTx(
        await ctx.ameow.write.setNFTContract([ctx.user.account.address], {
          client: { wallet: ctx.deployer },
        }),
      );

      assert.equal(
        (await ctx.ameow.read.domesticCatNFT()).toLowerCase(),
        ctx.user.account.address.toLowerCase(),
      );
    });

    it("rejects the zero address", async () => {
      await expectRejects(() =>
        ctx.ameow.write.setNFTContract([ZERO_ADDRESS], {
          client: { wallet: ctx.deployer },
        }),
      );
    });

    it("can be bound only once", async () => {
      await waitForTx(
        await ctx.ameow.write.setNFTContract([ctx.user.account.address], {
          client: { wallet: ctx.deployer },
        }),
      );

      await expectRejects(() =>
        ctx.ameow.write.setNFTContract([ctx.operator.account.address], {
          client: { wallet: ctx.deployer },
        }),
      );
    });

    it("emits NFTContractUpdated when bound", async () => {
      const receipt = await waitForTx(
        await ctx.ameow.write.setNFTContract([ctx.user.account.address], {
          client: { wallet: ctx.deployer },
        }),
      );

      const event = findEvent(receipt, ctx.ameow.abi, "NFTContractUpdated");
      assert.ok(event);
      assert.equal((event.args as any).oldNFT, ZERO_ADDRESS);
      assert.equal((event.args as any).newNFT.toLowerCase(), ctx.user.account.address.toLowerCase());
    });
  });

  describe("Burning", () => {
    it("rejects burnFrom before the NFT contract is bound", async () => {
      await expectRejects(() =>
        ctx.ameow.write.burnFrom([ctx.deployer.account.address, 1n], {
          client: { wallet: ctx.deployer },
        }),
      );
    });

    it("rejects burnFrom from any caller other than the bound NFT contract", async () => {
      await waitForTx(
        await ctx.ameow.write.setNFTContract([ctx.user.account.address], {
          client: { wallet: ctx.deployer },
        }),
      );

      await expectRejects(() =>
        ctx.ameow.write.burnFrom([ctx.deployer.account.address, 1n], {
          client: { wallet: ctx.deployer },
        }),
      );
    });
  });
});
