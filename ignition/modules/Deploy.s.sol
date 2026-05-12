// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AMeowToken } from "../contracts/AMeowToken.sol";
import { DomesticCatNFT } from "../contracts/DomesticCatNFT.sol";

/// @title Deploy script for DomesticCat NFT project
/// @notice Deploys AMeowToken and DomesticCatNFT contracts and links them
/// @dev Usage: npx hardhat ignition deploy ignition/modules/Deploy.s.ts --network sepolia
contract Deploy {
    function run() public {
        console.log("Deploying DomesticCat NFT Project...");

        // Deploy AMeowToken
        AMeowToken ameowToken = new AMeowToken();
        console.log("AMeowToken deployed at:", address(ameowToken));

        // Deploy DomesticCatNFT
        DomesticCatNFT nft = new DomesticCatNFT(address(ameowToken));
        console.log("DomesticCatNFT deployed at:", address(nft));

        // Link NFT to Token
        ameowToken.setNFTContract(address(nft));
        console.log("Contracts linked successfully");

        // Transfer ownership if needed (owner is deployer by default)
        // nft.transferOwnership(governanceAddress);
    }
}
