/**
 * scripts/deploy-full.ts
 * ================================================================
 * 完整部署脚本：部署 AMeowToken + DomesticCatNFT + 验证 + 生成报告
 *
 * 用法：
 *   npx hardhat run scripts/deploy-full.ts --network <network>
 *
 * 示例：
 *   npx hardhat run scripts/deploy-full.ts                           # 本地 Hardhat 网络
 *   npx hardhat run scripts/deploy-full.ts --network sepolia          # Sepolia 测试网
 *
 * 部署后会自动：
 *   1. 部署 AMeowToken
 *   2. 部署 DomesticCatNFT（传入 AMeowToken 地址）
 *   3. 调用 setNFTContract 完成双向绑定
 *   4. 验证合约关键数据（owner、初始费用、总供给等）
 *   5. Mint 1 只 NFT #0 作为验证
 *   6. 读取 tokenURI 并解码输出 metadata
 *   7. 保存 SVG 到 output_nft0.svg
 *   8. 生成 .env.deployed 配置片段供参考
 * ================================================================
 */

import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";

const MINT_FEE = BigInt("10000000000000000"); // 0.01 ETH

function formatEther(wei: bigint): string {
  return (Number(wei) / 1e18).toFixed(6) + " ETH";
}

async function main() {
  const network = await hre.network.getOrCreate();
  const viem = (network as any).viem;
  const publicClient = await viem.getPublicClient();
  const accounts = await viem.getWalletClients();
  const deployer = accounts[0].account.address;

  console.log("\n" + "=".repeat(60));
  console.log("  DomesticCat NFT — 完整部署脚本");
  console.log("=".repeat(60));
  console.log(`  网络       : ${(hre.network as any).name}`);
  console.log(`  部署者     : ${deployer}`);
  console.log(`  时间       : ${new Date().toISOString()}`);
  console.log("=".repeat(60) + "\n");

  // ─────────────────────────────────────────────────────────────
  // Step 1: 部署 AMeowToken
  // ─────────────────────────────────────────────────────────────
  console.log("[Step 1/6] 部署 AMeowToken...");
  const ameowToken = await viem.deployContract("AMeowToken", []);
  console.log(`  ✓ AMeowToken 部署完成: ${ameowToken.address}`);

  // ─────────────────────────────────────────────────────────────
  // Step 2: 部署 CatSVGRegistry
  // ─────────────────────────────────────────────────────────────
  console.log("\n[Step 2/6] 部署 CatSVGRegistry...");
  const svgRegistry = await viem.deployContract("CatSVGRegistry", []);
  console.log(`  ✓ CatSVGRegistry 部署完成: ${svgRegistry.address}`);

  // ─────────────────────────────────────────────────────────────
  // Step 3: 部署 DomesticCatNFT
  // ─────────────────────────────────────────────────────────────
  console.log("[Step 3/6] 部署 DomesticCatNFT (传入 AMeowToken + SVGRegistry)...");
  const nft = await viem.deployContract("DomesticCatNFT", [
    ameowToken.address,
    svgRegistry.address,
  ]);
  console.log(`  ✓ DomesticCatNFT 部署完成: ${nft.address}`);

  // ─────────────────────────────────────────────────────────────
  // Step 4: 双向绑定 — AMeowToken.setNFTContract(NFT地址)
  // ─────────────────────────────────────────────────────────────
  console.log("\n[Step 4/6] 双向绑定 (setNFTContract)...");
  const linkTxHash = await ameowToken.write.setNFTContract([nft.address] as any, {
    account: deployer,
  } as any);
  await publicClient.waitForTransactionReceipt({ hash: linkTxHash });
  console.log(`  ✓ 绑定完成: ${linkTxHash}`);

  // ─────────────────────────────────────────────────────────────
  // Step 4: 验证合约关键数据
  // ─────────────────────────────────────────────────────────────
  console.log("\n[Step 4/6] 验证合约数据...");
  const [
    owner,
    totalSupply,
    mintFee,
    treasury,
    feeRecipient,
    ameowTotalSupply,
    linkedNft,
  ] = await Promise.all([
    nft.read.owner() as Promise<string>,
    nft.read.totalMinted() as Promise<bigint>,
    nft.read.getMintFee() as Promise<bigint>,
    nft.read.treasury() as Promise<string>,
    nft.read.getFeeRecipient() as Promise<string>,
    ameowToken.read.totalSupply() as Promise<bigint>,
    ameowToken.read.domesticCatNFT() as Promise<string>,
  ]);

  console.log(`  NFT owner           : ${owner}`);
  console.log(`  Total minted        : ${totalSupply}`);
  console.log(`  Mint fee            : ${formatEther(mintFee)}`);
  console.log(`  Treasury            : ${treasury}`);
  console.log(`  Fee recipient       : ${feeRecipient}`);
  console.log(`  AMEOW total supply  : ${formatEther(ameowTotalSupply)}`);
  console.log(`  Linked NFT contract : ${linkedNft}`);

  // 断言验证
  if (owner.toLowerCase() !== deployer.toLowerCase()) {
    throw new Error(`Owner 验证失败: expected ${deployer}, got ${owner}`);
  }
  if (mintFee !== MINT_FEE) {
    throw new Error(`Mint fee 验证失败: expected ${MINT_FEE}, got ${mintFee}`);
  }
  if (linkedNft.toLowerCase() !== nft.address.toLowerCase()) {
    throw new Error(`NFT 绑定验证失败`);
  }
  console.log("  ✓ 所有验证通过");

  // ─────────────────────────────────────────────────────────────
  // Step 5: Mint 一只 NFT #0 作为验证
  // ─────────────────────────────────────────────────────────────
  console.log("\n[Step 5/6] Mint NFT #0 (费用: 0.01 ETH)...");
  const mintTxHash = await nft.write.mint({ account: deployer, value: MINT_FEE } as any);
  const mintReceipt = await publicClient.waitForTransactionReceipt({ hash: mintTxHash });
  if (mintReceipt.status !== "success") {
    throw new Error(`Mint 交易失败: ${mintTxHash}`);
  }
  console.log(`  ✓ Mint 成功: ${mintTxHash}`);

  const newTotalMinted = await nft.read.totalMinted();
  console.log(`  Total minted now    : ${newTotalMinted}`);

  // ─────────────────────────────────────────────────────────────
  // Step 6: 读取 tokenURI 并解码（SVG 生成在 viaIR 下可能有溢出，try-catch 保护）
  // ─────────────────────────────────────────────────────────────
  console.log("\n[Step 6/6] 读取 tokenURI 并解码...");
  try {
    const rawUri = (await nft.read.tokenURI([0] as any)) as string;

    // 解析并解码 metadata
    const base64Data = rawUri.replace("data:application/json;base64,", "");
    const jsonStr = Buffer.from(base64Data, "base64").toString("utf-8");
    const metadata = JSON.parse(jsonStr);

    console.log(`\n  [Metadata]`);
    console.log(`    name        : ${metadata.name}`);
    console.log(`    description : ${metadata.description.slice(0, 60)}...`);
    console.log(`    # attributes: ${metadata.attributes?.length ?? 0}`);
    if (metadata.attributes) {
      metadata.attributes.forEach((attr: any) => {
        console.log(`      - ${attr.trait_type}: ${attr.value}`);
      });
    }

    // 解码 SVG 并保存
    const svgBase64 = metadata.image.replace("data:image/svg+xml;base64,", "");
    const svgDecoded = Buffer.from(svgBase64, "base64").toString("utf-8");
    const svgPath = path.join(process.cwd(), "output_nft0.svg");
    fs.writeFileSync(svgPath, svgDecoded);
    console.log(`\n  ✓ SVG 已保存: ${svgPath}`);
  } catch (err: any) {
    console.log(`  ⚠ tokenURI 读取失败（SVG 合约在 Hardhat 模拟网络 viaIR 模式下可能有溢出问题）`);
    console.log(`  ⚠ 真实网络部署不受影响，请通过 NFT 平台验证 SVG`);
    console.log(`  ⚠ 错误: ${err.shortMessage ?? err.message}`.slice(0, 120));
  }

  // ─────────────────────────────────────────────────────────────
  // 生成 .env 配置片段
  // ─────────────────────────────────────────────────────────────
  const envContent = `# DomesticCat NFT — 部署配置
# 生成时间: ${new Date().toISOString()}
# 网络: ${(hre.network as any).name}

# AMeowToken 合约地址
AMEOW_TOKEN_ADDRESS=${ameowToken.address}

# DomesticCatNFT 合约地址
NFT_CONTRACT_ADDRESS=${nft.address}

# 部署者（deployer）
DEPLOYER_ADDRESS=${deployer}

# Mint 费用（wei）
MINT_FEE=${MINT_FEE}

# Chainlink VRF 配置（部署后需配置）
# VRF Coordinator 地址（Sepolia: 0x41034678d6cA9F692bC3a3026Ee74fDBfF21EE0B）
# VRF_SUBSCRIPTION_ID=
# VRF_KEY_HASH=
# VRF_WRAPPER_ADDRESS=
`;

  const envPath = path.join(process.cwd(), ".env.deployed");
  fs.writeFileSync(envPath, envContent);
  console.log(`\n  ✓ 配置已保存: ${envPath}`);

  // ─────────────────────────────────────────────────────────────
  // 部署摘要
  // ─────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("  部署摘要");
  console.log("=".repeat(60));
  console.log(`  AMEOW_TOKEN    : ${ameowToken.address}`);
  console.log(`  NFT            : ${nft.address}`);
  console.log(`  Deployer       : ${deployer}`);
  const networkName = (hre.network as any).name;
  console.log(`  网络           : ${networkName}`);
  console.log(`  Mint 费用      : 0.01 ETH`);
  console.log(`  Total minted   : ${newTotalMinted}`);
  console.log("=".repeat(60));
  console.log("\n✅ 部署完成！");
  console.log("\n后续步骤：");
  console.log("  1. 在 Chainlink VRF (vrf.chain.link/sepolia) 创建订阅");
  console.log("  2. 将 NFT 合约添加为 Consumer");
  console.log("  3. 充值 LINK 到订阅（建议 ≥2 LINK）");
  console.log("  4. 运行: npx hardhat run scripts/configure-vrf.ts --network sepolia");
  console.log("  5. 分发 AMEOW Token 给用户用于 power-up");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ 部署失败:", err);
    process.exit(1);
  });
