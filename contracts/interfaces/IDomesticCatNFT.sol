// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IDomesticCatNFT
/// @notice Interface for DomesticCatNFT contract interactions
interface IDomesticCatNFT {
    /// @notice Emitted when user transfers AMeow tokens to an NFT for power-up
    /// @param nftId The NFT ID being powered up
    /// @param tokenId The AMeow token ID used (burned)
    /// @param newPowerLevel The new power level after increment
    event NFTPowerUp(uint256 indexed nftId, uint256 indexed tokenId, uint32 newPowerLevel);

    /// @notice Emitted when governance updates mint fee
    /// @param oldFee The previous mint fee
    /// @param newFee The new mint fee
    event MintFeeUpdated(uint256 oldFee, uint256 newFee);

    /// @notice Emitted when governance updates fee recipient
    /// @param oldRecipient The previous fee recipient
    /// @param newRecipient The new fee recipient
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);

    /// @notice Emitted when Chainlink VRF random number is requested for grand prize
    /// @param requestId The VRF request ID
    event GrandPrizeRequested(uint256 indexed requestId);

    /// @notice Emitted when grand prize winner is determined
    /// @param winnerTokenId The winning NFT token ID
    /// @param prizeAmount The prize amount awarded
    event GrandPrizeAwarded(uint256 indexed winnerTokenId, uint256 prizeAmount);

    /// @notice Get the power level of a specific NFT
    /// @param nftId The NFT ID to query
    /// @return The current power level (0-100)
    function getNFTPowerLevel(uint256 nftId) external view returns (uint32);

    /// @notice Get the total number of NFTs minted
    /// @return The total supply
    function totalSupply() external view returns (uint256);

    /// @notice Get the mint fee set by governance
    /// @return The current mint fee in wei
    function getMintFee() external view returns (uint256);

    /// @notice Check if the grand prize has been awarded
    /// @return True if prize was awarded
    function isGrandPrizeAwarded() external view returns (bool);
}
