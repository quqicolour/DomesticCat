import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  decodeImageDataURI,
  decodeTokenURI,
  deployRegistryFixture,
} from "./helpers.ts";

describe("CatSVGRegistry", () => {
  let ctx: Awaited<ReturnType<typeof deployRegistryFixture>>;

  beforeEach(async () => {
    ctx = await deployRegistryFixture();
  });

  describe("Trait getters", () => {
    it("maps tokenId deterministically to visible trait names", async () => {
      assert.equal(await ctx.registry.read.getBgTrait([0n]), "Midnight");
      assert.equal(await ctx.registry.read.getBgTrait([9n]), "Violet Night");
      assert.equal(await ctx.registry.read.getBodyTrait([2n]), "Wheat");
      assert.equal(await ctx.registry.read.getEyeTrait([8n]), "Amber");
      assert.equal(await ctx.registry.read.getPatternTrait([0n]), "Stripes");
      assert.equal(await ctx.registry.read.getPatternTrait([9n]), "Solid");
    });

    it("wraps visual traits by tokenId modulo 10", async () => {
      assert.equal(await ctx.registry.read.getBgTrait([42n]), await ctx.registry.read.getBgTrait([2n]));
      assert.equal(await ctx.registry.read.getBodyTrait([99n]), await ctx.registry.read.getBodyTrait([9n]));
      assert.deepEqual(await ctx.registry.read.variantIndices([123n]), [3n, 3n, 3n, 3n]);
    });

    it("maps power levels to aura tiers", async () => {
      assert.equal(await ctx.registry.read.getAuraTrait([0]), "None");
      assert.equal(await ctx.registry.read.getAuraTrait([5]), "None");
      assert.equal(await ctx.registry.read.getAuraTrait([6]), "Soft Silver");
      assert.equal(await ctx.registry.read.getAuraTrait([20]), "Soft Silver");
      assert.equal(await ctx.registry.read.getAuraTrait([21]), "Ethereal Cyan");
      assert.equal(await ctx.registry.read.getAuraTrait([50]), "Ethereal Cyan");
      assert.equal(await ctx.registry.read.getAuraTrait([51]), "Mystic Purple");
      assert.equal(await ctx.registry.read.getAuraTrait([80]), "Mystic Purple");
      assert.equal(await ctx.registry.read.getAuraTrait([81]), "Legendary Gold");
      assert.equal(await ctx.registry.read.getAuraTrait([100]), "Legendary Gold");
    });
  });

  describe("SVG generation", () => {
    it("returns a complete SVG document", async () => {
      const svg = await ctx.registry.read.generateSVG([0n, 1]);
      assert.ok(svg.startsWith("<svg"));
      assert.ok(svg.endsWith("</svg>"));
      assert.ok(svg.includes('viewBox="0 0 400 400"'));
      assert.ok(svg.includes("<ellipse"));
      assert.ok(svg.includes("<polygon"));
    });

    it("is deterministic for the same token and power", async () => {
      const first = await ctx.registry.read.generateSVG([777n, 51]);
      const second = await ctx.registry.read.generateSVG([777n, 51]);
      assert.equal(first, second);
    });

    it("changes visual evolution markers as power increases", async () => {
      const low = await ctx.registry.read.generateSVG([1n, 1]);
      const high = await ctx.registry.read.generateSVG([1n, 90]);
      assert.notEqual(low, high);
      assert.ok(high.includes("#FFD700"));
      assert.ok(high.length > low.length);
    });

    it("keeps SVG size in a practical on-chain range", async () => {
      const svg = await ctx.registry.read.generateSVG([42n, 50]);
      assert.ok(svg.length > 1_000);
      assert.ok(svg.length < 8_000);
    });
  });

  describe("Token metadata", () => {
    it("builds a base64 JSON data URI", async () => {
      const uri = await ctx.registry.read.buildTokenURI([42n, 10, 500n, 100n]);
      assert.ok(uri.startsWith("data:application/json;base64,"));
    });

    it("decodes into marketplace-compatible metadata", async () => {
      const uri = await ctx.registry.read.buildTokenURI([42n, 10, 500n, 100n]);
      const metadata = decodeTokenURI(uri);

      assert.equal(metadata.name, "DomesticCat #42");
      assert.equal(typeof metadata.description, "string");
      assert.ok(metadata.description.includes("AMeow"));
      assert.ok(metadata.image.startsWith("data:image/svg+xml;base64,"));
      assert.ok(Array.isArray(metadata.attributes));

      const attributes = Object.fromEntries(
        metadata.attributes.map((item: any) => [item.trait_type, item.value]),
      );
      assert.equal(attributes["Background"], "Royal");
      assert.equal(attributes["Aura"], "Soft Silver");
      assert.equal(attributes["Power Level"], 10);
      assert.equal(attributes["Max Power"], 100);
      assert.equal(attributes["AMeow Accumulated"], 500);
    });

    it("embeds a decodable SVG image", async () => {
      const uri = await ctx.registry.read.buildTokenURI([7n, 90, 1000n, 100n]);
      const metadata = decodeTokenURI(uri);
      const svg = decodeImageDataURI(metadata.image);

      assert.ok(svg.startsWith("<svg"));
      assert.ok(svg.includes("#FFD700"));
      assert.ok(svg.endsWith("</svg>"));
    });
  });
});
