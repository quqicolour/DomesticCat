/**
 * Full deployment script for Hardhat 3 + viem.
 *
 * Flow:
 *   AMeowToken -> CatSVGRegistry -> DomesticCatNFT -> bind token -> verify -> optional mint #0
 *
 * Usage:
 *   npx hardhat run scripts/deploy-full.ts
 *   npx hardhat run scripts/deploy-full.ts --network baseSepolia
 *
 * Environment:
 *   SKIP_SAMPLE_MINT=true    Skip the sample mint.
 */

import "./env.ts";
import hre from "hardhat";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { formatEther } from "viem";

const MINT_FEE = 1_000_000_000_000_000n;

async function wait(hash: `0x${string}`) {
  const connection = await hre.network.getOrCreate();
  const publicClient = await connection.viem.getPublicClient();
  return publicClient.waitForTransactionReceipt({ hash });
}

function parseMetadata(uri: string) {
  const b64 = uri.replace("data:application/json;base64,", "");
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

async function main() {
  const connection = await hre.network.getOrCreate();
  const viem = connection.viem;
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();
  const chainId = await publicClient.getChainId();
  const networkName = String(hre.globalOptions.network ?? "hardhat");

  console.log("================================================================================");
  console.log("  DomesticCat NFT - Full Deployment");
  console.log("================================================================================");
  console.log(`  Network  : ${networkName} (chainId=${chainId})`);
  console.log(`  Deployer : ${deployer.account.address}`);
  console.log(`  Balance  : ${formatEther(await publicClient.getBalance({ address: deployer.account.address }))} ETH`);
  console.log("================================================================================\n");

  console.log("[1/6] Deploying AMeowToken...");
  const ameow = await viem.deployContract("AMeowToken", [], {
    client: { wallet: deployer },
  });
  console.log(`  AMeowToken     : ${ameow.address}\n`);

  console.log("[2/6] Deploying CatSVGRegistry...");
  const registry = await viem.deployContract("CatSVGRegistry", [], {
    client: { wallet: deployer },
  });
  console.log(`  CatSVGRegistry : ${registry.address}\n`);

  console.log("[3/6] Deploying DomesticCatNFT...");
  const nft = await viem.deployContract(
    "DomesticCatNFT",
    [ameow.address, registry.address],
    { client: { wallet: deployer } },
  );
  console.log(`  DomesticCatNFT : ${nft.address}\n`);

  console.log("[4/6] Binding AMeowToken to DomesticCatNFT...");
  await wait(
    await ameow.write.setNFTContract([nft.address], {
      client: { wallet: deployer },
    }),
  );
  console.log("  Binding complete\n");

  console.log("[5/6] Verifying deployment state...");
  const checks = [
    ["AMEOW_TOKEN", ameow.address, await nft.read.AMEOW_TOKEN()],
    ["SVG_REGISTRY", registry.address, await nft.read.SVG_REGISTRY()],
    ["AMEOW_BOUND_NFT", nft.address, await ameow.read.domesticCatNFT()],
    ["MINT_FEE", MINT_FEE.toString(), (await nft.read.getMintFee()).toString()],
    ["TREASURY", deployer.account.address, await nft.read.treasury()],
  ];

  for (const [label, expected, actual] of checks) {
    const pass = expected.toLowerCase() === actual.toLowerCase();
    console.log(`  ${pass ? "OK" : "FAIL"} ${label}: ${actual}`);
    if (!pass) throw new Error(`Deployment check failed: ${label}`);
  }
  console.log("");

  let sampleMintHash = "";
  if (process.env.SKIP_SAMPLE_MINT === "true") {
    console.log("[6/6] Sample mint skipped by SKIP_SAMPLE_MINT=true\n");
  } else {
    console.log("[6/6] Minting sample NFT #0...");
    sampleMintHash = await nft.write.mint({
      client: { wallet: deployer },
      value: MINT_FEE,
    });
    await wait(sampleMintHash as `0x${string}`);

    const [owner, power, totalMinted, prizePool] = await Promise.all([
      nft.read.ownerOf([0n]),
      nft.read.getNFTPowerLevel([0n]),
      nft.read.totalMinted(),
      nft.read.getContractBalance(),
    ]);
    console.log(`  Mint tx      : ${sampleMintHash}`);
    console.log(`  Token #0     : ${owner}`);
    console.log(`  Power        : ${power}`);
    console.log(`  Total minted : ${totalMinted}`);
    console.log(`  Prize pool   : ${formatEther(prizePool)} ETH`);

    const metadata = parseMetadata(await nft.read.tokenURI([0n]));
    console.log(`  Metadata     : ${metadata.name}`);
    console.log("  Metadata JSON:");
    console.log(JSON.stringify(metadata, null, 2));
    console.log("");
  }

  if (!existsSync("deployments")) mkdirSync("deployments");
  const deployment = {
    network: networkName,
    chainId: chainId.toString(),
    deployer: deployer.account.address,
    contracts: {
      ameowToken: ameow.address,
      catSVGRegistry: registry.address,
      domesticCatNFT: nft.address,
    },
    mintFeeWei: MINT_FEE.toString(),
    sampleMintHash,
    deployedAt: new Date().toISOString(),
  };

  const jsonPath = `deployments/${networkName}-${chainId}.json`;
  writeFileSync(jsonPath, JSON.stringify(deployment, null, 2));
  writeFileSync(
    ".env.deployed",
    [
      `NETWORK=${networkName}`,
      `CHAIN_ID=${chainId}`,
      `AMEOW_TOKEN_ADDRESS=${ameow.address}`,
      `SVG_REGISTRY_ADDRESS=${registry.address}`,
      `NFT_CONTRACT_ADDRESS=${nft.address}`,
      `DEPLOYER=${deployer.account.address}`,
      `MINT_FEE=${MINT_FEE}`,
      `SAMPLE_MINT_HASH=${sampleMintHash}`,
    ].join("\n"),
  );

  console.log("================================================================================");
  console.log("Deployment complete");
  console.log(`  JSON summary : ${jsonPath}`);
  console.log("  Env summary  : .env.deployed");
  console.log("================================================================================");
}

main().catch((error) => {
  console.error("\nDeployment failed:", error?.message ?? error);
  process.exitCode = 1;
});
