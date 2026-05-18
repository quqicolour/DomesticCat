/**
 * scripts/deploy-interactive.ts
 * ================================================================
 * 交互式部署脚本 — 通过命令行参数选择部署网络和操作
 *
 * 用法（交互模式）：
 *   npx hardhat run scripts/deploy-interactive.ts
 *
 * 用法（参数模式）：
 *   npx hardhat run scripts/deploy-interactive.ts -- --network sepolia --action deploy
 * ================================================================
 */

import * as readline from "readline";

interface DeployResult {
  ameowToken: string;
  nft: string;
  deployer: string;
  network: string;
}

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  let networkName = "hardhat";
  let action = "deploy";

  // 解析简单参数
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--network" && args[i + 1]) networkName = args[i + 1];
    if (args[i] === "--action" && args[i + 1]) action = args[i + 1];
  }

  const hre = await import("hardhat");
  const network = hre.network;
  const viem = network.viem;
  const publicClient = await viem.getPublicClient();
  const accounts = await viem.getWalletClients();

  if (!accounts || accounts.length === 0) {
    console.error("❌ 没有可用的钱包账户");
    process.exit(1);
  }

  const deployer = accounts[0].account.address;

  console.log("\n" + "=".repeat(55));
  console.log("  DomesticCat — 交互式部署工具");
  console.log("=".repeat(55));
  console.log(`  网络   : ${network.name}`);
  console.log(`  部署者 : ${deployer}`);
  console.log("=".repeat(55));

  // 获取已部署地址（如果存在）
  let ameowTokenAddress = process.env.AMEOW_TOKEN_ADDRESS;
  let nftAddress = process.env.NFT_CONTRACT_ADDRESS;

  const fs = await import("fs");
  if (!ameowTokenAddress && fs.existsSync(".env.deployed")) {
    const envContent = fs.readFileSync(".env.deployed", "utf-8");
    const match = envContent.match(/AMEOW_TOKEN_ADDRESS=(0x[a-fA-F0-9]+)/);
    if (match) ameowTokenAddress = match[1];
    const nftMatch = envContent.match(/NFT_CONTRACT_ADDRESS=(0x[a-fA-F0-9]+)/);
    if (nftMatch) nftAddress = nftMatch[1];
  }

  console.log(`\n已部署合约:`);
  console.log(`  AMEOW_TOKEN : ${ameowTokenAddress ?? "(未部署)"}`);
  console.log(`  NFT         : ${nftAddress ?? "(未部署)"}`);

  const choice = await ask(`
请选择操作：
  [1] 完整部署（deploy + mint + 验证）
  [2] 仅部署合约（不 mint）
  [3] 验证已部署合约
  [4] Mint NFT
  [5] 配置 Chainlink VRF
  [6] 查询合约状态
  [0] 退出
>
`);

  switch (choice) {
    case "1":
    case "2": {
      console.log("\n开始部署...");

      // 部署 AMeowToken
      console.log("[1/3] 部署 AMeowToken...");
      const ameowToken = await viem.deployContract("AMeowToken", []);
      ameowTokenAddress = ameowToken.address;
      console.log(`  ✓ ${ameowToken.address}`);

      // 部署 NFT
      console.log("[2/3] 部署 DomesticCatNFT...");
      const nft = await viem.deployContract("DomesticCatNFT", [ameowTokenAddress]);
      nftAddress = nft.address;
      console.log(`  ✓ ${nft.address}`);

      // 绑定
      console.log("[3/3] setNFTContract...");
      await ameowToken.write.setNFTContract([nftAddress] as any, { account: deployer } as any);
      console.log("  ✓ 绑定完成");

      // 保存 .env.deployed
      const envContent = `# DomesticCat — 部署配置\n# ${new Date().toISOString()}\n\nAMEOW_TOKEN_ADDRESS=${ameowTokenAddress}\nNFT_CONTRACT_ADDRESS=${nftAddress}\nDEPLOYER_ADDRESS=${deployer}\nMINT_FEE=10000000000000000\n`;
      fs.writeFileSync(".env.deployed", envContent);
      console.log("  ✓ 配置已保存到 .env.deployed");

      if (choice === "1") {
        // Mint NFT #0
        const MINT_FEE = BigInt("10000000000000000");
        console.log("\n[Mint] 铸造 NFT #0...");
        const nft = await viem.getContractAt("DomesticCatNFT", nftAddress!);
        const tx = await nft.write.mint({ account: deployer, value: MINT_FEE } as any);
        await publicClient.waitForTransactionReceipt({ hash: tx });
        console.log(`  ✓ Mint 成功: ${tx}`);

        // 输出 tokenURI
        const uri = (await nft.read.tokenURI([0] as any)) as string;
        console.log(`  tokenURI: ${uri.slice(0, 60)}...`);
      }

      console.log("\n✅ 部署完成！");
      console.log(`   AMEOW_TOKEN : ${ameowTokenAddress}`);
      console.log(`   NFT         : ${nftAddress}`);
      break;
    }

    case "3": {
      if (!ameowTokenAddress || !nftAddress) {
        console.error("❌ 请先部署合约");
        break;
      }
      const nft = await viem.getContractAt("DomesticCatNFT", nftAddress);
      const ameowToken = await viem.getContractAt("AMeowToken", ameowTokenAddress);

      const [owner, totalMinted, mintFee, treasury, ameowTotal, linkedNft, vrfCoord] =
        await Promise.all([
          nft.read.owner(),
          nft.read.totalMinted(),
          nft.read.getMintFee(),
          nft.read.treasury(),
          ameowToken.read.totalSupply(),
          ameowToken.read.domesticCatNFT(),
          nft.read.vrfCoordinator(),
        ]);

      console.log("\n合约验证报告");
      console.log("─".repeat(40));
      console.log(`Owner             : ${owner}`);
      console.log(`Total Minted      : ${totalMinted}`);
      console.log(`Mint Fee          : ${Number(mintFee) / 1e18} ETH`);
      console.log(`Treasury          : ${treasury}`);
      console.log(`AMEOW Total Supply: ${Number(ameowTotal) / 1e18} AMEOW`);
      console.log(`Linked NFT        : ${linkedNft}`);
      console.log(`VRF Coordinator   : ${vrfCoord}`);
      console.log("─".repeat(40));
      break;
    }

    case "4": {
      if (!nftAddress) { console.error("❌ 请先部署 NFT 合约"); break; }
      const countStr = await ask("输入要 mint 的数量 [1]: ");
      const count = parseInt(countStr || "1", 10);
      const MINT_FEE = BigInt("10000000000000000");
      const nft = await viem.getContractAt("DomesticCatNFT", nftAddress);
      const totalFee = MINT_FEE * BigInt(count);

      console.log(`\nMint ${count} 只 NFT (费用: ${Number(totalFee) / 1e18} ETH)...`);
      const tx = await nft.write.batchMint([BigInt(count)] as any, {
        account: deployer,
        value: totalFee,
      } as any);
      await publicClient.waitForTransactionReceipt({ hash: tx });
      console.log(`✓ 完成: ${tx}`);
      const total = await nft.read.totalMinted();
      console.log(`Total minted: ${total}`);
      break;
    }

    case "5": {
      console.log("\n请先在 .env 中设置 VRF_SUBSCRIPTION_ID 和 VRF_KEY_HASH");
      console.log("然后运行: npx hardhat run scripts/configure-vrf.ts --network sepolia");
      break;
    }

    case "6": {
      if (!nftAddress) { console.error("❌ 请先部署 NFT 合约"); break; }
      const nft = await viem.getContractAt("DomesticCatNFT", nftAddress);
      const total = await nft.read.totalMinted();
      const prize = await nft.read.getContractBalance();
      const minted = total;
      const pct = (Number(minted) / 10000 * 100).toFixed(2);
      console.log(`\n总铸造: ${minted} / 10000 (${pct}%)`);
      console.log(`奖金池: ${Number(prize) / 1e18} ETH`);
      break;
    }

    default:
      console.log("退出");
  }
}

main().catch((err) => {
  console.error("\n❌ 错误:", err.message ?? err);
  process.exit(1);
});
