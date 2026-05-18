# DomesticCat NFT

链上 SVG 生成 NFT 项目 — 10,000 只独一无二的猫咪，基于 Hardhat 3 + Solidity 0.8.28 + viem 2.x。

每只猫咪的外观由 tokenId 纯链上生成（keccak256 决定颜色/花纹），猫咪持有者可通过充入 AMeow Token 提升 power 等级，SVG 外观随之进化。当第 10,000 只 NFT 被 mint 时，奖金池（所有 mint 费用的 50%）通过 Chainlink VRF 随机分配给中奖猫咪的持有者。

---

## 目录

- [快速开始](#快速开始)
- [项目架构](#项目架构)
- [合约详解](#合约详解)
- [部署指南](#部署指南)
- [合约交互](#合约交互)
- [SVG 视觉系统](#svg-视觉系统)
- [Chainlink VRF 配置](#chainlink-vrf-配置)
- [脚本说明](#脚本说明)
- [测试](#测试)
- [目录结构](#目录结构)

---

## 快速开始

### 安装依赖

```bash
npm install
```

### 本地网络部署（一步到位）

```bash
npx hardhat run scripts/deploy-full.ts
```

### 运行测试

```bash
npx hardhat test                 # 所有测试
npx hardhat test nodejs         # 仅 node:test 测试
```

### 编译合约

```bash
npx hardhat compile
```

---

## 项目架构

### 技术栈

| 类别 | 技术 |
|------|------|
| 智能合约 | Hardhat 3 + Solidity 0.8.28 |
| 合约交互 | viem 2.x |
| 测试框架 | Node.js `node:test` |
| 部署 | Hardhat Ignition |
| 依赖库 | OpenZeppelin Contracts 5.6.1 |

### 合约架构

```
AMeowToken (ERC20) ──burnFrom()──► DomesticCatNFT (ERC721)
      │                                      │
      │ setNFTContract()                     │ tokenURI()
      │                                      ▼
      │                            CatSVGRegistry (纯函数)
      │                                      │
      └──────────────────────────────────────┘
```

**部署顺序**：
1. 部署 `AMeowToken`
2. 部署 `DomesticCatNFT`（传入 AMeowToken 地址）
3. 调用 `ameowToken.setNFTContract(nftAddress)` 完成双向绑定

---

## 合约详解

### 1. AMeowToken.sol

标准 ERC20，总量 100 万枚。

- `MAX_SUPPLY = 1_000_000 * 10^18`
- `setNFTContract()` — 一次性设置 NFT 合约地址
- `burnFrom(from, amount)` — 仅可由 NFT 合约调用，power-up 时燃烧 token

### 2. DomesticCatNFT.sol

主 NFT 合约（ERC721），核心参数：

| 常量 | 值 | 说明 |
|------|----|------|
| `MAX_SUPPLY` | 10,000 | 最大发行量 |
| `MAX_POWER_LEVEL` | 100 | 最大 power 等级 |
| `AMEOW_PER_POWER` | 10 * 10^18 | 每 10 AMEOW 提升 1 power |
| `MINT_FEE` | 0.01 ether | 默认 mint 费用 |

**费用分拆**：每次 mint，50% 打入 treasury，50% 留在合约作为大奖池。

**Power 进化**：

| Power 等级 | Aura 光环 | 胸口徽章 |
|------------|-----------|---------|
| 1–5 | 无 | 无 |
| 6–20 | Soft Silver | 小灰球 |
| 21–50 | Ethereal Cyan | 中青球 |
| 51–80 | Mystic Purple | 大紫球 |
| 81–100 | Legendary Gold | 超大金球 + 双层光环 |

**Chainlink VRF**：第 10,000 只 NFT mint 时自动触发，`randomWords[0] % 10000` 选出中奖 tokenId，奖金池全部转入中奖者。

### 3. CatSVGRegistry.sol

链上 SVG 生成引擎，所有方法 `pure`，零 storage 读取。

- 颜色通过 `keccak256(tokenId, tag)` 确定性生成（RGB 范围 [50, 254]）
- `buildTokenURI()` — 生成 base64-encoded JSON（含 SVG + metadata）
- SVG 拼接分块（aura、pattern、tail、whiskers 等），解决 stack-too-deep 问题

### 4. CatSVGLib.sol

纯函数工具库，从主合约分离以降低字节码体积（避免超过 EIP-170 的 24576 字节限制）。

---

## 部署指南

### 方式一：完整部署脚本（推荐）

```bash
# 1. 部署到本地网络
npx hardhat run scripts/deploy-full.ts

# 2. 部署到 Sepolia（需配置环境变量）
export SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
export SEPOLIA_PRIVATE_KEY=0xYourPrivateKey
npx hardhat run scripts/deploy-full.ts --network sepolia
```

部署脚本自动完成：
- 部署 AMeowToken
- 部署 DomesticCatNFT
- 调用 `setNFTContract` 完成绑定
- 验证合约关键数据
- Mint NFT #0 验证 SVG 生成
- 保存 `.env.deployed` 配置文件

### 方式二：交互式部署

```bash
npx hardhat run scripts/deploy-interactive.ts
# 选择操作：完整部署 / 仅部署 / Mint / VRF 配置 / 查询状态
```

### 方式三：Hardhat Ignition

```bash
# 本地网络
npx hardhat ignition deploy ignition/modules/Deploy.ts

# Sepolia
npx hardhat ignition deploy --network sepolia ignition/modules/Deploy.ts
```

### Sepolia 部署环境变量

```bash
export SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
export SEPOLIA_PRIVATE_KEY=0xYourPrivateKey
```

或使用 Hardhat Keystore：

```bash
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat keystore set SEPOLIA_RPC_URL
```

### 部署后必做

1. 记录 `AMEOW_TOKEN_ADDRESS` 和 `NFT_CONTRACT_ADDRESS`
2. 在 [Chainlink VRF](https://vrf.chain.link/sepolia) 创建订阅
3. 订阅充值 LINK（建议 ≥2 LINK）
4. 将 NFT 合约添加为 Consumer
5. 配置 VRF：`npx hardhat run scripts/configure-vrf.ts --network sepolia`
6. 分发 AMEOW Token 给用户用于 power-up

---

## 合约交互

### Mint NFT

```typescript
import { createWalletClient, http, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount("0x" + PK);
const client = createWalletClient({
  account,
  transport: http("https://sepolia.infura.io/v3/YOUR_KEY"),
});

const mintFee = 10_000_000_000_000_000n; // 0.01 ETH
const txHash = await client.writeContract({
  address: NFT_ADDRESS,
  abi: [...], // DomesticCatNFT ABI
  functionName: "mint",
  value: mintFee,
});
```

### 批量 Mint

```typescript
const quantity = 5n;
await nft.write.batchMint([quantity], {
  account: userAddress,
  value: mintFee * quantity,
});
```

### Power-Up（提升 NFT 等级）

```typescript
// 1. 授权 NFT 合约使用你的 AMEOW
await ameowToken.write.approve([nftAddress, amount], {
  account: userAddress,
});

// 2. 调用 power-up（每 10 AMEOW 提升 1 power）
await nft.write.powerUpNFT([tokenId, amount], {
  account: userAddress,
});
```

### 读取 tokenURI

```typescript
const uri = (await nft.read.tokenURI([tokenId])) as string;
// uri 格式: data:application/json;base64,{base64(JSON)}
// JSON.image: data:image/svg+xml;base64,{base64(SVG)}
```

### 查询 Power 等级

```typescript
const power = await nft.read.getNFTPowerLevel([tokenId]);
```

### 治理操作（仅 Owner）

```typescript
// 修改 mint 费用
await nft.write.setMintFee([newFee], { account: owner });

// 修改费用接收地址
await nft.write.setFeeRecipient([newRecipient], { account: owner });

// 修改国库地址
await nft.write.setTreasury([newTreasury], { account: owner });
```

---

## SVG 视觉系统

### 属性决定表

所有视觉属性由 tokenId 纯算决定（确定性，无链上随机源）：

| 属性 | 取值数量 | 决定方式 |
|------|---------|---------|
| 背景主题 | 12 种 | `tokenId % 12` |
| 身体颜色 | 16 种 | `keccak256(tokenId, 0x10)` → RGB 映射 |
| 眼睛虹膜 | 12 种 | `keccak256(tokenId, 0x13)` → RGB 映射 |
| 花纹类型 | 7 种 | `tokenId % 7` |
| Aura 光环 | 5 级 | 由 power 等级决定 |

### 花纹类型

| Index | 名称 | 视觉效果 |
|-------|------|---------|
| 0 | Tiger Stripes | 三道弧形条纹 |
| 1 | Spotted | 5 个圆点散布 |
| 2 | Heart Mark | 额头心形 |
| 3 | Marble Swirls | 两道波浪线 |
| 4 | Star Marked | 3 个光点 |
| 5 | Dotted | 5 个小圆点 |
| 6 | Solid | 纯色无花纹 |

### SVG 结构

```
<svg viewBox="0 0 400 400">
  ├── 背景层（背景色 + 半透明叠加 + 星星）
  ├── Aura 光环（power 6+ 显现，颜色随等级变化）
  ├── 身体（椭圆形猫身 + 阴影）
  ├── 花纹层（7 种图案之一）
  ├── 四肢（椭圆形爪子 + 尾巴）
  ├── 头部（圆形 + 腮部阴影）
  ├── 耳朵（三角形 + 内耳）
  ├── 眼睛（白底 + 虹膜 + 瞳孔 + 高光）
  ├── 鼻子 + 嘴巴 + 6 根胡须
  ├── 胸口徽章（power 6+ 显现，大小随等级变化）
  └── </svg>
```

---

## Chainlink VRF 配置

### 工作原理

```
mint() → _tokenIdCounter == 10000 → _requestRandomWords()
                                         │
                    ┌────────────────────┴────────────────────┐
                 VRF v2                                     VRF v2.5
            (Ethereum)                                  (BSC/Polygon L2)
                                         │
                              VRF Coordinator 返回 requestId
                                         │
                              链下生成随机数，调用 rawFulfillRandomWords()
                                         │
                              winningTokenId = randomWords[0] % 10000
                                         │
                              (address(this).balance) → winner
```

### VRF v2 配置（Ethereum Sepolia）

```bash
export VRF_SUBSCRIPTION_ID=your_subscription_id
export VRF_KEY_HASH=your_key_hash
npx hardhat run scripts/configure-vrf.ts --network sepolia
```

### VRF v2.5 配置（BSC/Polygon）

```bash
export VRF_SUBSCRIPTION_ID=your_subscription_id
export VRF_KEY_HASH=your_key_hash
export VRF_WRAPPER_ADDRESS=your_wrapper_address
npx hardhat run scripts/configure-vrf.ts --network bsc
```

### 重要提示

> ⚠️ 如果在第 10,000 只 NFT mint 时 VRF 未配置（`vrfCoordinator == address(0)`），交易会 revert，大奖无法发放。建议在 mint 达到 9,000+ 后确认 VRF 已正确配置。

---

## 脚本说明

| 脚本 | 说明 |
|------|------|
| `scripts/deploy-full.ts` | 完整部署：部署 + 绑定 + 验证 + mint + SVG 输出 |
| `scripts/deploy-interactive.ts` | 交互式菜单：支持部署/mint/查询/VRF配置 |
| `scripts/configure-vrf.ts` | Chainlink VRF 配置脚本 |
| `scripts/deploy-and-mint.ts` | 原始部署脚本（功能同 deploy-full） |
| `ignition/modules/Deploy.ts` | Hardhat Ignition 部署模块 |

### deploy-full.ts 输出示例

```
============================================================
  DomesticCat NFT — 完整部署脚本
============================================================
  网络       : sepolia
  部署者     : 0x...
  时间       : 2025-01-01T00:00:00.000Z
============================================================

[Step 1/6] 部署 AMeowToken...
  ✓ AMeowToken 部署完成: 0x...

[Step 2/6] 部署 DomesticCatNFT...
  ✓ DomesticCatNFT 部署完成: 0x...

[Step 3/6] 双向绑定 (setNFTContract)...
  ✓ 绑定完成: 0x...

[Step 4/6] 验证合约数据...
  ✓ 所有验证通过

[Step 5/6] Mint NFT #0...
  ✓ Mint 成功: 0x...

[Step 6/6] 读取 tokenURI 并解码...
  name        : DomesticCat #0
  - Background: Midnight
  - Body Color: Light Pink
  - Eye Color: Royal Blue
  - Pattern: Tiger Stripes
  - Aura: None
  - Power Level: 1

✅ 部署完成！
```

---

## 测试

### 运行所有测试

```bash
npx hardhat test
```

### 测试覆盖范围

| 模块 | 测试内容 |
|------|---------|
| AMeowToken | 初始供给、转账、授权、burnFrom |
| Governance | mintFee/feeRecipient/treasury 设置、权限控制 |
| NFT Minting | 单笔 mint、批量 mint、费用分拆、revert 条件 |
| Power-Up | 升级计算、AMEOW 燃烧、power 上限、非 owner 拒绝 |
| TokenURI/SVG | base64 格式、JSON 结构、SVG 有效性、uniqueness |
| Chainlink VRF | VRF 配置、callback gas limit、确认数 |
| Withdrawal | ETH 提取 |

---

## 目录结构

```
DomesticCat/
├── contracts/
│   ├── DomesticCatNFT.sol       # 主 NFT 合约（ERC721）
│   ├── AMeowToken.sol           # ERC20 能量 Token
│   ├── CatSVGRegistry.sol       # 链上 SVG 生成引擎
│   ├── CatSVGLib.sol            # SVG 纯函数库
│   └── interfaces/
│       └── IDomesticCatNFT.sol  # 接口定义
├── ignition/modules/
│   └── Deploy.ts                # Hardhat Ignition 部署模块
├── scripts/
│   ├── deploy-full.ts           # 完整部署脚本（推荐）
│   ├── deploy-interactive.ts    # 交互式部署工具
│   ├── configure-vrf.ts         # Chainlink VRF 配置
│   └── deploy-and-mint.ts       # 原始部署脚本
├── test/
│   ├── DomesticCat.test.ts      # 主测试套件
│   ├── CatSVGRegistry.test.ts   # SVG 专项测试
│   ├── debug.test.ts            # 调试测试
│   ├── debug2.test.ts           # 调试测试
│   └── minimal.test.ts          # 最小用例测试
├── docs/
│   ├── README_zh.md             # 中文使用文档
│   └── ARCHITECTURE_zh.md       # 架构详解
├── hardhat.config.ts
├── package.json
├── tsconfig.json
├── output_nft0.svg              # 部署后生成的示例 SVG
└── .env.deployed                # 部署后生成的配置（gitignore）
```

---

## 常见问题

**Q: 为什么 CatSVGRegistry 单独作为一个合约？**

A: DomesticCatNFT 主合约字节码接近 EIP-170 的 24576 字节限制。将 SVG 生成逻辑分离为独立合约（CatSVGRegistry），主合约通过 external call 委托 SVG 构建，可有效控制字节码体积。

**Q: CatSVGRegistry 的方法为什么都是 `pure`？**

A: `pure` 方法不读取 storage，节省 SLOAD gas。所有颜色和属性由 `keccak256(tokenId, tag)` 纯函数计算，无状态依赖。

**Q: power-up 燃烧的 AMEOW 去了哪里？**

A: `powerUpNFT` 先将 AMEOW 从用户转入 NFT 合约，再调用 `AMeowToken.burnFrom(nftContract, amount)` 将其燃烧。AMEOW 总供给相应减少。

**Q: 如何在 BSC/Polygon 等 L2 部署？**

A: 在 `hardhat.config.ts` 添加 L2 网络配置（RPC URL + chainType: "l2"），使用 VRF v2.5 版本调用 `configureVRFv2_5()`。BSC 使用 VRF Wrapper 地址替代原生 Coordinator。
