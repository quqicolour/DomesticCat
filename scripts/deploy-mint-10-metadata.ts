/**
 * Deploy all DomesticCat contracts, mint 10 NFTs, and write their decoded
 * token metadata to testMetadata.json.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-mint-10-metadata.ts
 *   npx hardhat run scripts/deploy-mint-10-metadata.ts --network baseSepolia
 */

import "./env.ts";
import hre from "hardhat";
import { writeFileSync } from "fs";
import { formatEther } from "viem";

const MINT_FEE = 1_000_000_000_000_000n;
const MINT_COUNT = 10n;

async function wait(hash: `0x${string}`) {
  const connection = await hre.network.getOrCreate();
  const publicClient = await connection.viem.getPublicClient();
  return publicClient.waitForTransactionReceipt({ hash });
}

function decodeTokenURI(uri: string) {
  const prefix = "data:application/json;base64,";
  if (!uri.startsWith(prefix)) {
    throw new Error(`Unexpected tokenURI prefix: ${uri.slice(0, 40)}`);
  }

  return JSON.parse(Buffer.from(uri.slice(prefix.length), "base64").toString("utf8"));
}

async function main() {
  const connection = await hre.network.getOrCreate();
  const viem = connection.viem;
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();
  const chainId = await publicClient.getChainId();
  const networkName = String(hre.globalOptions.network ?? "hardhat");

  console.log("================================================================================");
  console.log("  DomesticCat NFT - Deploy, Mint 10, Export Metadata");
  console.log("================================================================================");
  console.log(`  Network  : ${networkName} (chainId=${chainId})`);
  console.log(`  Deployer : ${deployer.account.address}`);
  console.log(`  Balance  : ${formatEther(await publicClient.getBalance({ address: deployer.account.address }))} ETH`);
  console.log("================================================================================\n");

  console.log("[1/5] Deploying contracts...");
  const ameow = await viem.deployContract("AMeowToken", [], {
    client: { wallet: deployer },
  });
  const registry = await viem.deployContract("CatSVGRegistry", [], {
    client: { wallet: deployer },
  });
  const nft = await viem.deployContract(
    "DomesticCatNFT",
    [ameow.address, registry.address],
    { client: { wallet: deployer } },
  );
  console.log(`  AMeowToken     : ${ameow.address}`);
  console.log(`  CatSVGRegistry : ${registry.address}`);
  console.log(`  DomesticCatNFT : ${nft.address}\n`);

  console.log("[2/5] Binding AMeowToken to DomesticCatNFT...");
  await wait(
    await ameow.write.setNFTContract([nft.address], {
      client: { wallet: deployer },
    }),
  );
  console.log("  Binding complete\n");

  console.log("[3/5] Minting 10 NFTs...");
  const mintHash = await nft.write.batchMint([MINT_COUNT], {
    client: { wallet: deployer },
    value: MINT_FEE * MINT_COUNT,
  });
  await wait(mintHash);
  console.log(`  Mint tx      : ${mintHash}`);
  console.log(`  Total minted : ${await nft.read.totalMinted()}`);
  console.log(`  Prize pool   : ${formatEther(await nft.read.getContractBalance())} ETH\n`);

  console.log("[4/5] Reading and decoding metadata...");
  const tokens = [];
  for (let tokenId = 0n; tokenId < MINT_COUNT; tokenId++) {
    const owner = await nft.read.ownerOf([tokenId]);
    const tokenURI = await nft.read.tokenURI([tokenId]);
    const metadata = decodeTokenURI(tokenURI);

    tokens.push({
      tokenId: tokenId.toString(),
      owner,
      tokenURI,
      metadata,
    });

    console.log(`  #${tokenId}: ${metadata.name}`);
  }
  console.log("");

  console.log("[5/5] Writing testMetadata.json...");
  const output = {
    network: networkName,
    chainId: chainId.toString(),
    deployer: deployer.account.address,
    contracts: {
      ameowToken: ameow.address,
      catSVGRegistry: registry.address,
      domesticCatNFT: nft.address,
    },
    mint: {
      count: MINT_COUNT.toString(),
      feePerNftWei: MINT_FEE.toString(),
      transactionHash: mintHash,
    },
    tokens,
    exportedAt: new Date().toISOString(),
  };

  writeFileSync("testMetadata.json", JSON.stringify(output, null, 2));
  console.log("  Wrote testMetadata.json");
  console.log("================================================================================");
}

main().catch((error) => {
  console.error("\nScript failed:", error?.message ?? error);
  process.exitCode = 1;
});
