// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AMeowToken} from "./AMeowToken.sol";
import {CatSVGRegistry} from "./CatSVGRegistry.sol";

/// @title DomesticCatNFT
/// @notice Unique SVG-based NFT collection of 10,000 cats with power-up system and on-chain grand prize.
/// @dev Each NFT has a unique SVG generated on-chain based on token ID and power level.
///      Power level increases when the NFT receives AMeow tokens, and the SVG evolves accordingly.
///      The last NFT minted triggers a block-hash-based random draw for the grand prize pool.
///      Randomness is derived from the XOR of the last 10 block hashes after mint closes,
///      mixed with the contract balance and the previous winning token ID for added entropy.
contract DomesticCatNFT is ERC721, Ownable {
    // ============ Constants ============
    /// @notice Maximum total supply of NFTs
    uint256 public constant MAX_SUPPLY = 10000;

    /// @notice Maximum power level an NFT can reach (100)
    uint32 public constant MAX_POWER_LEVEL = 100;

    /// @notice Amount of AMeow tokens required per power-up increment (10 AMEOW)
    uint256 public constant AMEOW_PER_POWER = 10 * 10 ** 18;

    // ============ Immutable Storage ============
    /// @notice Address of the AMeow token contract
    AMeowToken public immutable AMEOW_TOKEN;
    /// @notice Address of the CatSVGRegistry for on-chain SVG generation
    CatSVGRegistry public immutable SVG_REGISTRY;

    // ============ Governance (mutable via governance) ============
    /// @notice Mint fee set by governance (in wei)
    uint256 private _mintFee;
    /// @notice Fee recipient address set by governance
    address private _feeRecipient;
    /// @notice Treasury address for official fees
    address public treasury;

    // ============ Counters ============
    uint256 private _tokenIdCounter;

    // ============ NFT Data ============
    /// @notice Power level for each NFT (tokenId => powerLevel, 0-100)
    mapping(uint256 => uint32) public nftPowerLevel;

    /// @notice Accumulated AMeow tokens received by each NFT
    mapping(uint256 => uint256) public nftAccumulatedAMeow;

    // ============ Grand Prize (Block-Hash Randomness) ============
    /// @notice Flag indicating if grand prize has been awarded
    bool public grandPrizeAwarded;
    /// @notice The winning token ID
    uint256 public winningTokenId;

    /// @notice Fixed-size circular buffer of the last 10 block hashes used for randomness.
    ///         Updated sequentially; each new draw appends the next block hash.
    bytes32[10] private _recentBlockHashes;

    /// @notice Index (0-9) of the next slot in _recentBlockHashes to overwrite
    uint8 private _blockHashIndex;

    /// @notice Block number at which the last random draw was finalised
    uint256 public lastRandomBlock;

    // ============ Events ============
    event MintFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    event NFTPowerUp(
        uint256 indexed nftId,
        uint256 tokenId,
        uint32 newPowerLevel
    );
    event GrandPrizeRequested(uint256 indexed requestId);
    event GrandPrizeAwarded(uint256 indexed winnerTokenId, uint256 prizeAmount);
    event ReceivedTokens(address indexed from, uint256 amount);

    // ============ Errors ============
    error MintFeeNotMet();
    error ExceedsMaxSupply();
    error ZeroAddress();
    error AlreadyMinted();
    error NFTNotOwned();
    error MaxPowerReached();
    error GrandPrizeAlreadyAwarded();
    error TransferFailed();
    error InvalidSVGParams();
    error RandomnessNotReady();

    // ============ Constructor ============
    /// @param ameowToken Address of the AMeow token contract
    /// @param svgRegistry Address of the CatSVGRegistry contract
    constructor(
        address ameowToken,
        address svgRegistry
    ) ERC721("DomesticCat", "DCAT") Ownable(msg.sender) {
        require(
            ameowToken != address(0) && svgRegistry != address(0),
            InvalidSVGParams()
        );
        AMEOW_TOKEN = AMeowToken(ameowToken);
        SVG_REGISTRY = CatSVGRegistry(svgRegistry);
        _mintFee = 0.001 ether;
        _feeRecipient = msg.sender;
        treasury = msg.sender;
    }

    // ============ Governance Functions ============

    /// @notice Update mint fee (only governance/owner)
    /// @param newFee New mint fee in wei
    function setMintFee(uint256 newFee) external onlyOwner {
        require(newFee != _mintFee, "Same fee");
        uint256 old = _mintFee;
        _mintFee = newFee;
        emit MintFeeUpdated(old, newFee);
    }

    /// @notice Update fee recipient address (only governance/owner)
    /// @param newRecipient New fee recipient address
    function setFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), ZeroAddress());
        address old = _feeRecipient;
        _feeRecipient = newRecipient;
        emit FeeRecipientUpdated(old, newRecipient);
    }

    /// @notice Get the current mint fee
    function getMintFee() external view returns (uint256) {
        return _mintFee;
    }

    /// @notice Get the current fee recipient
    function getFeeRecipient() external view returns (address) {
        return _feeRecipient;
    }

    /// @notice Update treasury address (only governance/owner)
    /// @param newTreasury New treasury address
    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), ZeroAddress());
        address old = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(old, newTreasury);
    }

    // ============ Minting ============

    /// @notice Mint a new NFT (caller pays mintFee)
    /// @dev Fee split: portion to treasury, rest stays in contract for grand prize
    function mint() external payable {
        uint256 tokenId = _tokenIdCounter;
        if (tokenId >= MAX_SUPPLY) revert ExceedsMaxSupply();
        if (msg.value < _mintFee) revert MintFeeNotMet();

        _tokenIdCounter++;

        _safeMint(msg.sender, tokenId);

        // Initialize power level to 1 for each NFT
        nftPowerLevel[tokenId] = 1;

        // Split payment: 50% to treasury, 50% to prize pool (contract balance)
        uint256 half = msg.value / 2;
        (bool sentTreasury, ) = treasury.call{value: half}("");
        require(sentTreasury, TransferFailed());

        // Remaining half stays in contract for grand prize

        // If this is the last NFT, trigger grand prize draw
        if (_tokenIdCounter == MAX_SUPPLY) {
            _triggerGrandPrizeDraw();
        }
    }

    /// @notice Batch mint multiple NFTs
    /// @param quantity Number of NFTs to mint
    function batchMint(uint256 quantity) external payable {
        uint256 startId = _tokenIdCounter;
        uint256 newSupply = startId + quantity;
        if (newSupply > MAX_SUPPLY) revert ExceedsMaxSupply();

        uint256 totalFee = _mintFee * quantity;
        if (msg.value < totalFee) revert MintFeeNotMet();

        uint256 half = msg.value / 2;
        (bool sentTreasury, ) = treasury.call{value: half}("");
        require(sentTreasury, TransferFailed());

        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = startId + i;
            _safeMint(msg.sender, tokenId);
            nftPowerLevel[tokenId] = 1;
        }
        _tokenIdCounter = startId + quantity;

        if (newSupply == MAX_SUPPLY) {
            _triggerGrandPrizeDraw();
        }
    }

    // ============ Power-Up System (AMeow Token) ============

    /// @notice Power up an NFT by transferring AMeow tokens to this contract
    /// @dev Tokens are burned, increasing the NFT's power level
    /// @param nftId The NFT ID to power up
    /// @param tokenAmount Amount of AMeow tokens to use for power-up
    function powerUpNFT(uint256 nftId, uint256 tokenAmount) external {
        require(ownerOf(nftId) == msg.sender, NFTNotOwned());

        uint32 currentPower = nftPowerLevel[nftId];
        if (currentPower >= MAX_POWER_LEVEL) revert MaxPowerReached();

        // Calculate how many power increments this adds
        uint256 increments = tokenAmount / AMEOW_PER_POWER;
        if (increments == 0) revert MaxPowerReached();

        uint32 newPower = currentPower + uint32(increments);
        if (newPower > MAX_POWER_LEVEL) {
            newPower = MAX_POWER_LEVEL;
        }

        // Transfer AMEOW tokens from sender to this contract
        require(
            AMEOW_TOKEN.transferFrom(msg.sender, address(this), tokenAmount),
            "Transfer failed"
        );

        // Burn the tokens (AMEOW contract burns from this contract)
        AMEOW_TOKEN.burnFrom(address(this), tokenAmount);

        nftPowerLevel[nftId] = newPower;
        nftAccumulatedAMeow[nftId] += tokenAmount;

        emit NFTPowerUp(nftId, 0, newPower);
    }

    /// @notice Get power level of an NFT
    /// @param nftId The NFT ID
    /// @return Power level (0-100)
    function getNFTPowerLevel(uint256 nftId) external view returns (uint32) {
        return nftPowerLevel[nftId];
    }

    // ============ Block-Hash Grand Prize Draw ============

    /// @notice Internal function to trigger the grand prize random draw.
    /// @dev Stores the current block number; randomness is materialised lazily in
    ///      getWinningTokenId() which pulls block hashes AFTER they are confirmed.
    function _triggerGrandPrizeDraw() internal {
        require(!grandPrizeAwarded, "Already awarded");
        lastRandomBlock = block.number;
        emit GrandPrizeRequested(lastRandomBlock);
    }

    /// @notice Get the winning token ID using on-chain block-hash randomness.
    /// @dev Combines:
    ///        1. XOR of the last 10 block hashes (stored in _recentBlockHashes)
    ///        2. Contract's ETH balance (adds live entropy)
    ///        3. Previous winning token ID (chains each draw)
    ///      Can be called by anyone after lastRandomBlock is set.
    ///      Reverts if the draw block is not yet confirmed (blockhash == 0x0).
    /// @return The winning token ID (0 - 9999)
    function getWinningTokenId() external returns (uint256) {
        require(lastRandomBlock != 0, "Draw not triggered");
        require(!grandPrizeAwarded, "Already awarded");

        // Materialise randomness only once
        grandPrizeAwarded = true;

        // ---- Entropy source 1: XOR of the 10 stored block hashes ----
        bytes32 combinedHash = bytes32(0);
        for (uint8 i = 0; i < 10; i++) {
            combinedHash ^= _recentBlockHashes[i];
        }

        // ---- Entropy source 2: blockhash of the draw-trigger block ----
        // Must wait at least 1 block for the trigger block to be confirmed
        bytes32 drawBlockHash = blockhash(lastRandomBlock);
        if (drawBlockHash == bytes32(0)) {
            revert RandomnessNotReady(); // block not yet confirmed
        }
        combinedHash ^= drawBlockHash;

        // ---- Entropy source 3: live contract balance ----
        uint256 entropy = uint256(combinedHash) ^ address(this).balance ^ block.gaslimit;

        // ---- Entropy source 4: previous winner (chains randomness across draws) ----
        entropy ^= winningTokenId << 144; // spread token ID across high bits

        // ---- Final selection: modulo MAX_SUPPLY ----
        winningTokenId = entropy % MAX_SUPPLY;
        uint256 prizeAmount = address(this).balance;

        // ---- Append this block hash to the circular buffer for the NEXT draw ----
        _recentBlockHashes[_blockHashIndex] = blockhash(block.number);
        _blockHashIndex = (_blockHashIndex + 1) % 10;

        if (prizeAmount > 0) {
            (bool sent, ) = ownerOf(winningTokenId).call{value: prizeAmount}("");
            require(sent, TransferFailed());
        }

        emit GrandPrizeAwarded(winningTokenId, prizeAmount);
        return winningTokenId;
    }

    // ============ On-Chain SVG Generation ============

    /// @notice Get the tokenURI for a given NFT (ERC721 metadata)
    /// @dev Delegates to SVG_REGISTRY.buildTokenURI()
    /// @param tokenId The NFT token ID
    /// @return Base64 encoded data URL containing SVG and metadata
    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        _requireOwned(tokenId);
        return
            SVG_REGISTRY.buildTokenURI(
                tokenId,
                nftPowerLevel[tokenId],
                nftAccumulatedAMeow[tokenId],
                MAX_POWER_LEVEL
            );
    }

    /// @notice Generate unique SVG based on token ID and power level
    /// @dev Delegates to SVG_REGISTRY for on-chain SVG generation.
    /// @param tokenId The NFT token ID
    /// @param powerLevel Current power level (0-100)
    /// @return SVG string — pure visual art, zero text
    function _generateSVG(
        uint256 tokenId,
        uint32 powerLevel
    ) internal view returns (string memory) {
        return SVG_REGISTRY.generateSVG(tokenId, powerLevel);
    }

    // ============ Withdrawal ============

    /// @notice Withdraw token accidentally sent to contract
    function withdraw(address token) external onlyOwner {
        uint256 balance;
        if (token == address(0)) {
            balance = address(this).balance;
        } else {
            balance = IERC20(token).balanceOf(address(this));
        }
        require(balance > 0, "No ETH");
        (bool sent, ) = owner().call{value: balance}("");
        require(sent, TransferFailed());
    }

    // ============ View Functions ============

    /// @notice Total number of NFTs minted
    function totalMinted() external view returns (uint256) {
        return _tokenIdCounter;
    }

    /// @notice Current contract ETH balance (prize pool + any accidental deposits)
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {
        emit ReceivedTokens(msg.sender, msg.value);
    }
}

// Minimal IERC20 interface for withdrawal
interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}
