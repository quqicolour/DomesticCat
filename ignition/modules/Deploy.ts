import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const DeployModule = buildModule("DeployModule", (m) => {
  // 1. 部署 AMeowToken
  const ameowToken = m.contract("AMeowToken");

  // 2. 部署 CatSVGRegistry（SVG 生成引擎）
  const svgRegistry = m.contract("CatSVGRegistry");

  // 3. 部署 DomesticCatNFT（传入 AMeowToken + SVGRegistry）
  const nft = m.contract("DomesticCatNFT", [
    m.getToken(ameowToken),
    m.getToken(svgRegistry),
  ]);

  // 4. 双向绑定：AMeowToken.setNFTContract(NFT地址)
  m.call(ameowToken, "setNFTContract", [m.getToken(nft)]);

  return { ameowToken, svgRegistry, nft };
});

export default DeployModule;
