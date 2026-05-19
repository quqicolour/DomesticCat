/**
 * Interactive utility for local demos and deployed contracts.
 *
 * Usage:
 *   npx hardhat run scripts/interactive.ts
 *   npx hardhat run scripts/interactive.ts --network baseSepolia
 */

import "./env.ts";
import hre from "hardhat";
import { existsSync, readFileSync, writeFileSync } from "fs";
import readline from "readline";
import { formatEther, parseEther, zeroAddress } from "viem";

const MINT_FEE = 1_000_000_000_000_000n;

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function getClients() {
  const connection = await hre.network.getOrCreate();
  const viem = connection.viem;
  const publicClient = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();
  return { connection, viem, publicClient, wallet };
}

async function wait(hash: `0x${string}`) {
  const { publicClient } = await getClients();
  return publicClient.waitForTransactionReceipt({ hash });
}

function loadDeployed() {
  if (!existsSync(".env.deployed")) return null;

  const values: Record<string, string> = {};
  for (const line of readFileSync(".env.deployed", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    values[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return values;
}

async function getContracts() {
  const deployed = loadDeployed();
  if (deployed === null) {
    console.log("No .env.deployed file found. Run option [1] first.\n");
    return null;
  }

  const { viem, wallet } = await getClients();
  const ameow = await viem.getContractAt("AMeowToken", deployed.AMEOW_TOKEN_ADDRESS as `0x${string}`, {
    client: { wallet },
  });
  const registry = await viem.getContractAt("CatSVGRegistry", deployed.SVG_REGISTRY_ADDRESS as `0x${string}`, {
    client: { wallet },
  });
  const nft = await viem.getContractAt("DomesticCatNFT", deployed.NFT_CONTRACT_ADDRESS as `0x${string}`, {
    client: { wallet },
  });

  return { deployed, ameow, registry, nft, wallet };
}

async function deployAll() {
  const { viem, publicClient, wallet, connection } = await getClients();
  const chainId = await publicClient.getChainId();
  const networkName = String(hre.globalOptions.network ?? "hardhat");

  console.log("\nDeploying DomesticCat contracts...");
  console.log(`Deployer: ${wallet.account.address}`);

  const ameow = await viem.deployContract("AMeowToken", [], {
    client: { wallet },
  });
  console.log(`AMeowToken     : ${ameow.address}`);

  const registry = await viem.deployContract("CatSVGRegistry", [], {
    client: { wallet },
  });
  console.log(`CatSVGRegistry : ${registry.address}`);

  const nft = await viem.deployContract("DomesticCatNFT", [ameow.address, registry.address], {
    client: { wallet },
  });
  console.log(`DomesticCatNFT : ${nft.address}`);

  await wait(await ameow.write.setNFTContract([nft.address], { client: { wallet } }));
  console.log("Binding complete.");

  writeFileSync(
    ".env.deployed",
    [
      `NETWORK=${networkName}`,
      `CHAIN_ID=${chainId}`,
      `AMEOW_TOKEN_ADDRESS=${ameow.address}`,
      `SVG_REGISTRY_ADDRESS=${registry.address}`,
      `NFT_CONTRACT_ADDRESS=${nft.address}`,
      `DEPLOYER=${wallet.account.address}`,
      `MINT_FEE=${MINT_FEE}`,
    ].join("\n"),
  );

  console.log(".env.deployed updated.\n");
}

async function queryStatus() {
  const contracts = await getContracts();
  if (contracts === null) return;
  const { deployed, ameow, nft, wallet } = contracts;
  const [fee, total, balance, treasury, owner, supply] = await Promise.all([
    nft.read.getMintFee(),
    nft.read.totalMinted(),
    nft.read.getContractBalance(),
    nft.read.treasury(),
    nft.read.owner(),
    ameow.read.totalSupply(),
  ]);

  console.log("\nContract status");
  console.log("--------------------------------------------------------------------------------");
  console.log(`Network        : ${deployed.NETWORK} (${deployed.CHAIN_ID})`);
  console.log(`Wallet         : ${wallet.account.address}`);
  console.log(`Owner          : ${owner}`);
  console.log(`AMeowToken     : ${deployed.AMEOW_TOKEN_ADDRESS}`);
  console.log(`CatSVGRegistry : ${deployed.SVG_REGISTRY_ADDRESS}`);
  console.log(`DomesticCatNFT : ${deployed.NFT_CONTRACT_ADDRESS}`);
  console.log(`Mint fee       : ${formatEther(fee)} ETH`);
  console.log(`Total minted   : ${total} / 10000`);
  console.log(`Prize pool     : ${formatEther(balance)} ETH`);
  console.log(`Treasury       : ${treasury}`);
  console.log(`AMEOW supply   : ${formatEther(supply)} AMEOW\n`);
}

async function mintNft() {
  const contracts = await getContracts();
  if (contracts === null) return;
  const { nft, wallet } = contracts;

  const quantityText = await ask("Mint quantity [1]: ");
  const quantity = BigInt(quantityText || "1");
  const totalFee = (await nft.read.getMintFee()) * quantity;

  const hash =
    quantity === 1n
      ? await nft.write.mint({ client: { wallet }, value: totalFee })
      : await nft.write.batchMint([quantity], { client: { wallet }, value: totalFee });

  await wait(hash);
  console.log(`Minted ${quantity} NFT(s). totalMinted=${await nft.read.totalMinted()}\n`);
}

async function powerUpNft() {
  const contracts = await getContracts();
  if (contracts === null) return;
  const { ameow, nft, wallet } = contracts;

  const tokenId = BigInt(await ask("Token ID [0]: ") || "0");
  const amountText = await ask("AMEOW amount [10]: ");
  const amount = parseEther(amountText || "10");

  await wait(await ameow.write.approve([nft.address, amount], { client: { wallet } }));
  await wait(await nft.write.powerUpNFT([tokenId, amount], { client: { wallet } }));

  console.log(`Power level: ${await nft.read.getNFTPowerLevel([tokenId])}\n`);
}

async function showTokenUri() {
  const contracts = await getContracts();
  if (contracts === null) return;
  const { nft } = contracts;

  const tokenId = BigInt(await ask("Token ID [0]: ") || "0");
  const uri = await nft.read.tokenURI([tokenId]);
  const metadata = JSON.parse(
    Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString("utf8"),
  );
  console.log(`\n${metadata.name}`);
  for (const attr of metadata.attributes) {
    console.log(`${attr.trait_type}: ${attr.value}`);
  }
  console.log("");
}

async function finalizePrize() {
  const contracts = await getContracts();
  if (contracts === null) return;
  const { nft, wallet } = contracts;

  await wait(await nft.write.getWinningTokenId({ client: { wallet } }));
  console.log(`Winning token ID: ${await nft.read.winningTokenId()}\n`);
}

async function withdrawEth() {
  const contracts = await getContracts();
  if (contracts === null) return;
  const { nft, wallet } = contracts;

  const balance = await nft.read.getContractBalance();
  console.log(`Contract balance: ${formatEther(balance)} ETH`);
  if (balance === 0n) return;

  const confirm = (await ask("Withdraw as owner? [y/N]: ")).toLowerCase();
  if (confirm !== "y") return;

  await wait(await nft.write.withdraw([zeroAddress], { client: { wallet } }));
  console.log("Withdraw complete.\n");
}

async function menu() {
  console.log("================================================================================");
  console.log("DomesticCat NFT - Interactive Utility");
  console.log("================================================================================");
  console.log("[1] Deploy all contracts");
  console.log("[2] Query status");
  console.log("[3] Mint NFT");
  console.log("[4] Power-up NFT");
  console.log("[5] Read tokenURI");
  console.log("[6] Finalize grand prize");
  console.log("[7] Withdraw ETH");
  console.log("[0] Exit");
  console.log("================================================================================");

  const choice = await ask("Choose [0-7]: ");
  if (choice === "0") return;

  if (choice === "1") await deployAll();
  else if (choice === "2") await queryStatus();
  else if (choice === "3") await mintNft();
  else if (choice === "4") await powerUpNft();
  else if (choice === "5") await showTokenUri();
  else if (choice === "6") await finalizePrize();
  else if (choice === "7") await withdrawEth();

  await menu();
}

menu().catch((error) => {
  console.error("Error:", error?.message ?? error);
  process.exitCode = 1;
});
