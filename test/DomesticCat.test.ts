import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  AMEOW_PER_POWER,
  decodeImageDataURI,
  decodeTokenURI,
  deployDomesticCatFixture,
  expectRejects,
  findEvent,
  getAMeowAs,
  getDomesticCatAs,
  MAX_SUPPLY,
  MINT_FEE,
  NFT_MAX_SUPPLY,
  waitForTx,
  ZERO_ADDRESS,
} from "./helpers.ts";

describe("DomesticCatNFT", () => {
  let ctx: Awaited<ReturnType<typeof deployDomesticCatFixture>>;

  beforeEach(async () => {
    ctx = await deployDomesticCatFixture();
  });

  describe("Deployment", () => {
    it("sets collection metadata and immutable dependencies", async () => {
      assert.equal(await ctx.nft.read.name(), "DomesticCat");
      assert.equal(await ctx.nft.read.symbol(), "DCAT");
      assert.equal(await ctx.nft.read.MAX_SUPPLY(), NFT_MAX_SUPPLY);
      assert.equal(await ctx.nft.read.MAX_POWER_LEVEL(), 100);
      assert.equal(await ctx.nft.read.AMEOW_PER_POWER(), AMEOW_PER_POWER);
      assert.equal((await ctx.nft.read.AMEOW_TOKEN()).toLowerCase(), ctx.ameow.address.toLowerCase());
      assert.equal((await ctx.nft.read.SVG_REGISTRY()).toLowerCase(), ctx.registry.address.toLowerCase());
    });

    it("sets owner, treasury, fee recipient, and default mint fee", async () => {
      assert.equal((await ctx.nft.read.owner()).toLowerCase(), ctx.deployer.account.address.toLowerCase());
      assert.equal((await ctx.nft.read.treasury()).toLowerCase(), ctx.deployer.account.address.toLowerCase());
      assert.equal((await ctx.nft.read.getFeeRecipient()).toLowerCase(), ctx.deployer.account.address.toLowerCase());
      assert.equal(await ctx.nft.read.getMintFee(), MINT_FEE);
      assert.equal(await ctx.nft.read.totalMinted(), 0n);
      assert.equal(await ctx.nft.read.grandPrizeAwarded(), false);
    });

    it("rejects zero dependency addresses", async () => {
      await expectRejects(() =>
        ctx.viem.deployContract("DomesticCatNFT", [ZERO_ADDRESS, ctx.registry.address], {
          client: { wallet: ctx.deployer },
        }),
      );
      await expectRejects(() =>
        ctx.viem.deployContract("DomesticCatNFT", [ctx.ameow.address, ZERO_ADDRESS], {
          client: { wallet: ctx.deployer },
        }),
      );
    });
  });

  describe("Minting", () => {
    it("mints one NFT, initializes power, and keeps half the fee as prize pool", async () => {
      const beforeTreasury = await ctx.publicClient.getBalance({
        address: ctx.deployer.account.address,
      });
      const receipt = await waitForTx(
        await ctx.nft.write.mint({
          client: { wallet: ctx.deployer },
          value: MINT_FEE,
        }),
      );
      const afterTreasury = await ctx.publicClient.getBalance({
        address: ctx.deployer.account.address,
      });

      assert.equal(
        (await ctx.nft.read.ownerOf([0n])).toLowerCase(),
        ctx.deployer.account.address.toLowerCase(),
      );
      assert.equal(await ctx.nft.read.totalMinted(), 1n);
      assert.equal(await ctx.nft.read.getNFTPowerLevel([0n]), 1);
      assert.equal(await ctx.nft.read.getContractBalance(), MINT_FEE / 2n);
      assert.ok(afterTreasury > beforeTreasury - MINT_FEE);

      const event = findEvent(receipt, ctx.nft.abi, "Transfer");
      assert.ok(event);
      assert.equal((event.args as any).from, ZERO_ADDRESS);
      assert.equal((event.args as any).to.toLowerCase(), ctx.deployer.account.address.toLowerCase());
      assert.equal((event.args as any).tokenId, 0n);
    });

    it("rejects insufficient mint fee", async () => {
      await expectRejects(() =>
        ctx.nft.write.mint({
          client: { wallet: ctx.deployer },
          value: MINT_FEE - 1n,
        }),
      );
    });

    it("batch mints sequential token IDs", async () => {
      const nftAsUser = await getDomesticCatAs(ctx.nft.address, ctx.user);
      await waitForTx(await nftAsUser.write.batchMint([5n], { value: MINT_FEE * 5n }));

      assert.equal(await ctx.nft.read.totalMinted(), 5n);
      assert.equal(await ctx.nft.read.balanceOf([ctx.user.account.address]), 5n);
      assert.equal((await ctx.nft.read.ownerOf([0n])).toLowerCase(), ctx.user.account.address.toLowerCase());
      assert.equal((await ctx.nft.read.ownerOf([4n])).toLowerCase(), ctx.user.account.address.toLowerCase());
      assert.equal(await ctx.nft.read.getNFTPowerLevel([4n]), 1);
      assert.equal(await ctx.nft.read.getContractBalance(), (MINT_FEE * 5n) / 2n);
    });

    it("rejects underpaid or oversized batch mints", async () => {
      await expectRejects(() =>
        ctx.nft.write.batchMint([3n], {
          client: { wallet: ctx.deployer },
          value: MINT_FEE * 2n,
        }),
      );
      await expectRejects(() =>
        ctx.nft.write.batchMint([NFT_MAX_SUPPLY + 1n], {
          client: { wallet: ctx.deployer },
          value: MINT_FEE * (NFT_MAX_SUPPLY + 1n),
        }),
      );
    });
  });

  describe("ERC721 behavior", () => {
    beforeEach(async () => {
      await waitForTx(
        await ctx.nft.write.mint({
          client: { wallet: ctx.deployer },
          value: MINT_FEE,
        }),
      );
    });

    it("supports approvals and transferFrom", async () => {
      await waitForTx(
        await ctx.nft.write.approve([ctx.user.account.address, 0n], {
          client: { wallet: ctx.deployer },
        }),
      );
      assert.equal(
        (await ctx.nft.read.getApproved([0n])).toLowerCase(),
        ctx.user.account.address.toLowerCase(),
      );

      const nftAsUser = await getDomesticCatAs(ctx.nft.address, ctx.user);
      await waitForTx(
        await nftAsUser.write.transferFrom([
          ctx.deployer.account.address,
          ctx.user.account.address,
          0n,
        ]),
      );

      assert.equal((await ctx.nft.read.ownerOf([0n])).toLowerCase(), ctx.user.account.address.toLowerCase());
    });

    it("supports operator approvals", async () => {
      await waitForTx(
        await ctx.nft.write.setApprovalForAll([ctx.operator.account.address, true], {
          client: { wallet: ctx.deployer },
        }),
      );

      assert.equal(
        await ctx.nft.read.isApprovedForAll([
          ctx.deployer.account.address,
          ctx.operator.account.address,
        ]),
        true,
      );
    });

    it("rejects ownerOf for missing tokens", async () => {
      await expectRejects(() => ctx.nft.read.ownerOf([999n]));
    });
  });

  describe("Power-up", () => {
    beforeEach(async () => {
      await waitForTx(
        await ctx.nft.write.mint({
          client: { wallet: ctx.deployer },
          value: MINT_FEE,
        }),
      );
    });

    it("burns AMEOW and increases NFT power", async () => {
      const amount = AMEOW_PER_POWER * 5n;
      await waitForTx(
        await ctx.ameow.write.approve([ctx.nft.address, amount], {
          client: { wallet: ctx.deployer },
        }),
      );

      const receipt = await waitForTx(
        await ctx.nft.write.powerUpNFT([0n, amount], {
          client: { wallet: ctx.deployer },
        }),
      );

      assert.equal(await ctx.nft.read.getNFTPowerLevel([0n]), 6);
      assert.equal(await ctx.nft.read.nftAccumulatedAMeow([0n]), amount);
      assert.equal(await ctx.ameow.read.balanceOf([ctx.nft.address]), 0n);
      assert.equal(await ctx.ameow.read.totalSupply(), MAX_SUPPLY - amount);

      const event = findEvent(receipt, ctx.nft.abi, "NFTPowerUp");
      assert.ok(event);
      assert.equal((event.args as any).nftId, 0n);
      assert.equal((event.args as any).newPowerLevel, 6);
    });

    it("caps power at 100 while recording the full amount burned", async () => {
      const amount = AMEOW_PER_POWER * 1_000n;
      await waitForTx(
        await ctx.ameow.write.approve([ctx.nft.address, amount], {
          client: { wallet: ctx.deployer },
        }),
      );
      await waitForTx(
        await ctx.nft.write.powerUpNFT([0n, amount], {
          client: { wallet: ctx.deployer },
        }),
      );

      assert.equal(await ctx.nft.read.getNFTPowerLevel([0n]), 100);
      assert.equal(await ctx.nft.read.nftAccumulatedAMeow([0n]), amount);
    });

    it("rejects non-owners, missing allowance, and sub-threshold amounts", async () => {
      await waitForTx(
        await ctx.ameow.write.transfer([ctx.user.account.address, AMEOW_PER_POWER], {
          client: { wallet: ctx.deployer },
        }),
      );
      const ameowAsUser = await getAMeowAs(ctx.ameow.address, ctx.user);
      await waitForTx(await ameowAsUser.write.approve([ctx.nft.address, AMEOW_PER_POWER]));

      const nftAsUser = await getDomesticCatAs(ctx.nft.address, ctx.user);
      await expectRejects(() =>
        nftAsUser.write.powerUpNFT([0n, AMEOW_PER_POWER]),
      );
      await expectRejects(() =>
        ctx.nft.write.powerUpNFT([0n, AMEOW_PER_POWER], {
          client: { wallet: ctx.deployer },
        }),
      );
      await expectRejects(() =>
        ctx.nft.write.powerUpNFT([0n, AMEOW_PER_POWER - 1n], {
          client: { wallet: ctx.deployer },
        }),
      );
    });
  });

  describe("Governance", () => {
    it("allows owner to update mint fee, fee recipient, and treasury", async () => {
      const feeReceipt = await waitForTx(
        await ctx.nft.write.setMintFee([2n * MINT_FEE], {
          client: { wallet: ctx.deployer },
        }),
      );
      await waitForTx(
        await ctx.nft.write.setFeeRecipient([ctx.user.account.address], {
          client: { wallet: ctx.deployer },
        }),
      );
      await waitForTx(
        await ctx.nft.write.setTreasury([ctx.treasury.account.address], {
          client: { wallet: ctx.deployer },
        }),
      );

      assert.equal(await ctx.nft.read.getMintFee(), 2n * MINT_FEE);
      assert.equal((await ctx.nft.read.getFeeRecipient()).toLowerCase(), ctx.user.account.address.toLowerCase());
      assert.equal((await ctx.nft.read.treasury()).toLowerCase(), ctx.treasury.account.address.toLowerCase());

      const event = findEvent(feeReceipt, ctx.nft.abi, "MintFeeUpdated");
      assert.ok(event);
      assert.equal((event.args as any).oldFee, MINT_FEE);
      assert.equal((event.args as any).newFee, 2n * MINT_FEE);
    });

    it("rejects non-owner governance calls and zero-address config", async () => {
      const nftAsUser = await getDomesticCatAs(ctx.nft.address, ctx.user);
      await expectRejects(() =>
        nftAsUser.write.setMintFee([2n * MINT_FEE]),
      );
      await expectRejects(() =>
        nftAsUser.write.setFeeRecipient([ctx.user.account.address]),
      );
      await expectRejects(() =>
        nftAsUser.write.setTreasury([ctx.user.account.address]),
      );
      await expectRejects(() =>
        ctx.nft.write.setFeeRecipient([ZERO_ADDRESS], {
          client: { wallet: ctx.deployer },
        }),
      );
      await expectRejects(() =>
        ctx.nft.write.setTreasury([ZERO_ADDRESS], {
          client: { wallet: ctx.deployer },
        }),
      );
      await expectRejects(() =>
        ctx.nft.write.setMintFee([MINT_FEE], {
          client: { wallet: ctx.deployer },
        }),
      );
    });
  });

  describe("Grand prize state", () => {
    it("starts with no requested or awarded prize", async () => {
      assert.equal(await ctx.nft.read.lastRandomBlock(), 0n);
      assert.equal(await ctx.nft.read.grandPrizeAwarded(), false);
      assert.equal(await ctx.nft.read.winningTokenId(), 0n);
    });

    it("rejects winner finalization before the last NFT triggers the draw", async () => {
      await expectRejects(() =>
        ctx.nft.write.getWinningTokenId({
          client: { wallet: ctx.deployer },
        }),
      );
    });
  });

  describe("Withdrawal", () => {
    it("allows the owner to withdraw ETH prize-pool funds", async () => {
      await waitForTx(
        await ctx.nft.write.mint({
          client: { wallet: ctx.deployer },
          value: MINT_FEE,
        }),
      );
      assert.equal(await ctx.nft.read.getContractBalance(), MINT_FEE / 2n);

      await waitForTx(
        await ctx.nft.write.withdraw([ZERO_ADDRESS], {
          client: { wallet: ctx.deployer },
        }),
      );

      assert.equal(await ctx.nft.read.getContractBalance(), 0n);
    });

    it("rejects non-owner withdrawals and empty withdrawals", async () => {
      const nftAsUser = await getDomesticCatAs(ctx.nft.address, ctx.user);
      await expectRejects(() =>
        nftAsUser.write.withdraw([ZERO_ADDRESS]),
      );
      await expectRejects(() =>
        ctx.nft.write.withdraw([ZERO_ADDRESS], {
          client: { wallet: ctx.deployer },
        }),
      );
    });
  });

  describe("tokenURI", () => {
    beforeEach(async () => {
      await waitForTx(
        await ctx.nft.write.mint({
          client: { wallet: ctx.deployer },
          value: MINT_FEE,
        }),
      );
    });

    it("returns decodable JSON and SVG for existing tokens", async () => {
      const uri = await ctx.nft.read.tokenURI([0n]);
      const metadata = decodeTokenURI(uri);
      const svg = decodeImageDataURI(metadata.image);

      assert.equal(metadata.name, "DomesticCat #0");
      assert.ok(Array.isArray(metadata.attributes));
      assert.ok(svg.startsWith("<svg"));
      assert.ok(svg.endsWith("</svg>"));

      const attributes = Object.fromEntries(
        metadata.attributes.map((item: any) => [item.trait_type, item.value]),
      );
      assert.equal(attributes["Power Level"], 1);
      assert.equal(attributes["Max Power"], 100);
      assert.equal(attributes["AMeow Accumulated"], 0);
    });

    it("reflects power-up state in metadata", async () => {
      const amount = AMEOW_PER_POWER * 5n;
      await waitForTx(
        await ctx.ameow.write.approve([ctx.nft.address, amount], {
          client: { wallet: ctx.deployer },
        }),
      );
      await waitForTx(
        await ctx.nft.write.powerUpNFT([0n, amount], {
          client: { wallet: ctx.deployer },
        }),
      );

      const metadata = decodeTokenURI(await ctx.nft.read.tokenURI([0n]));
      const attributes = Object.fromEntries(
        metadata.attributes.map((item: any) => [item.trait_type, item.value]),
      );
      assert.equal(attributes["Power Level"], 6);
      assert.equal(attributes["Aura"], "Soft Silver");
      assert.equal(BigInt(String(attributes["AMeow Accumulated"])), amount);
    });

    it("rejects tokenURI for missing tokens", async () => {
      await expectRejects(() => ctx.nft.read.tokenURI([999n]));
    });
  });
});
