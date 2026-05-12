// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title AMeowToken
/// @notice ERC20 token used to power up DomesticCat NFTs
/// @dev Users transfer AMeow tokens to NFTs to increase their power level.
///      The NFT power-up system burns the AMeow tokens sent to it.
contract AMeowToken is ERC20 {
    /// @notice Maximum total supply of AMeow tokens (1,000,000 AMEOW)
    uint256 public constant MAX_SUPPLY = 1_000_000 * 10 ** 18;

    /// @notice Address of the DomesticCatNFT contract
    address public domesticCatNFT;

    /// @notice Emitted when NFT contract address is updated
    event NFTContractUpdated(address indexed oldNFT, address indexed newNFT);

    modifier onlyNFTContract() {
        require(msg.sender == domesticCatNFT, "AMeow: caller is not NFT contract");
        _;
    }

    constructor() ERC20("AMeow Token", "AMEOW") {
        _mint(msg.sender, MAX_SUPPLY);
    }

    /// @notice Set the DomesticCatNFT contract address (one-time setup)
    /// @param nftContract The address of the NFT contract
    function setNFTContract(address nftContract) external {
        require(nftContract != address(0), "AMeow: zero address");
        address old = domesticCatNFT;
        domesticCatNFT = nftContract;
        emit NFTContractUpdated(old, nftContract);
    }

    /// @notice Burn tokens - only callable by NFT contract when NFT receives token for power-up
    /// @param from Address to burn from
    /// @param amount Amount to burn
    function burnFrom(address from, uint256 amount) external onlyNFTContract {
        _burn(from, amount);
    }

    /// @notice Get remaining mintable supply
    /// @return Remaining supply available
    function remainingSupply() external view returns (uint256) {
        return MAX_SUPPLY - totalSupply();
    }
}
