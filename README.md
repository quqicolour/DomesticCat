# DomesticCat NFT

DomesticCat 是一个全链上 SVG NFT 项目：10,000 只猫咪由 `tokenId` 确定性生成外观，持有人可以燃烧 `AMeowToken` 提升 NFT power，`tokenURI` 会实时反映 power、光环和累计 AMEOW。

技术栈：Hardhat 3、Solidity 0.8.28、OpenZeppelin 5、viem 2、Node.js `node:test`。

## 快速开始

```bash
npm install
npm run compile
npm test
```

本地完整部署：

```bash
npm run deploy
```

交互式工具：

```bash
npm run interactive
```

部署到 Base Sepolia：

```bash
npx hardhat run scripts/deploy-full.ts --network baseSepolia
```

需要在 `.env` 中配置：

```bash
SEPOLIA_RPC_URL=https://...
PRIVATE_KEY=0x...
```

## 项目架构

```text
AMeowToken (ERC20, Ownable)
  | setNFTContract(DomesticCatNFT)  owner-only, one-time
  | burnFrom()                      only DomesticCatNFT
  v
DomesticCatNFT (ERC721, Ownable)
  | mint / batchMint
  | powerUpNFT -> transferFrom AMEOW -> burnFrom
  | tokenURI
  v
CatSVGRegistry (pure on-chain SVG + metadata renderer)
```

部署顺序固定：

1. 部署 `AMeowToken`
2. 部署 `CatSVGRegistry`
3. 部署 `DomesticCatNFT(ameowToken, svgRegistry)`
4. 调用 `AMeowToken.setNFTContract(nftAddress)`

`AMeowToken.setNFTContract` 只能由 owner 调用，且只能成功一次，避免后续恶意替换燃烧权限。

## 合约说明

### AMeowToken

`contracts/AMeowToken.sol`

- ERC20 名称：`AMeow Token`
- Symbol：`AMEOW`
- 固定总量：`1,000,000 * 10^18`
- 初始供应全部 mint 给部署者
- `burnFrom(address,uint256)` 只能由已绑定的 NFT 合约调用

核心方法：

```solidity
setNFTContract(address nftContract)
burnFrom(address from, uint256 amount)
remainingSupply()
```

### DomesticCatNFT

`contracts/DomesticCatNFT.sol`

- ERC721 名称：`DomesticCat`
- Symbol：`DCAT`
- 最大供应：`10,000`
- 默认 mint fee：`0.001 ETH`
- 默认 power：`1`
- 最大 power：`100`
- 每 `10 AMEOW` 提升 `1` power

Mint 费用分配：

- 50% 转入 `treasury`
- 50% 留在 NFT 合约中作为大奖池余额

Power-up 流程：

1. 持有人先 `AMeowToken.approve(nftAddress, amount)`
2. 调用 `DomesticCatNFT.powerUpNFT(tokenId, amount)`
3. NFT 合约把 AMEOW 从用户转入自身
4. NFT 合约调用 `AMeowToken.burnFrom(address(this), amount)`
5. `nftPowerLevel[tokenId]` 增加，最高封顶 100

### CatSVGRegistry

`contracts/CatSVGRegistry.sol`

负责生成 SVG 和 ERC721 metadata：

- `generateSVG(tokenId, power)`
- `buildTokenURI(tokenId, power, accumulatedAMeow, maxPower)`
- trait getter：背景、身体、眼睛、花纹、光环

它不保存 storage，渲染结果由 `tokenId` 和 `power` 确定。`tokenURI` 返回 `data:application/json;base64,...`，其中 `image` 是 `data:image/svg+xml;base64,...`。

## SVG 和属性系统

猫咪视觉由两类输入组成：

- `tokenId`：决定背景、身体、眼睛、花纹和颜色种子
- `power`：决定光环和胸口徽章

Power 分层：

| Power | Aura |
| --- | --- |
| 0-5 | None |
| 6-20 | Soft Silver |
| 21-50 | Ethereal Cyan |
| 51-80 | Mystic Purple |
| 81-100 | Legendary Gold |

Metadata attributes 包含：

- `Background`
- `Body Color`
- `Eye Color`
- `Pattern`
- `Aura`
- `Power Level`
- `Max Power`
- `AMeow Accumulated`

## 大奖池机制

当第 10,000 只 NFT 被 mint 时，合约记录 `lastRandomBlock = block.number` 并发出 `GrandPrizeRequested`。

之后任意人都可以在触发区块被确认后调用：

```solidity
getWinningTokenId()
```

合约会组合以下熵源：

- `_recentBlockHashes` 的 10 槽 XOR
- `blockhash(lastRandomBlock)`
- 当前合约 ETH 余额
- `block.gaslimit`
- 上一次 `winningTokenId`

计算：

```text
winningTokenId = entropy % 10000
```

随后合约会把当前 ETH 余额转给 `ownerOf(winningTokenId)`，并发出 `GrandPrizeAwarded(winnerTokenId, prizeAmount)`。

注意：这是链上 blockhash 随机方案，不等同于 Chainlink VRF。面向高价值主网奖池时，建议升级为 VRF 或 commit-reveal。

## 部署脚本

### scripts/deploy-full.ts

完整部署、绑定、校验，并默认 mint 示例 NFT #0。

```bash
npm run deploy
npx hardhat run scripts/deploy-full.ts --network baseSepolia
```

跳过示例 mint：

```bash
SKIP_SAMPLE_MINT=true npm run deploy
```

脚本输出：

- `.env.deployed`
- `deployments/<network>-<chainId>.json`

`.env.deployed` 示例：

```bash
NETWORK=default
CHAIN_ID=31337
AMEOW_TOKEN_ADDRESS=0x...
SVG_REGISTRY_ADDRESS=0x...
NFT_CONTRACT_ADDRESS=0x...
DEPLOYER=0x...
MINT_FEE=1000000000000000
```

### scripts/interactive.ts

交互式工具支持：

- 部署全部合约
- 查询状态
- mint / batchMint
- power-up
- 读取 tokenURI
- finalize grand prize
- owner 提取 ETH

```bash
npm run interactive
```

## 常用交互

### Mint

```ts
const hash = await nft.write.mint({
  client: { wallet },
  value: 1_000_000_000_000_000n,
});
await publicClient.waitForTransactionReceipt({ hash });
```

### Batch Mint

```ts
const quantity = 5n;
const fee = await nft.read.getMintFee();
await nft.write.batchMint([quantity], {
  client: { wallet },
  value: fee * quantity,
});
```

### Power-up

```ts
const amount = parseEther("50"); // 50 AMEOW = +5 power

await ameow.write.approve([nft.address, amount], {
  client: { wallet },
});

await nft.write.powerUpNFT([0n, amount], {
  client: { wallet },
});
```

### Decode tokenURI

```ts
const uri = await nft.read.tokenURI([0n]);
const json = JSON.parse(
  Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString("utf8"),
);
```

## 测试

测试位于 `test/`，使用 Hardhat 3 + viem + Node.js `node:test`。

```bash
npm test
npx hardhat test test/AMeowToken.test.ts
npx hardhat test test/CatSVGRegistry.test.ts
npx hardhat test test/DomesticCat.test.ts
```

覆盖范围：

| 文件 | 覆盖内容 |
| --- | --- |
| `AMeowToken.test.ts` | ERC20 元数据、固定供应、转账、授权、NFT 绑定权限、burnFrom 权限 |
| `CatSVGRegistry.test.ts` | trait getter、power aura 分层、SVG 完整性、metadata base64 解码 |
| `DomesticCat.test.ts` | 部署参数、mint、batchMint、费用分配、ERC721 授权、power-up、治理、提现、tokenURI |

## 目录结构

```text
contracts/
  AMeowToken.sol
  CatSVGRegistry.sol
  DomesticCatNFT.sol
  interfaces/IDomesticCatNFT.sol
  libraries/CatSVGLib.sol
ignition/modules/
  Deploy.ts
scripts/
  deploy-full.ts
  env.ts
  interactive.ts
test/
  AMeowToken.test.ts
  CatSVGRegistry.test.ts
  DomesticCat.test.ts
  helpers.ts
hardhat.config.ts
package.json
README.md
```

## 安全和实现备注

- `AMeowToken.setNFTContract` 是 owner-only 且一次性，保护 AMEOW 燃烧入口。
- `powerUpNFT` 要求调用者是 NFT 当前 owner。
- `tokenURI` 完全链上生成，无 IPFS 或中心化图片依赖。
- `withdraw(address token)` 当前 ETH 分支用于 owner 提取合约 ETH；如需提取误转 ERC20，建议补充独立 ERC20 transfer 分支测试后再用于生产。
- `IDomesticCatNFT.sol` 中仍保留了早期 VRF 命名说明，实际实现使用 blockhash。
