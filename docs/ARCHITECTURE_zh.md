# DomesticCat NFT — 项目架构详解

> 本文档深入解析 DomesticCat 项目的智能合约设计、SVG 生成机制、Power-Up 系统和 Chainlink VRF 集成。

---

## 一、项目目标与核心概念

### 1.1 目标

铸造 10,000 只独一无二的链上生成猫咪 NFT，用户可通过充入 AMeow Token 提升猫咪的 Power 等级，使猫咪外观进化。当第 10,000 只 NFT 被铸造时，奖金池（所有 mint 费用的 50%）通过 Chainlink VRF 随机分配给某只猫咪的持有者。

### 1.2 核心概念

| 概念 | 说明 |
|------|------|
| **链上 SVG** | 猫咪外观完全在合约内生成，IPFS/中心化服务器不是必须的 |
| **Deterministic 生成** | tokenId → 外观的映射是纯函数，同一 tokenId 总产生相同 SVG |
| **Power-Up** | 猫咪持有 AMeow Token 可提升 power，SVG 随等级变化 |
| **大奖池** | 每次 mint 费用 50% 累积在合约中，第 10,000 只 mint 时通过 VRF 分配 |
| **EIP-170 字节码限制** | 合约字节码不得超过 24576 字节，故 SVG 逻辑独立为 CatSVGRegistry |

---

## 二、合约架构

```
AMeowToken (ERC20)
      │ 允许 NFT 合约 burn
      │ setNFTContract() 绑定
      ▼
DomesticCatNFT (ERC721)
      │ 委托 SVG 生成
      ▼
CatSVGRegistry (纯函数库合约)
      │ 被 NFT 调用
      ▼
CatSVGLib (纯函数库) — 从主合约分离，降低字节码
```

### 2.1 部署顺序与依赖

```
1. AMeowToken 部署 → 得到 tokenAddress
2. DomesticCatNFT 部署 → 传入 tokenAddress（构造函数）
3. AMeowToken.setNFTContract(NFTAddress) → 允许 NFT 燃烧 token
```

> 注意：步骤 3 必须由 deployer 执行，否则 NFT 无法调用 `burnFrom()`。

---

## 三、智能合约详解

### 3.1 AMeowToken.sol

**文件**: `contracts/AMeowToken.sol`

```solidity
contract AMeowToken is ERC20 {
    uint256 public constant MAX_SUPPLY = 1_000_000 * 10**18; // 100万 AMEOW
    address public domesticCatNFT;  // 绑定后的 NFT 合约地址
}
```

**设计要点**：
- 总量固定 100 万枚，无通货膨胀机制
- `burnFrom(from, amount)` 有 `onlyNFTContract` 修饰符，安全性高
- `setNFTContract()` 仅可调用一次（合约部署者执行）
- 部署时一次性 mint 给 deployer

### 3.2 DomesticCatNFT.sol

**文件**: `contracts/DomesticCatNFT.sol`

#### 构造函数

```solidity
constructor(address ameowToken, address svgRegistry)
    ERC721("DomesticCat", "DCAT")
    Ownable(msg.sender)
{
    AMEOW_TOKEN = AMeowToken(ameowToken);
    SVG_REGISTRY = CatSVGRegistry(svgRegistry);
    _mintFee = 0.01 ether;
    _feeRecipient = msg.sender;
    treasury = msg.sender;
}
```

#### Mint 费用分拆

```
用户支付 0.01 ETH
├── 50% → treasury（可提取）
└── 50% → 合约余额（大奖池，第10000只时通过VRF分发）
```

#### Power-Up 机制

```
用户调用 powerUpNFT(nftId, tokenAmount)
    ↓
检查: (1) 调用者是 NFT 持有者
      (2) 当前 power < 100
      (3) tokenAmount >= AMEOW_PER_POWER (10e18)
    ↓
计算: increments = tokenAmount / AMEOW_PER_POWER
      newPower = min(currentPower + increments, MAX_POWER=100)
    ↓
AMEOW_TOKEN.transferFrom(user, nftContract, tokenAmount)
    ↓
AMEOW_TOKEN.burnFrom(nftContract, tokenAmount)  // 烧掉
    ↓
更新 nftPowerLevel[nftId] = newPower
更新 nftAccumulatedAMeow[nftId] += tokenAmount
```

#### Chainlink VRF 触发时机

```
mint() 或 batchMint()
    ↓
_tokenIdCounter++（所有NFT mint完后）
    ↓
当 _tokenIdCounter == MAX_SUPPLY(10000) 时
    ↓
_requestRandomWords()
    ↓
VRFCoordinatorV2.requestRandomWords() → 返回 requestId
    ↓
VRF 链下生成随机数 → 调用 rawFulfillRandomWords(requestId, randomWords)
    ↓
winningTokenId = randomWords[0] % MAX_SUPPLY
address winner = ownerOf(winningTokenId)
winner.call{value: address(this).balance}()  // 奖金全部转给中奖者
```

**VRF 版本兼容**：
- VRF v2：`configureVRFv2(coordinator, subId, keyHash, linkToken)` — Ethereum mainnet/Goerli/Sepolia
- VRF v2.5：`configureVRFv2_5(coordinator, subId, keyHash, wrapper)` — Optimism, Arbitrum 等 L2

### 3.3 CatSVGRegistry.sol

**文件**: `contracts/CatSVGRegistry.sol`

这是项目最复杂的设计：链上 SVG 生成，且必须控制字节码在 EIP-170 限制内。

#### 字节码优化策略

| 策略 | 说明 |
|------|------|
| 所有颜色用 `if/else` 链硬编码 | 避免 storage 数组（Solidity 数组访问会复制到内存） |
| 纯函数（`pure`）| 不读取 storage，节省 SLOAD gas |
| 短私有函数名 | 如 `_bg1`, `_iris`, `_eye`（压缩字节码） |
| SVG 分块拼接 | 分离 aura/pattern/tail/whiskers 等子函数 |
| 委托主合约调用 | `tokenURI()` 仅做一次 external call |

#### 颜色计算（`_c` 函数）

```solidity
function _c(uint256 seed, uint256 tag) private pure returns (string memory) {
    bytes32 h = keccak256(abi.encodePacked(seed, tag));
    uint256 r = (uint8(h[0]) * 205 >> 8) + 50;  // 范围 50-255
    uint256 g = (uint8(h[1]) * 205 >> 8) + 50;
    return _hex3(r, g, (uint8(h[2]) * 205 >> 8) + 50);
}
```

keccak256 哈希 + 固定位移映射，产生 256^3 种颜色组合。

#### `generateSVG` vs `buildTokenURI`

| 方法 | 用途 | 是否内联 SVG |
|------|------|-------------|
| `generateSVG(tid,_,_,_,_,power)` | 独立测试用 | 否（返回纯 SVG 字符串） |
| `buildTokenURI(tid,power,accAMeow,maxPower)` | NFT 标准元数据 | 是（包含完整 SVG） |

`buildTokenURI` 是 NFT 合约 `tokenURI()` 实际调用的方法，它将 SVG 和 metadata 一起打包为 base64 data URL：

```
data:application/json;base64, {base64(JSON)}
    └── JSON.image = "data:image/svg+xml;base64,{base64(SVG)}"
```

### 3.4 CatSVGLib.sol

**文件**: `contracts/CatSVGLib.sol`

纯函数库，提供所有 SVG 构建工具。`CatSVGRegistry` 中的大多数 `_` 开头的私有函数与此库中名称相同（代码复用/分离）。

从 `DomesticCatNFT` 分离的原因：主合约字节码接近 EIP-170 24576 字节限制，将 SVG 工具移出可降低主合约体积。

---

## 四、SVG 视觉系统详解

### 4.1 属性决定公式

所有视觉属性由 tokenId 纯算决定，无链上随机源。

```
bgIdx   = tokenId % 12          → 12 种背景主题
bodyIdx = tokenId % 16           → 16 种身体颜色
eyeIdx  = tokenId % 12           → 12 种眼睛颜色
patIdx  = tokenId % 7            → 7  种花纹
```

身体颜色、阴影色、内耳色、花纹色、触须色使用 `keccak256(tokenId, tag)` 生成（确定性 RGB 值）。

### 4.2 Power 进化等级

```
Power   Aura               胸口徽章
1-5     无                 无
6-20    Soft Silver (#D8D8D8)  小灰球 (r=8)
21-50   Ethereal Cyan (#00FFFF) 中青球 (r=12)
51-80   Mystic Purple (#DA70D6) 大紫球 (r=16)
81-100  Legendary Gold (#FFD700) 超大金球 (r=22) + 双层光环
```

### 4.3 花纹类型

| patIdx | 名称 | 视觉效果 |
|--------|------|---------|
| 0 | Tiger Stripes | 三道弧形条纹 |
| 1 | Spotted | 5个圆点散布 |
| 2 | Heart Mark | 额头心形 |
| 3 | Marble Swirls | 两道波浪线 |
| 4 | Star Marked | 3个光点 |
| 5 | Dotted | 5个小圆点 |
| 6 | Solid | 无花纹（纯色） |

### 4.4 SVG 结构层次

```
<svg viewBox="0 0 400 400">
  ├── 背景层
  │   ├── <rect> bgColor1（底色）
  │   ├── <rect> bgColor2（半透明叠加）
  │   └── <circle> stars（随机位置/大小/透明度）
  ├── Aura 光环（power >= 6）
  ├── 身体
  │   ├── <ellipse> 主体
  │   ├── <ellipse> 阴影（半透明）
  │   └── 花纹层（pattern）
  ├── 四肢与尾巴
  │   ├── <ellipse> 前爪 x2
  │   ├── <ellipse> 后爪 x2
  │   └── <path>+<circle> 尾巴
  ├── 头部
  │   ├── <circle> 脸部
  │   ├── <circle> 腮部阴影
  │   └── <polygon> 耳朵 x2 + 内耳 x2
  ├── 面部特征
  │   ├── <ellipse> 眼睛 x2（白底+虹膜+瞳孔+高光）
  │   ├── <path> 鼻子+嘴巴
  │   └── <line> 触须 x6
  ├── 胸口徽章（power >= 6）
  └── </svg>
```

---

## 五、测试架构

### 5.1 测试框架

使用 Hardhat 3 内置的 Node.js `node:test`，非 Mocha/Jest。配合 `viem` 进行合约交互。

### 5.2 关键测试模式

```typescript
// viem 合约读取（注意参数是数组形式）
const power = await nft.read.getNFTPowerLevel([tokenId]);

// viem 合约写入
await nft.write.mint({ account: user1, value: mintFee });

// 等待交易收据（必须 await）
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

// BigInt 比较（TS 中用 Number() 或 === 宽松比较）
assert.strictEqual(Number(await nft.read.totalMinted()), 3);
```

### 5.3 测试覆盖范围

**文件**: `test/DomesticCat.test.ts` (623行) + `test/CatSVGRegistry.test.ts` (351行)

| 合约 | 覆盖内容 |
|------|---------|
| AMeowToken | 初始供给、转账、余额、remainingSupply |
| Governance | mintFee/feeRecipient/treasury 设置、non-owner 拒绝 |
| NFT Minting | 单笔mint、批量mint、费用分拆、sequential ID、revert 条件 |
| Power-Up | 升级计算、AMEOW 燃烧、power 上限、多重升级累加、非owner拒绝 |
| TokenURI/SVG | base64格式验证、JSON结构解析、SVG XML有效性、不同tokenId生成不同SVG |
| Chainlink VRF | VRF v2配置、callbackGasLimit、requestConfirmations |
| Withdrawal | 合约ETH提取 |
| CatSVGRegistry | variantIndices、各 trait getter、SVG 各元素存在性验证、uniqueness |

---

## 六、部署与配置

### 6.1 Hardhat Ignition 部署流程

```typescript
// ignition/modules/Deploy.ts
buildModule("DeployModule", (m) => {
    const ameowToken = m.contract("AMeowToken");
    const nft = m.contract("DomesticCatNFT", [m.getToken(ameowToken)]);
    m.call(ameowToken, "setNFTContract", [m.getToken(nft)]);
    return { ameowToken, nft };
});
```

Ignition 特性：
- 幂等性：已完成的步骤不会重复执行
- 状态持久化：部署状态存在 `.ignition/` 目录
- 可恢复：从中断处继续部署

### 6.2 Sepolia 网络配置

在 `hardhat.config.ts` 中：
```typescript
sepolia: {
    type: "http",
    chainType: "l1",
    url: configVariable("SEPOLIA_RPC_URL"),
    accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
},
```

环境变量设置：
```bash
export SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
export SEPOLIA_PRIVATE_KEY=0xYourPrivateKey
```

### 6.3 部署后配置 Checklist

```
[ ] 记录 AMeowToken 和 DomesticCatNFT 地址
[ ] 在 Chainlink VRF (vrf.chain.link/sepolia) 创建订阅
[ ] 为订阅充值 LINK（建议至少 2-3 LINK）
[ ] 将 DomesticCatNFT 添加为订阅的 Consumer
[ ] 调用 nft.configureVRFv2() 或 configureVRFv2_5()（owner）
[ ] 将 AMEOW Token 分发给用户（用于 power-up）
```

---

## 七、已知限制与注意事项

### 7.1 VRF 未配置时的行为

如果在第 10,000 只 NFT mint 时 VRF 未配置（`vrfCoordinator == address(0)`），`_requestRandomWords()` 内部的 `require(vrfCoordinator != address(0), "VRF not configured")` 会导致交易 revert。这意味着大奖不会发放，奖金池锁死在合约中。

**建议**：在 mint 达到 9000+ 后，务必确认 VRF 已正确配置。

### 7.2 Power 上限 100

`powerUpNFT` 内部做了 `newPower > MAX_POWER_LEVEL` 的截断处理，不会 revert，只会停在 100。

### 7.3 字节码接近限制

`DomesticCatNFT` 字节码在启用 `viaIR: true` + `optimizer: { enabled: false }` 时未超过限制。正式部署时建议启用 optimizer（`enabled: true, runs: 200`）进一步缩减字节码。

---

## 八、文件清单

```
contracts/
├── DomesticCatNFT.sol         478行 — 主合约
├── AMeowToken.sol              51行  — ERC20 Token
├── CatSVGRegistry.sol         458行 — SVG渲染引擎
├── CatSVGLib.sol              354行 — SVG工具库
└── interfaces/
    └── IDomesticCatNFT.sol     49行  — 接口定义

ignition/modules/
├── Deploy.ts                   17行  — Ignition部署脚本
└── Deploy.s.sol                备份（Foundry风格）

scripts/
└── deploy-and-mint.ts         115行 — 部署+mint+SVG输出

test/
├── DomesticCat.test.ts         623行 — 全量测试
├── CatSVGRegistry.test.ts     351行 — SVG专项测试
├── debug.test.ts / debug2.test.ts / minimal.test.ts — 调试
└── forge_test_backup/
    └── DomesticCat.t.sol       — Foundry测试备份

hardhat.config.ts
package.json
tsconfig.json
output_nft0.svg                   — 部署脚本生成的示例
```