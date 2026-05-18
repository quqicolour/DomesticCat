# DomesticCat NFT 项目文档

## 项目概述

DomesticCat 是一个基于以太坊的 SVG NFT 收藏项目，共 10,000 只独特的猫咪NFT。每只猫咪的外观由 tokenId 纯链上生成，猫咪可通过充入 AMeow Token 提升 power 等级，SVG 外观随之进化。mint 费用 50% 进入奖金池，当第 10,000 只 NFT 被 mint 时，通过 Chainlink VRF 随机抽取大奖。

---

## 技术架构

### 技术栈

| 类别 | 技术 |
|------|------|
| 智能合约开发 | Hardhat 3 + Solidity 0.8.28 |
| 合约交互 | viem 2.x (Ethers.js 替代品) |
| 测试框架 | Node.js `node:test` + Hardhat ViEm Toolbox |
| 部署 | Hardhat Ignition |
| 依赖库 | OpenZeppelin Contracts 5.6.1 |

### 合约架构

```
contracts/
├── DomesticCatNFT.sol       ← 主 NFT 合约（ERC721）
├── AMeowToken.sol           ← ERC20 能量Token
├── CatSVGRegistry.sol        ← SVG 生成器（独立库合约，降低主合约字节码）
├── CatSVGLib.sol            ← SVG 纯函数库
└── interfaces/
    └── IDomesticCatNFT.sol   ← NFT 合约接口
```

#### 1. DomesticCatNFT.sol（主合约）

**职责**：
- NFT mint（单笔/批量）
- 费用管理（mintFee、treasury、feeRecipient）
- Power-Up 系统（调用 AMeowToken 燃烧）
- Chainlink VRF 配置与大奖抽取
- `tokenURI()` 委托给 CatSVGRegistry

**关键常量**：
```solidity
MAX_SUPPLY = 10000
MAX_POWER_LEVEL = 100
AMEOW_PER_POWER = 10 * 10**18  // 每 10 AMEOW 提升 1 power
MINT_FEE = 0.01 ether（默认）
```

**费用分拆**：每次 mint，费用 50% 打入 treasury，50% 留在合约作为大奖池。

**Power 进化等级**：
| Power 等级 | Aura 颜色 | Emblem |
|-----------|-----------|--------|
| 1-5 | 无 | 无 |
| 6-20 | Soft Silver | 灰色小球 |
| 21-50 | Ethereal Cyan | 青色中球 |
| 51-80 | Mystic Purple | 紫色大球 |
| 81-100 | Legendary Gold | 金色超大球 + 光环 |

#### 2. AMeowToken.sol（能量Token）

**概况**：标准 ERC20，总量 100 万 AMEOW。

**关键机制**：
- `setNFTContract()` — 部署后设置一次 DomesticCatNFT 地址
- `burnFrom()` — 仅可由 NFT 合约调用，power-up 时燃烧 AMEOW

#### 3. CatSVGRegistry.sol（SVG 生成）

- 所有颜色、属性通过 `if/else` 链硬编码（零 storage 读取）
- 所有 public 方法标记 `pure`（无状态读取，省 gas）
- `buildTokenURI()` — 一步生成 Base64-encoded JSON（包含 SVG + metadata）
- 视觉属性由 tokenId 决定：
  - `bgIdx = tokenId % 12` → 12 种背景
  - `bodyIdx = tokenId % 16` → 16 种身体颜色
  - `eyeIdx = tokenId % 12` → 12 种眼睛颜色
  - `patIdx = tokenId % 7` → 7 种花纹（条纹/斑点/心形/大理石/星标/点状/纯色）

#### 4. CatSVGLib.sol（SVG 工具库）

从主合约分离出来的纯函数库，用于降低 DomesticCatNFT 字节码体积（避免超出 EIP-170 的 24576 字节限制）。

---

## 目录结构

```
DomesticCat/
├── contracts/
│   ├── DomesticCatNFT.sol       # 主 NFT 合约
│   ├── AMeowToken.sol           # ERC20 能量 Token
│   ├── CatSVGRegistry.sol       # 链上 SVG 生成
│   ├── CatSVGLib.sol            # SVG 纯函数库
│   └── interfaces/
│       └── IDomesticCatNFT.sol  # 接口定义
├── ignition/modules/
│   ├── Deploy.ts                # Hardhat Ignition 部署脚本
│   └── Deploy.s.sol             # Foundry 风格部署（备份）
├── scripts/
│   └── deploy-and-mint.ts       # 部署 + mint + 输出 SVG
├── test/
│   ├── DomesticCat.test.ts      # 完整测试套件
│   ├── CatSVGRegistry.test.ts
│   ├── debug.test.ts / debug2.test.ts / minimal.test.ts  # 调试/最小用例
│   └── forge_test_backup/
│       └── DomesticCat.t.sol   # Foundry 测试备份
├── output_nft0.svg             # 部署脚本生成的示例 SVG
├── hardhat.config.ts
├── package.json
└── tsconfig.json
```

---

## 环境配置

### 安装依赖

```bash
npm install
```

### 配置 Hardhat 网络变量

```bash
# Sepolia 测试网部署需要设置私钥和 RPC URL
export SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
export SEPOLIA_PRIVATE_KEY=0xYourPrivateKey
```

---

## 常用命令

### 运行测试

```bash
npx hardhat test                    # 运行所有测试
npx hardhat test solidity           # 仅 Solidity 测试
npx hardhat test nodejs             # 仅 node:test 测试
```

### 部署（本地 Hardhat 模拟网络）

```bash
npx hardhat ignition deploy ignition/modules/Deploy.ts
```

### 部署到 Sepolia

```bash
npx hardhat ignition deploy --network sepolia ignition/modules/Deploy.ts
```

### 运行部署 + Mint 脚本

```bash
# 本地网络
npx hardhat run scripts/deploy-and-mint.ts

# 指定网络
npx hardhat run scripts/deploy-and-mint.ts --network sepolia
```

### 编译合约

```bash
npx hardhat compile
```

---

## 部署流程详解

### 方式一：Hardhat Ignition（推荐）

```bash
npx hardhat ignition deploy ignition/modules/Deploy.ts --network sepolia
```

Ignition 会按顺序：
1. 部署 `AMeowToken`
2. 部署 `DomesticCatNFT`（传入 AMeowToken 地址）
3. 调用 `ameowToken.setNFTContract(nftAddress)` 完成双向绑定

### 方式二：手动脚本部署

```bash
npx hardhat run scripts/deploy-and-mint.ts --network sepolia
```

脚本执行：
1. 部署 AMeowToken
2. 部署 DomesticCatNFT
3. 调用 `setNFTContract` 关联两者
4. Mint 一只 NFT #0
5. 输出 tokenURI 和 SVG base64

---

## 合约交互（前端/Web3）

### 部署后需要记录的两个地址

```
AMEOW_TOKEN = "0x..."  // AMeowToken 合约地址
NFT         = "0x..."  // DomesticCatNFT 合约地址
```

### 关键交互

**1. Mint NFT**
```typescript
const mintFee = 10_000_000_000_000_000n; // 0.01 ETH
await nft.write.mint({ account: userAddress, value: mintFee });
```

**2. 批量 Mint**
```typescript
const quantity = 5;
await nft.write.batchMint([quantity], { account: userAddress, value: mintFee * BigInt(quantity) });
```

**3. Power-Up（提升 NFT 等级）**
```typescript
// 1. 先授权 NFT 合约使用你的 AMEOW
await ameowToken.write.approve([nftAddress, amount], { account: userAddress });

// 2. 调用 power-up（每 10 AMEOW 提升 1 power）
await nft.write.powerUpNFT([tokenId, amount], { account: userAddress });
```

**4. 读取 Power 等级**
```typescript
const power = await nft.read.getNFTPowerLevel([tokenId]);
```

**5. 读取 tokenURI（包含 SVG + metadata）**
```typescript
const uri = await nft.read.tokenURI([tokenId]);
```

**6. 配置 Chainlink VRF（部署后需 owner 调用）**
```typescript
// VRF v2（Ethereum mainnet/Goerli）
await nft.write.configureVRFv2([
  vrfCoordinator,  // 0x271682DEB8C4E2001eD10e41cF8D44cFbE477F7 (Sepolia)
  subscriptionId,   // 你的 VRF 订阅 ID
  keyHash,          // VRF key hash
  linkToken         // LINK token 地址
], { account: owner });

// VRF v2.5（Optimism/Arbitrum 等 L2）
await nft.write.configureVRFv2_5([
  vrfCoordinator,
  subscriptionId,
  keyHash,
  wrapperAddress    // VRF Wrapper 地址
], { account: owner });
```

---

## Chainlink VRF 配置

当 `tokenIdCounter == MAX_SUPPLY(10000)` 时自动触发大奖抽取。

### 配置步骤

1. 在 [Chainlink VRF 官网](https://vrf.chain.link/) 创建订阅
2. 添加 Consumer：填入 DomesticCatNFT 合约地址
3. 充值 LINK 到订阅
4. 调用 `configureVRFv2()` 或 `configureVRFv2_5()` 传入参数
5. 大奖自动触发，VRF 回调写入 `winningTokenId`，奖金转入中奖者

---

## SVG 视觉系统

### 属性来源

所有视觉属性由 `tokenId` 决定（纯函数，无随机数），保证每只猫咪唯一且可验证。

| 属性 | 取值范围 | 决定方式 |
|------|---------|---------|
| 背景颜色 | 12种 | `tokenId % 12` |
| 身体颜色 | 16种 | `keccak256(tokenId, 0x10)` |
| 身体阴影 | 16种 | `keccak256(tokenId, 0x11)` |
| 内耳颜色 | 8种 | `keccak256(tokenId, 0x12)` |
| 眼睛虹膜 | 12种 | `tokenId % 12` |
| 眼睛瞳孔 | 12种 | `tokenId % 12` |
| 花纹类型 | 7种 | `tokenId % 7` |
| 花纹颜色 | 8种 | `keccak256(tokenId, 0x40)` |
| Aura | 5级 | Power 等级决定 |

### SVG 结构

```
<svg viewBox="0 0 400 400">
  ├── 背景层（bgColor1 + bgColor2 半透明叠加 + 星星）
  ├── Aura 光环（Power 6+ 显现）
  ├── 身体（椭圆形猫身）
  ├── 花纹层（7种图案之一）
  ├── 四肢（椭圆形爪子 + 尾巴）
  ├── 头部（圆形）
  ├── 耳朵（三角形 + 内耳）
  ├── 眼睛（椭圆形 + 瞳孔 + 高光）
  ├── 鼻子 + 嘴巴 + 胡须
  ├── 胸口徽章（Power 6+ 显现）
  └── SVG 闭合标签
```

---

## 测试覆盖

测试文件 `test/DomesticCat.test.ts` 覆盖：

| 模块 | 测试项 |
|------|--------|
| AMeowToken | 初始供给、转账、余额 |
| Governance | mintFee/feeRecipient/treasury 设置、权限控制 |
| NFT Minting | 单笔mint、批量mint、费用分拆、顺序ID |
| Power-Up | 升级逻辑、AMEOW燃烧、power上限、非owner拒绝 |
| TokenURI/SVG | base64格式、JSON结构、SVG有效性 |
| Chainlink VRF | VRF配置、gas limit、确认数配置 |
| Withdrawal | ETH 提取 |

---

## 部署 Checklist

- [ ] `npm install`
- [ ] 配置 `.env` 或环境变量（SEPOLIA_RPC_URL、SEPOLIA_PRIVATE_KEY）
- [ ] `npx hardhat compile`
- [ ] `npx hardhat test`
- [ ] `npx hardhat ignition deploy ignition/modules/Deploy.ts --network sepolia`
- [ ] 记录 `AMEOW_TOKEN` 和 `NFT` 地址
- [ ] 在 Chainlink VRF 创建订阅并添加 NFT 为 Consumer
- [ ] 调用 `configureVRFv2()` 或 `configureVRFv2_5()`（仅 owner）