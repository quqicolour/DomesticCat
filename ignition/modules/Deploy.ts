import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const DeployModule = buildModule("DeployModule", (m) => {
  // Deploy AMeowToken first
  const ameowToken = m.contract("AMeowToken");

  // Deploy DomesticCatNFT with AMeowToken address
  const nft = m.contract("DomesticCatNFT", [m.getToken(ameowToken)]);

  // Link NFT contract to token (one-time setup)
  m.call(ameowToken, "setNFTContract", [m.getToken(nft)]);

  return { ameowToken, nft };
});

export default DeployModule;
