/**
 * DomesticCat — Minimal Connection Test
 */
import { describe, it, before } from "node:test";
import assert from "node:assert";
import hre from "hardhat";

describe("Minimal viem connection", () => {
  before(async () => {
    console.log("before: getting wallet clients...");
    const accounts = await hre.viem.getWalletClients();
    console.log("got wallet clients:", accounts.length);
  });

  it("can read chain ID", async () => {
    console.log("test: getting public client...");
    const pc = hre.viem.getPublicClient();
    console.log("got public client");
    const chainId = await pc.getChainId();
    console.log("chainId:", chainId);
    assert.ok(chainId > 0);
  });
});
