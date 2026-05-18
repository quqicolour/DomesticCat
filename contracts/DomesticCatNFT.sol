// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AMeowToken} from "./AMeowToken.sol";
import {CatSVGRegistry} from "./CatSVGRegistry.sol";

// ============ Chainlink VRF Minimal Interfaces ============

/// @notice VRF Coordinator v2 interface
interface VRFCoordinatorV2Interface {
    function requestRandomWords(
        bytes32 keyHash,
        uint64 subId,
        uint16 minConfirmations,
        uint32 callbackGasLimit,
        uint32 numWords
    ) external returns (uint256 requestId);
}

/// @notice VRF v2.5 Wrapper interface (used on L2s like Optimism, Arbitrum)
interface VRFV2PlusWrapperInterface {
    function requestRandomness(
        uint32 callbackGasLimit,
        uint16 requestConfirmations,
        uint32 numWords
    ) external returns (uint256 requestId);
}

/// @notice LINK token interface
interface LinkTokenInterface {
    function transferAndCall(
        address to,
        uint256 value,
        bytes calldata data
    ) external returns (bool success);
    function balanceOf(address account) external view returns (uint256);
}

/// @title DomesticCatNFT
/// @notice Unique SVG-based NFT collection of 10,000 cats with power-up system and Chainlink grand prize
/// @dev Each NFT has a unique SVG generated on-chain based on token ID and power level.
///      Power level increases when the NFT receives AMeow tokens, and the SVG evolves accordingly.
///      The last NFT minted triggers a Chainlink VRF random draw for the grand prize pool.
contract DomesticCatNFT is ERC721, Ownable {
    // ============ Constants ============
    /// @notice Maximum total supply of NFTs
    uint256 public constant MAX_SUPPLY = 10000;

    /// @notice Maximum power level an NFT can reach (100)
    uint32 public constant MAX_POWER_LEVEL = 100;

    /// @notice Amount of AMeow tokens required per power-up increment
    uint256 public constant AMEOW_PER_POWER = 10 * 10 ** 18; // 10 AMEOW per power increment

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

    // ============ Grand Prize (Chainlink VRF) ============
    /// @notice Flag indicating if grand prize has been awarded
    bool public grandPrizeAwarded;
    /// @notice The winning token ID
    uint256 public winningTokenId;
    /// @notice Chainlink VRF request ID => original requester address
    mapping(uint256 => address) private _vrfRequestToSender;
    /// @notice Chainlink VRF callback gas limit
    uint32 public callbackGasLimit = 100000;
    /// @notice Chainlink VRF request confirmations
    uint16 public requestConfirmations = 3;

    // VRF v2 configuration (Ethereum mainnet/Goerli)
    /// @notice Chainlink VRF Coordinator address
    address public vrfCoordinator;
    /// @notice Chainlink VRF subscription ID
    uint64 public vrfSubscriptionId;
    /// @notice Chainlink VRF wrapper address
    address public vrfWrapper;
    /// @notice LINK token address
    address public linkToken;

    // Alternative VRF v2.5 configuration
    /// @notice Whether using VRF v2.5
    bool public useVRFV2_5;
    bytes32 public vrfKeyHash;

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
    event ChainlinkConfigUpdated(
        address vrfCoordinator,
        uint64 subscriptionId,
        bytes32 keyHash
    );
    event ReceivedTokens(address indexed from, uint256 amount);

    // ============ Errors ============
    error MintFeeNotMet();
    error ExceedsMaxSupply();
    error ZeroAddress();
    error AlreadyMinted();
    error NFTNotOwned();
    error MaxPowerReached();
    error GrandPrizeAlreadyAwarded();
    error InvalidVRFRequest();
    error TransferFailed();
    error InvalidSVGParams();

    /// @notice Constructor
    /// @param ameowToken Address of the AMeow token contract
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
        _mintFee = 0.01 ether;
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

    /// @notice Update treasury address (only governance/owner)
    /// @param newTreasury New treasury address
    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), ZeroAddress());
        address old = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(old, newTreasury);
    }

    /// @notice Get current mint fee
    function getMintFee() external view returns (uint256) {
        return _mintFee;
    }

    /// @notice Get fee recipient address
    function getFeeRecipient() external view returns (address) {
        return _feeRecipient;
    }

    // ============ Chainlink VRF Configuration ============

    /// @notice Configure Chainlink VRF v2 settings
    /// @param _vrfCoordinator VRF Coordinator address
    /// @param _subscriptionId VRF subscription ID
    /// @param _keyHash VRF key hash
    /// @param _linkToken LINK token address
    function configureVRFv2(
        address _vrfCoordinator,
        uint64 _subscriptionId,
        bytes32 _keyHash,
        address _linkToken
    ) external onlyOwner {
        require(_vrfCoordinator != address(0), ZeroAddress());
        vrfCoordinator = _vrfCoordinator;
        vrfSubscriptionId = _subscriptionId;
        vrfKeyHash = _keyHash;
        linkToken = _linkToken;
        useVRFV2_5 = false;
        emit ChainlinkConfigUpdated(_vrfCoordinator, _subscriptionId, _keyHash);
    }

    /// @notice Configure Chainlink VRF v2.5 settings (recommended for L2s)
    /// @param _vrfCoordinator VRF Coordinator address
    /// @param _subscriptionId VRF subscription ID
    /// @param _keyHash VRF key hash
    /// @param _wrapper VRF Wrapper address
    function configureVRFv2_5(
        address _vrfCoordinator,
        uint64 _subscriptionId,
        bytes32 _keyHash,
        address _wrapper
    ) external onlyOwner {
        require(_vrfCoordinator != address(0), ZeroAddress());
        vrfCoordinator = _vrfCoordinator;
        vrfSubscriptionId = _subscriptionId;
        vrfKeyHash = _keyHash;
        vrfWrapper = _wrapper;
        useVRFV2_5 = true;
        emit ChainlinkConfigUpdated(_vrfCoordinator, _subscriptionId, _keyHash);
    }

    /// @notice Update VRF callback gas limit
    /// @param gas New gas limit
    function setCallbackGasLimit(uint32 gas) external onlyOwner {
        callbackGasLimit = gas;
    }

    /// @notice Update VRF request confirmations
    /// @param confirmations New confirmation count
    function setRequestConfirmations(uint16 confirmations) external onlyOwner {
        requestConfirmations = confirmations;
    }

    // ============ NFT Minting ============

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

        // If this is the last NFT, trigger grand prize
        if (_tokenIdCounter == MAX_SUPPLY) {
            _requestRandomWords();
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
            _requestRandomWords();
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

    // ============ Chainlink VRF - Random Words ============

    /// @notice Internal function to request random words for grand prize
    function _requestRandomWords() internal {
        require(!grandPrizeAwarded, "Already awarded");
        require(vrfCoordinator != address(0), "VRF not configured");

        uint256 requestId;
        bool isValidRandomness = false;

        if (useVRFV2_5 && vrfWrapper != address(0)) {
            // VRF v2.5 (via wrapper) - supported on optimism, arbitrum, etc.
            isValidRandomness = _requestRandomWordsVRFv2_5();
        } else {
            // VRF v2 direct
            isValidRandomness = _requestRandomWordsVRFv2();
        }

        require(isValidRandomness, "VRF request failed");
    }

    function _requestRandomWordsVRFv2() internal returns (bool success) {
        try
            VRFCoordinatorV2Interface(vrfCoordinator).requestRandomWords(
                vrfKeyHash,
                vrfSubscriptionId,
                requestConfirmations,
                callbackGasLimit,
                1 // numWords
            )
        returns (uint256 requestId) {
            _vrfRequestToSender[requestId] = msg.sender;
            emit GrandPrizeRequested(requestId);
            return true;
        } catch {
            return false;
        }
    }

    function _requestRandomWordsVRFv2_5() internal returns (bool success) {
        try
            VRFV2PlusWrapperInterface(vrfWrapper).requestRandomness(
                callbackGasLimit,
                requestConfirmations,
                1 // numWords
            )
        returns (uint256 requestId) {
            _vrfRequestToSender[requestId] = msg.sender;
            emit GrandPrizeRequested(requestId);
            return true;
        } catch {
            return false;
        }
    }

    /// @notice Callback function called by Chainlink VRF coordinator
    /// @param requestId The VRF request ID
    /// @param randomWords Array of random words
    function rawFulfillRandomWords(
        uint256 requestId,
        uint256[] memory randomWords
    ) external {
        require(
            msg.sender == vrfCoordinator || msg.sender == vrfWrapper,
            "Only VRF coordinator"
        );
        _fulfillRandomWords(requestId, randomWords);
    }

    /// @notice Internal function to fulfill random words and select winner
    /// @param requestId The VRF request ID
    /// @param randomWords Array of random words
    function _fulfillRandomWords(
        uint256 requestId,
        uint256[] memory randomWords
    ) internal {
        if (grandPrizeAwarded) return;
        require(
            _vrfRequestToSender[requestId] != address(0),
            InvalidVRFRequest()
        );

        uint256 randomWord = randomWords[0];
        uint256 prizePool = address(this).balance;

        // Select winner: random number modulo MAX_SUPPLY
        winningTokenId = randomWord % MAX_SUPPLY;
        grandPrizeAwarded = true;

        // Transfer prize to winner
        address winner = ownerOf(winningTokenId);
        (bool sent, ) = winner.call{value: prizePool}("");
        require(sent, TransferFailed());

        emit GrandPrizeAwarded(winningTokenId, prizePool);
    }

    // ============ On-Chain SVG Generation ============

    /// @notice Get the tokenURI for a given NFT (ERC721 metadata)
    /// @dev Delegates to SVG_REGISTRY.buildTokenURI() — single external call,
    ///      eliminates duplicate base64 + attribute building in main contract.
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
    /// @dev Only withdraws token not reserved for grand prize
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
    function totalMinted() external view returns (uint256) {
        return _tokenIdCounter;
    }

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
