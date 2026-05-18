/**
 * scripts/configure-vrf.ts
 * ================================================================
 * Chainlink VRF 配置脚本 — 部署后必须执行此脚本完成 VRF 配置
 *
 * 用法：
 *   npx hardhat run scripts/configure-vrf.ts --network sepolia
 *
 * 前置条件：
 *   1. 已在 vrf.chain.link/sepolia 创建 VRF 订阅
 *   2. 订阅已充值 LINK（建议 ≥2 LINK）
 *   3. 订阅已添加 NFT 合约为 Consumer
 *
 * 参数（通过环境变量传入）：
 *   VRF_SUBSCRIPTION_ID   VRF 订阅 ID
 *   VRF_KEY_HASH           VRF Key Hash
 *   VRF_WRAPPER_ADDRESS    VRF v2.5 Wrapper 地址（可选，BSC/Polygon 用）
 * ================================================================
 */

import hre from "hardhat";

async function main() {
  const network = hre.network;
  const viem = network.viem;
  const publicClient = await viem.getPublicClient();
  const accounts = await viem.getWalletClients();
  const owner = accounts[0].account.address;

  // 从环境变量读取 VRF 配置
  const subscriptionId = process.env.VRF_SUBSCRIPTION_ID;
  const keyHash = process.env.VRF_KEY_HASH;
  const wrapperAddress = process.env.VRF_WRAPPER_ADDRESS;

  if (!subscriptionId || !keyHash) {
    console.error("\n❌ 缺少必需参数，请设置环境变量：");
    console.error("   export VRF_SUBSCRIPTION_ID=your_subscription_id");
    console.error("   export VRF_KEY_HASH=your_key_hash");
    console.error("   export VRF_WRAPPER_ADDRESS=wrapper_address  # 可选，VRF v2.5");
    console.error("\n或在 .env.deployed 文件中配置后运行：");
    console.error("   source .env.deployed");
    process.exit(1);
  }

  console.log("\n" + "=".repeat(60));
  console.log("  Chainlink VRF 配置脚本");
  console.log("=".repeat(60));
  console.log(`  网络            : ${network.name}`);
  console.log(`  部署者/Owner   : ${owner}`);
  console.log(`  Subscription ID: ${subscriptionId}`);
  console.log(`  Key Hash        : ${keyHash}`);
  if (wrapperAddress) {
    console.log(`  Wrapper Address : ${wrapperAddress}`);
  }
  console.log("=".repeat(60) + "\n");

  // 读取 .env.deployed 获取合约地址（如果存在）
  const nftAddress = process.env.NFT_CONTRACT_ADDRESS;
  if (!nftAddress) {
    console.error("❌ 缺少 NFT_CONTRACT_ADDRESS，请先运行 deploy-full.ts");
    process.exit(1);
  }

  const nft = await viem.getContractAt("DomesticCatNFT", nftAddress);

  // 验证 owner
  const contractOwner = await nft.read.owner();
  if (contractOwner.toLowerCase() !== owner.toLowerCase()) {
    console.error(`❌ 只有合约 owner 才能配置 VRF`);
    console.error(`   合约 owner: ${contractOwner}`);
    console.error(`   当前账户: ${owner}`);
    process.exit(1);
  }
  console.log("✓ Owner 验证通过\n");

  // 判断使用 VRF v2 还是 v2.5
  if (wrapperAddress) {
    // VRF v2.5（BSC, Polygon 等 L2）
    console.log("[VRF v2.5] 配置中...");

    // BSC Mainnet VRF Coordinator
    const vrfCoordinator = "0x6E2b5a2f3e2f6a2F3E2F6a2F3E2F6a2F3E2F6a2F"; // TODO: 替换为实际 BSC VRF Coordinator
    const txHash = await nft.write.configureVRFv2_5([
      vrfCoordinator,
      BigInt(subscriptionId),
      keyHash as `0x${string}`,
      wrapperAddress as `0x${string}`,
    ] as any, { account: owner } as any);

    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`✓ VRF v2.5 配置完成: ${txHash}`);

    const config = await nft.read.vrfCoordinator();
    console.log(`  VRF Coordinator : ${config}`);
    console.log(`  Subscription ID  : ${await nft.read.vrfSubscriptionId()}`);
    console.log(`  Key Hash         : ${await nft.read.vrfKeyHash()}`);
    console.log(`  Wrapper          : ${await nft.read.vrfWrapper()}`);
    console.log(`  VRF v2.5 模式    : ${await nft.read.useVRFV2_5()}`);
  } else {
    // VRF v2（Ethereum Sepolia）
    console.log("[VRF v2] 配置中...");

    // Sepolia VRF Coordinator
    const vrfCoordinator = "0x41034678d6cA9F692bC3a3026Ee74fDBfF21EE0B";
    // Sepolia LINK Token
    const linkToken = "0x779877A7B0D9E8603169DdbD7836e483b60f4C64";

    const txHash = await nft.write.configureVRFv2([
      vrfCoordinator as `0x${string}`,
      BigInt(subscriptionId),
      keyHash as `0x${string}`,
      linkToken as `0x${string}`,
    ] as any, { account: owner } as any);

    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`✓ VRF v2 配置完成: ${txHash}`);

    console.log(`  VRF Coordinator : ${await nft.read.vrfCoordinator()}`);
    console.log(`  Subscription ID  : ${await nft.read.vrfSubscriptionId()}`);
    console.log(`  Key Hash         : ${await nft.read.vrfKeyHash()}`);
    console.log(`  LINK Token       : ${await nft.read.linkToken()}`);
    console.log(`  VRF v2.5 模式    : ${await nft.read.useVRFV2_5()}`);
  }

  // 配置 callback gas limit 和确认数
  console.log("\n[额外配置] 设置 VRF 回调参数...");
  await nft.write.setCallbackGasLimit([100000] as any, { account: owner } as any);
  await nft.write.setRequestConfirmations([3] as any, { account: owner } as any);
  console.log(`  callbackGasLimit    : ${await nft.read.callbackGasLimit()}`);
  console.log(`  requestConfirmations: ${await nft.read.requestConfirmations()}`);

  console.log("\n" + "=".repeat(60));
  console.log("✅ VRF 配置完成！");
  console.log("=".repeat(60));
  console.log("\n验证步骤：");
  console.log("  1. 在 vrf.chain.link/sepolia 确认订阅中已列出此合约");
  console.log("  2. 确认订阅余额充足（≥2 LINK）");
  console.log("  3. 第 10,000 只 NFT mint 时大奖将自动触发");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ VRF 配置失败:", err);
    process.exit(1);
  });
