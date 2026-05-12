/**
 * CatSVGRegistry — Debug Deployment Test 2
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import hre from "hardhat";

describe("CatSVGRegistry DEBUG 2", () => {
  let registry: any;

  beforeEach(async () => {
    const network = await hre.network.getOrCreate();
    const viem = network.viem;
    registry = await viem.deployContract("CatSVGRegistry", []);
    console.log("Registry abi functions:", registry.abi.filter((f: any) => f.type === 'function').map((f: any) => f.name));
  });

  it("call getBgTrait — explicit args array", async () => {
    // Try explicit array instead of spread
    const result = await registry.read.getBgTrait([0n]);
    console.log("Result:", result);
    assert.equal(result, "Midnight");
  });

  it("call variantIndices", async () => {
    const r = await registry.read.variantIndices([0n]);
    console.log("variantIndices result:", r);
  });
});
