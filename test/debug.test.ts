/**
 * CatSVGRegistry — Debug Deployment Test
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import hre from "hardhat";

describe("CatSVGRegistry DEBUG", () => {
  let registry: any;

  beforeEach(async () => {
    const network = await hre.network.getOrCreate();
    const viem = network.viem;
    console.log("Deploying CatSVGRegistry...");
    registry = await viem.deployContract("CatSVGRegistry", []);
    console.log("Deployed at:", registry.address);
    console.log("Registry type:", typeof registry);
    console.log("Registry keys:", Object.keys(registry));
  });

  it("can call getBgTrait on deployed contract", async () => {
    console.log("Calling getBgTrait(0)...");
    try {
      const result = await registry.read.getBgTrait(0n);
      console.log("Result:", result);
      assert.equal(result, "Midnight");
    } catch (e: any) {
      console.log("Error calling getBgTrait:", e.message);
      throw e;
    }
  });
});
