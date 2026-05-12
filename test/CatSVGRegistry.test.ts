/**
 * CatSVGRegistry — Complete Test Suite
 * Hardhat 3 + Node.js node:test + Viem
 * Run with: npx hardhat test test/CatSVGRegistry.test.ts
 *
 * NOTE: viem contract read calls require ARRAY arguments: ([arg1, arg2])
 * not positional: (arg1, arg2)
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import hre from "hardhat";

describe("CatSVGRegistry", () => {
  let registry: any;

  beforeEach(async () => {
    const network = await hre.network.getOrCreate();
    const viem = network.viem;
    registry = await viem.deployContract("CatSVGRegistry", []);
  });

  // =====================================================================
  // variantIndices
  // =====================================================================
  describe("variantIndices", () => {
    it("tokenId=0: all indices = 0", async () => {
      const r = await registry.read.variantIndices([0n]);
      assert.equal(r[0], 0n);
      assert.equal(r[1], 0n);
      assert.equal(r[2], 0n);
      assert.equal(r[3], 0n);
    });

    it("tokenId=100: bg=4, body=4, eye=4, pat=2", async () => {
      const r = await registry.read.variantIndices([100n]);
      assert.equal(r[0], 4n);   // 100 % 12 = 4
      assert.equal(r[1], 4n);   // 100 % 16 = 4
      assert.equal(r[2], 4n);   // 100 % 12 = 4
      assert.equal(r[3], 2n);   // 100 % 7  = 2
    });

    it("tokenId=83: bg=11, body=3, eye=11, pat=6", async () => {
      const r = await registry.read.variantIndices([83n]);
      assert.equal(r[0], 11n);  // 83 % 12 = 11
      assert.equal(r[1], 3n);   // 83 % 16 = 3
      assert.equal(r[2], 11n);  // 83 % 12 = 11
      assert.equal(r[3], 6n);   // 83 % 7  = 6
    });

    it("deterministic: same tokenId always returns same result", async () => {
      const r1 = await registry.read.variantIndices([9999n]);
      const r2 = await registry.read.variantIndices([9999n]);
      assert.equal(r1[0], r2[0]);
      assert.equal(r1[1], r2[1]);
      assert.equal(r1[2], r2[2]);
      assert.equal(r1[3], r2[3]);
    });
  });

  // =====================================================================
  // trait getters
  // =====================================================================
  describe("getBgTrait", () => {
    it("tokenId=0 → Midnight", async () => {
      assert.equal(await registry.read.getBgTrait([0n]), "Midnight");
    });
    it("tokenId=1 → Ocean", async () => {
      assert.equal(await registry.read.getBgTrait([1n]), "Ocean");
    });
    it("tokenId=11 → Arctic", async () => {
      assert.equal(await registry.read.getBgTrait([11n]), "Arctic");
    });
    it("wraps at 12 → Midnight", async () => {
      assert.equal(await registry.read.getBgTrait([12n]), "Midnight");
    });
  });

  describe("getBodyTrait", () => {
    it("tokenId=0 → Light Pink", async () => {
      assert.equal(await registry.read.getBodyTrait([0n]), "Light Pink");
    });
    it("tokenId=15 → Pink", async () => {
      assert.equal(await registry.read.getBodyTrait([15n]), "Pink");
    });
    it("wraps at 16 → Light Pink", async () => {
      assert.equal(await registry.read.getBodyTrait([16n]), "Light Pink");
    });
  });

  describe("getEyeTrait", () => {
    it("tokenId=0 → Royal Blue", async () => {
      assert.equal(await registry.read.getEyeTrait([0n]), "Royal Blue");
    });
    it("tokenId=11 → Medium Spring Green", async () => {
      assert.equal(await registry.read.getEyeTrait([11n]), "Medium Spring Green");
    });
    it("wraps at 12 → Royal Blue", async () => {
      assert.equal(await registry.read.getEyeTrait([12n]), "Royal Blue");
    });
  });

  describe("getPatternTrait", () => {
    it("tokenId=0 → Tiger Stripes", async () => {
      assert.equal(await registry.read.getPatternTrait([0n]), "Tiger Stripes");
    });
    it("tokenId=6 → Solid", async () => {
      assert.equal(await registry.read.getPatternTrait([6n]), "Solid");
    });
    it("wraps at 7 → Tiger Stripes", async () => {
      assert.equal(await registry.read.getPatternTrait([7n]), "Tiger Stripes");
    });
  });

  describe("getAuraTrait", () => {
    it("0 → None",      async () => assert.equal(await registry.read.getAuraTrait([0n]),  "None"));
    it("5 → None",      async () => assert.equal(await registry.read.getAuraTrait([5n]),  "None"));
    it("6 → Soft Silver",    async () => assert.equal(await registry.read.getAuraTrait([6n]),  "Soft Silver"));
    it("20 → Soft Silver",    async () => assert.equal(await registry.read.getAuraTrait([20n]), "Soft Silver"));
    it("21 → Ethereal Cyan",  async () => assert.equal(await registry.read.getAuraTrait([21n]), "Ethereal Cyan"));
    it("50 → Ethereal Cyan",  async () => assert.equal(await registry.read.getAuraTrait([50n]), "Ethereal Cyan"));
    it("51 → Mystic Purple",  async () => assert.equal(await registry.read.getAuraTrait([51n]), "Mystic Purple"));
    it("80 → Mystic Purple",  async () => assert.equal(await registry.read.getAuraTrait([80n]), "Mystic Purple"));
    it("81 → Legendary Gold",  async () => assert.equal(await registry.read.getAuraTrait([81n]), "Legendary Gold"));
    it("100 → Legendary Gold", async () => assert.equal(await registry.read.getAuraTrait([100n]), "Legendary Gold"));
  });

  // =====================================================================
  // generateSVG
  // =====================================================================
  describe("generateSVG", () => {
    it("returns string starting with <svg", async () => {
      const svg: string = await registry.read.generateSVG([0n, 0n, 0n, 0n, 0n, 0n]);
      assert(svg.startsWith("<svg"));
      assert(svg.endsWith("</svg>"));
    });

    it("includes viewBox 0 0 400 400", async () => {
      const svg: string = await registry.read.generateSVG([0n, 0n, 0n, 0n, 0n, 0n]);
      assert(svg.includes('viewBox="0 0 400 400"'));
    });

    it("includes SVG namespace", async () => {
      const svg: string = await registry.read.generateSVG([0n, 0n, 0n, 0n, 0n, 0n]);
      assert(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
    });

    it("power=0: no aura elements", async () => {
      const svg: string = await registry.read.generateSVG([0n, 0n, 0n, 0n, 0n, 0n]);
      assert(!svg.includes("#D8D8D8"), "power=0 should not have silver aura");
    });

    it("power=15: includes silver aura #D8D8D8", async () => {
      const svg: string = await registry.read.generateSVG([0n, 0n, 0n, 0n, 0n, 15n]);
      assert(svg.includes("#D8D8D8"));
    });

    it("power=35: includes cyan aura #00FFFF", async () => {
      const svg: string = await registry.read.generateSVG([0n, 0n, 0n, 0n, 0n, 35n]);
      assert(svg.includes("#00FFFF"));
    });

    it("power=65: includes purple aura #DA70D6", async () => {
      const svg: string = await registry.read.generateSVG([0n, 0n, 0n, 0n, 0n, 65n]);
      assert(svg.includes("#DA70D6"));
    });

    it("power=95: includes gold aura #FFD700", async () => {
      const svg: string = await registry.read.generateSVG([0n, 0n, 0n, 0n, 0n, 95n]);
      assert(svg.includes("#FFD700"));
    });

    it("power=95: legendary has extra rings", async () => {
      const svg: string = await registry.read.generateSVG([0n, 0n, 0n, 0n, 0n, 95n]);
      assert(svg.includes("stroke="));
    });

    it("includes cat body ellipse", async () => {
      const svg: string = await registry.read.generateSVG([0n, 0n, 0n, 0n, 0n, 0n]);
      assert(svg.includes('<ellipse cx="200" cy="205" r="150"'));
    });

    it("includes triangular ear polygons", async () => {
      const svg: string = await registry.read.generateSVG([0n, 0n, 0n, 0n, 0n, 0n]);
      assert(svg.includes("<polygon points="));
    });

    it("includes eye ellipses with ry=20", async () => {
      const svg: string = await registry.read.generateSVG([0n, 0n, 0n, 0n, 0n, 0n]);
      assert(svg.includes('ry="20"'));
    });

    it("includes 6 whisker lines", async () => {
      const svg: string = await registry.read.generateSVG([0n, 0n, 0n, 0n, 0n, 0n]);
      const matches = svg.match(/<line x1=/g);
      assert(matches !== null);
      assert.equal(matches.length, 6);
    });

    it("different tokenIds produce different SVGs", async () => {
      const svg0: string = await registry.read.generateSVG([0n, 0n, 0n, 0n, 0n, 0n]);
      const svg1: string = await registry.read.generateSVG([1n, 0n, 0n, 0n, 0n, 0n]);
      assert.notEqual(svg0, svg1);
    });

    it("token 9999 generates valid SVG", async () => {
      const svg: string = await registry.read.generateSVG([9999n, 0n, 0n, 0n, 0n, 0n]);
      assert(svg.startsWith("<svg"));
      assert(svg.includes('<rect width="400" height="400"'));
    });
  });

  // =====================================================================
  // buildTokenURI
  // =====================================================================
  describe("buildTokenURI", () => {
    it("returns data:application/json;base64, prefix", async () => {
      const uri: string = await registry.read.buildTokenURI([0n, 0n, 0n, 0n]);
      assert(uri.startsWith("data:application/json;base64,"));
    });

    it("decodes to valid JSON with name DomesticCat #0", async () => {
      const uri: string = await registry.read.buildTokenURI([0n, 0n, 0n, 0n]);
      const b64 = uri.replace("data:application/json;base64,", "");
      const jsonStr = Buffer.from(b64, "base64").toString("utf-8");
      const json = JSON.parse(jsonStr);
      assert.equal(json.name, "DomesticCat #0");
      assert.equal(typeof json.description, "string");
      assert(json.image.startsWith("data:image/svg+xml;base64,"));
    });

    it("includes all 8 attribute types", async () => {
      const uri: string = await registry.read.buildTokenURI([0n, 50n, 100n, 80n]);
      const b64 = uri.replace("data:application/json;base64,", "");
      const jsonStr = Buffer.from(b64, "base64").toString("utf-8");
      const json = JSON.parse(jsonStr);
      const types = json.attributes.map((a: any) => a.trait_type);
      assert(types.includes("Background"));
      assert(types.includes("Body Color"));
      assert(types.includes("Eye Color"));
      assert(types.includes("Pattern"));
      assert(types.includes("Aura"));
      assert(types.includes("Power Level"));
      assert(types.includes("Max Power"));
      assert(types.includes("AMeow Accumulated"));
    });

    it("Power Level = 55 when passed", async () => {
      const uri: string = await registry.read.buildTokenURI([0n, 55n, 0n, 0n]);
      const b64 = uri.replace("data:application/json;base64,", "");
      const jsonStr = Buffer.from(b64, "base64").toString("utf-8");
      const json = JSON.parse(jsonStr);
      const attr = json.attributes.find((a: any) => a.trait_type === "Power Level");
      assert.equal(attr.value, 55);
    });

    it("AMeow Accumulated = 1234 when passed", async () => {
      const uri: string = await registry.read.buildTokenURI([0n, 0n, 1234n, 0n]);
      const b64 = uri.replace("data:application/json;base64,", "");
      const jsonStr = Buffer.from(b64, "base64").toString("utf-8");
      const json = JSON.parse(jsonStr);
      const attr = json.attributes.find((a: any) => a.trait_type === "AMeow Accumulated");
      assert.equal(attr.value, 1234);
    });

    it("Max Power = 80 when passed", async () => {
      const uri: string = await registry.read.buildTokenURI([0n, 50n, 0n, 80n]);
      const b64 = uri.replace("data:application/json;base64,", "");
      const jsonStr = Buffer.from(b64, "base64").toString("utf-8");
      const json = JSON.parse(jsonStr);
      const attr = json.attributes.find((a: any) => a.trait_type === "Max Power");
      assert.equal(attr.value, 80);
    });

    it("Aura = None when power=0", async () => {
      const uri: string = await registry.read.buildTokenURI([0n, 0n, 0n, 0n]);
      const b64 = uri.replace("data:application/json;base64,", "");
      const jsonStr = Buffer.from(b64, "base64").toString("utf-8");
      const json = JSON.parse(jsonStr);
      const attr = json.attributes.find((a: any) => a.trait_type === "Aura");
      assert.equal(attr.value, "None");
    });

    it("Aura = Legendary Gold when power=95", async () => {
      const uri: string = await registry.read.buildTokenURI([0n, 95n, 0n, 100n]);
      const b64 = uri.replace("data:application/json;base64,", "");
      const jsonStr = Buffer.from(b64, "base64").toString("utf-8");
      const json = JSON.parse(jsonStr);
      const attr = json.attributes.find((a: any) => a.trait_type === "Aura");
      assert.equal(attr.value, "Legendary Gold");
    });

    it("decoded image is valid SVG", async () => {
      const uri: string = await registry.read.buildTokenURI([0n, 0n, 0n, 0n]);
      const b64 = uri.replace("data:application/json;base64,", "");
      const jsonStr = Buffer.from(b64, "base64").toString("utf-8");
      const json = JSON.parse(jsonStr);
      const svgB64 = json.image.replace("data:image/svg+xml;base64,", "");
      const svg = Buffer.from(svgB64, "base64").toString("utf-8");
      assert(svg.startsWith("<svg"));
      assert(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
    });

    it("Eye Color = Royal Blue for tokenId=0", async () => {
      const uri: string = await registry.read.buildTokenURI([0n, 0n, 0n, 0n]);
      const b64 = uri.replace("data:application/json;base64,", "");
      const jsonStr = Buffer.from(b64, "base64").toString("utf-8");
      const json = JSON.parse(jsonStr);
      const attr = json.attributes.find((a: any) => a.trait_type === "Eye Color");
      assert.equal(attr.value, "Royal Blue");
    });

    it("Body Color = Light Pink for tokenId=0", async () => {
      const uri: string = await registry.read.buildTokenURI([0n, 0n, 0n, 0n]);
      const b64 = uri.replace("data:application/json;base64,", "");
      const jsonStr = Buffer.from(b64, "base64").toString("utf-8");
      const json = JSON.parse(jsonStr);
      const attr = json.attributes.find((a: any) => a.trait_type === "Body Color");
      assert.equal(attr.value, "Light Pink");
    });

    it("Background = Midnight for tokenId=0", async () => {
      const uri: string = await registry.read.buildTokenURI([0n, 0n, 0n, 0n]);
      const b64 = uri.replace("data:application/json;base64,", "");
      const jsonStr = Buffer.from(b64, "base64").toString("utf-8");
      const json = JSON.parse(jsonStr);
      const attr = json.attributes.find((a: any) => a.trait_type === "Background");
      assert.equal(attr.value, "Midnight");
    });
  });

  // =====================================================================
  // Integration: uniqueness
  // =====================================================================
  describe("integration: unique SVGs", () => {
    it("all first 50 tokenIds produce unique SVGs", async () => {
      const svgs: string[] = [];
      for (let i = 0; i < 50; i++) {
        const svg: string = await registry.read.generateSVG([BigInt(i), 0n, 0n, 0n, 0n, 0n]);
        svgs.push(svg);
      }
      const unique = new Set(svgs);
      assert.equal(unique.size, 50);
    });

    it("tokenId determinism: calling twice gives same SVG", async () => {
      const svg1: string = await registry.read.generateSVG([42n, 0n, 0n, 0n, 0n, 0n]);
      const svg2: string = await registry.read.generateSVG([42n, 0n, 0n, 0n, 0n, 0n]);
      assert.equal(svg1, svg2);
    });
  });
});
