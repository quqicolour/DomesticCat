/**
 * Deploy DomesticCat NFT project + mint one NFT and print its SVG base64
 * Run: npx hardhat run scripts/deploy-and-mint.ts --network <network>
 */

import hre from "hardhat";

async function main() {
  const network = await hre.network.getOrCreate();
  const viem = network.viem;
  const publicClient = await viem.getPublicClient();
  const accounts = await viem.getWalletClients();
  const deployer = accounts[0].account.address;

  console.log("========================================");
  console.log("  DomesticCat NFT — Deploy & Mint Script");
  console.log("========================================");
  console.log("Network:", hre.network.name);
  console.log("Deployer:", deployer);
  console.log("");

  // 1. Deploy AMeowToken
  console.log("[1/4] Deploying AMeowToken...");
  const ameowToken = await viem.deployContract("AMeowToken", []);
  console.log("  AMEOW_TOKEN addr:", ameowToken.address);

  // 2. Deploy DomesticCatNFT
  console.log("[2/4] Deploying DomesticCatNFT...");
  const nft = await viem.deployContract("DomesticCatNFT", [ameowToken.address]);
  console.log("  NFT addr:", nft.address);

  // 3. Link AMEOW → NFT (set NFT contract on token)
  console.log("[3/4] Linking AMEOW_TOKEN → NFT contract...");
  const linkTxHash = await ameowToken.write.setNFTContract([nft.address] as any, {
    account: deployer,
  } as any);
  await publicClient.waitForTransactionReceipt({ hash: linkTxHash });
  console.log("  Linked! tx:", linkTxHash);

  // 4. Mint one NFT (0.01 ETH)
  const mintFee = BigInt("10000000000000000"); // 0.01 ETH
  console.log("[4/4] Minting NFT #0 (fee: 0.01 ETH)...");
  const mintTxHash = await nft.write.mint({ account: deployer, value: mintFee } as any);
  const mintReceipt = await publicClient.waitForTransactionReceipt({ hash: mintTxHash });
  console.log("  Minted! tx:", mintTxHash, "| status:", mintReceipt.status);
  console.log("");

  // 5. Read tokenURI for NFT #0
  console.log("========================================");
  console.log("  TokenURI & SVG Output");
  console.log("========================================");
  const rawUri = (await nft.read.tokenURI([0] as any)) as string;
  console.log("\n[Full tokenURI]");
  console.log(rawUri);
  console.log("");

  // Parse and decode
  const base64Data = rawUri.replace("data:application/json;base64,", "");
  const jsonStr = Buffer.from(base64Data, "base64").toString("utf-8");
  const metadata = JSON.parse(jsonStr);

  console.log("\n[Decoded Metadata]");
  console.log("  name        :", metadata.name);
  console.log("  description :", metadata.description.slice(0, 80) + "...");
  console.log("  # attributes:", metadata.attributes?.length ?? 0);

  if (metadata.attributes) {
    metadata.attributes.forEach((attr: any) => {
      console.log(`    - ${attr.trait_type}: ${attr.value}`);
    });
  }

  // Extract and decode SVG
  const svgBase64 = metadata.image.replace("data:image/svg+xml;base64,", "");
  const svgDecoded = Buffer.from(svgBase64, "base64").toString("utf-8");

  console.log("\n[SVG base64 — paste into browser or decode at base64decode.org]");
  console.log(svgBase64);
  console.log("");

  console.log("[SVG decoded (first 500 chars)]");
  console.log(svgDecoded.slice(0, 500));
  if (svgDecoded.length > 500) {
    console.log(`  ... (${svgDecoded.length} total chars)`);
  }

  // Save SVG to file for easy viewing
  const fs = await import("fs");
  const svgPath = "./output_nft0.svg";
  fs.writeFileSync(svgPath, svgDecoded);
  console.log("\n[Saved SVG to]", svgPath);

  // Contract summary
  console.log("\n========================================");
  console.log("  Deployment Summary");
  console.log("========================================");
  console.log("  AMEOW_TOKEN :", ameowToken.address);
  console.log("  NFT         :", nft.address);
  console.log("  MINT_FEE    : 0.01 ETH");
  console.log("  TOTAL_SUPPLY:", String(await nft.read.MAX_SUPPLY()));
  console.log("  Total minted:", String(await nft.read.totalMinted()));
  console.log("  Prize pool  :", String(await nft.read.getContractBalance()), "wei");
  console.log("  Treasury    :", await nft.read.treasury());
  console.log("  Fee recipient:", await nft.read.getFeeRecipient());
  console.log("");
  console.log("Done!  Deploy and mint complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n[ERROR]", err);
    process.exit(1);
  });
