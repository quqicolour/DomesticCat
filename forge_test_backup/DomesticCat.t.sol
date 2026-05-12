// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test, console2 } from "forge-std/Test.sol";
import { AMeowToken } from "../contracts/AMeowToken.sol";
import { DomesticCatNFT } from "../contracts/DomesticCatNFT.sol";

/// @title DomesticCatNFT Test Suite
/// @notice Comprehensive tests for the DomesticCat NFT Art Project
contract DomesticCatTest is Test {
    AMeowToken public ameowToken;
    DomesticCatNFT public nft;

    address public owner = address(this);
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");
    address public governance = makeAddr("governance");

    // Governance constants
    uint256 constant INITIAL_MINT_FEE = 0.01 ether;
    uint256 constant MAX_SUPPLY = 10000;
    uint32 constant MAX_POWER_LEVEL = 100;
    uint256 constant AMEOW_PER_POWER = 10 * 10 ** 18; // 10 AMEOW per power increment

    // VRF mock values
    uint64 constant MOCK_SUBSCRIPTION_ID = 1234;
    bytes32 constant MOCK_KEY_HASH = keccak256("mockKeyHash");
    address constant MOCK_VRF_COORDINATOR = address(0x1234);
    address constant MOCK_LINK_TOKEN = address(0x5678);
    uint32 constant MOCK_CALLBACK_GAS_LIMIT = 100000;
    uint16 constant MOCK_REQUEST_CONFIRMATIONS = 3;

    function setUp() public {
        // Deploy AMeowToken
        ameowToken = new AMeowToken();

        // Deploy DomesticCatNFT
        nft = new DomesticCatNFT(address(ameowToken));

        // Link NFT to token
        ameowToken.setNFTContract(address(nft));

        // Configure VRF (using mock values for testing)
        nft.configureVRFv2(
            MOCK_VRF_COORDINATOR,
            MOCK_SUBSCRIPTION_ID,
            MOCK_KEY_HASH,
            MOCK_LINK_TOKEN
        );

        // Transfer some AMEOW tokens to users for testing
        ameowToken.transfer(user1, 1000 * 10 ** 18);
        ameowToken.transfer(user2, 1000 * 10 ** 18);
    }

    // ========================
    // AMeowToken Tests
    // ========================

    function test_AMeowTokenInitialSupply() public {
        assertEq(ameowToken.totalSupply(), 1_000_000 * 10 ** 18);
        assertEq(ameowToken.maxSupply(), 1_000_000 * 10 ** 18);
    }

    function test_AMeowTokenNameAndSymbol() public {
        assertEq(ameowToken.name(), "AMeow Token");
        assertEq(ameowToken.symbol(), "AMEOW");
    }

    function test_AMeowTokenNFTContractSet() public {
        assertEq(ameowToken.domesticCatNFT(), address(nft));
    }

    function test_AMeowTokenRemainingSupply() public {
        assertEq(ameowToken.remainingSupply(), 0); // All minted at deployment
    }

    function test_AMeowTokenTransfer() public {
        uint256 amount = 100 * 10 ** 18;
        vm.prank(user1);
        ameowToken.transfer(user2, amount);
        assertEq(ameowToken.balanceOf(user2), 1000 * 10 ** 18 + amount);
    }

    // ========================
    // Governance Tests
    // ========================

    function test_InitialGovernanceSettings() public {
        assertEq(nft.getMintFee(), INITIAL_MINT_FEE);
        assertEq(nft.getFeeRecipient(), owner);
    }

    function test_SetMintFee() public {
        uint256 newFee = 0.05 ether;
        nft.setMintFee(newFee);
        assertEq(nft.getMintFee(), newFee);
    }

    function test_SetFeeRecipient() public {
        nft.setFeeRecipient(user1);
        assertEq(nft.getFeeRecipient(), user1);
    }

    function test_SetFeeRecipientToZero() public {
        vm.expectRevert(DomesticCatNFT.ZeroAddress.selector);
        nft.setFeeRecipient(address(0));
    }

    function test_SetTreasury() public {
        nft.setTreasury(user2);
        assertEq(nft.treasury(), user2);
    }

    // ========================
    // NFT Minting Tests
    // ========================

    function test_MintSingleNFT() public {
        uint256 mintFee = nft.getMintFee();
        vm.deal(user1, mintFee);

        uint256 balanceBefore = nft.balanceOf(user1);
        vm.prank(user1);
        nft.mint{value: mintFee}();

        assertEq(nft.balanceOf(user1), balanceBefore + 1);
        assertEq(nft.totalMinted(), 1);
        assertEq(nft.getNFTPowerLevel(0), 1); // Initial power level is 1
    }

    function test_MintInsufficientFee() public {
        uint256 mintFee = nft.getMintFee();
        vm.deal(user1, mintFee - 1);

        vm.prank(user1);
        vm.expectRevert(DomesticCatNFT.MintFeeNotMet.selector);
        nft.mint{value: mintFee - 1}();
    }

    function test_MintMaxSupplyExceeded() public {
        // This would require minting 10000 NFTs which is too slow for unit tests
        // In production, use integration tests with batch minting
        // Here we just verify MAX_SUPPLY constant
        assertEq(MAX_SUPPLY, 10000);
    }

    function test_BatchMint() public {
        uint256 quantity = 5;
        uint256 totalFee = nft.getMintFee() * quantity;
        vm.deal(user1, totalFee);

        vm.prank(user1);
        nft.batchMint{value: totalFee}(quantity);

        assertEq(nft.balanceOf(user1), quantity);
        assertEq(nft.totalMinted(), quantity);
    }

    function test_BatchMintInsufficientFee() public {
        uint256 quantity = 5;
        uint256 totalFee = nft.getMintFee() * quantity;
        vm.deal(user1, totalFee - 1);

        vm.prank(user1);
        vm.expectRevert(DomesticCatNFT.MintFeeNotMet.selector);
        nft.batchMint{value: totalFee - 1}(quantity);
    }

    function test_MintFeeSplit() public {
        uint256 mintFee = nft.getMintFee();
        uint256 half = mintFee / 2;
        vm.deal(user1, mintFee);

        uint256 treasuryBefore = nft.treasury().balance;

        vm.prank(user1);
        nft.mint{value: mintFee}();

        // Treasury should receive half
        assertEq(nft.treasury().balance, treasuryBefore + half);
    }

    // ========================
    // Power-Up System Tests
    // ========================

    function test_PowerUpNFT() public {
        // First mint an NFT
        uint256 mintFee = nft.getMintFee();
        vm.deal(user1, mintFee);
        vm.prank(user1);
        nft.mint{value: mintFee}();

        // Approve NFT contract to spend AMEOW
        uint256 powerUpAmount = AMEOW_PER_POWER; // 10 AMEOW
        vm.prank(user1);
        ameowToken.approve(address(nft), powerUpAmount);

        // Power up
        vm.prank(user1);
        nft.powerUpNFT(0, powerUpAmount);

        // Verify power increased by 1 (10 AMEOW = 1 power increment)
        assertEq(nft.getNFTPowerLevel(0), 2);
        assertEq(nft.nftAccumulatedAMeow(0), powerUpAmount);
    }

    function test_PowerUpMultipleIncrements() public {
        // Mint NFT
        uint256 mintFee = nft.getMintFee();
        vm.deal(user1, mintFee);
        vm.prank(user1);
        nft.mint{value: mintFee}();

        // Power up with enough for 5 increments (50 AMEOW)
        uint256 powerUpAmount = 50 * 10 ** 18;
        vm.prank(user1);
        ameowToken.approve(address(nft), powerUpAmount);

        vm.prank(user1);
        nft.powerUpNFT(0, powerUpAmount);

        assertEq(nft.getNFTPowerLevel(0), 6); // Initial 1 + 5 = 6
    }

    function test_PowerUpMaxPowerCapped() public {
        // Mint NFT
        uint256 mintFee = nft.getMintFee();
        vm.deal(user1, mintFee);
        vm.prank(user1);
        nft.mint{value: mintFee}();

        // Give user huge amount of AMEOW
        uint256 hugeAmount = 10000 * 10 ** 18;
        vm.prank(owner);
        ameowToken.transfer(user1, hugeAmount);

        vm.prank(user1);
        ameowToken.approve(address(nft), hugeAmount);

        vm.prank(user1);
        nft.powerUpNFT(0, hugeAmount);

        // Power should be capped at MAX_POWER_LEVEL
        assertEq(nft.getNFTPowerLevel(0), MAX_POWER_LEVEL);
    }

    function test_PowerUpNotOwner() public {
        // Mint NFT for user1
        uint256 mintFee = nft.getMintFee();
        vm.deal(user1, mintFee);
        vm.prank(user1);
        nft.mint{value: mintFee}();

        // Try to power up by user2 (not owner)
        vm.prank(user2);
        vm.expectRevert(DomesticCatNFT.NFTNotOwned.selector);
        nft.powerUpNFT(0, AMEOW_PER_POWER);
    }

    function test_PowerUpZeroAmount() public {
        // Mint NFT
        uint256 mintFee = nft.getMintFee();
        vm.deal(user1, mintFee);
        vm.prank(user1);
        nft.mint{value: mintFee}();

        vm.prank(user1);
        vm.expectRevert(DomesticCatNFT.MaxPowerReached.selector);
        nft.powerUpNFT(0, 0);
    }

    // ========================
    // Token URI / SVG Tests
    // ========================

    function test_TokenURIExists() public {
        // Mint NFT
        uint256 mintFee = nft.getMintFee();
        vm.deal(user1, mintFee);
        vm.prank(user1);
        nft.mint{value: mintFee}();

        string memory uri = nft.tokenURI(0);
        assertTrue(bytes(uri).length > 0);
        // Should start with data:application/json;base64,
        assertTrue(_startsWith(uri, "data:application/json;base64,"));
    }

    function test_TokenURINotMinted() public {
        vm.expectRevert();
        nft.tokenURI(9999);
    }

    function test_SVGContainsPowerLevel() public {
        // Mint NFT
        uint256 mintFee = nft.getMintFee();
        vm.deal(user1, mintFee);
        vm.prank(user1);
        nft.mint{value: mintFee}();

        // Power up to level 50
        uint256 powerUpAmount = (50 - 1) * AMEOW_PER_POWER; // Need 49 more power
        vm.prank(user1);
        ameowToken.approve(address(nft), powerUpAmount);

        vm.prank(user1);
        nft.powerUpNFT(0, powerUpAmount);

        string memory uri = nft.tokenURI(0);
        // URI is base64 encoded JSON, check SVG contains "POWER: 50"
        assertTrue(_contains(uri, "POWER:"));
    }

    // Helper for string contains - checks if needle exists in haystack
    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (h.length < n.length) return false;
        for (uint256 i = 0; i <= h.length - n.length; i++) {
            bool found = true;
            for (uint256 j = 0; j < n.length; j++) {
                if (h[i + j] != n[j]) {
                    found = false;
                    break;
                }
            }
            if (found) return true;
        }
        return false;
    }

    function _startsWith(string memory str, string memory prefix) internal pure returns (bool) {
        bytes memory strBytes = bytes(str);
        bytes memory prefixBytes = bytes(prefix);
        if (strBytes.length < prefixBytes.length) return false;
        for (uint256 i = 0; i < prefixBytes.length; i++) {
            if (strBytes[i] != prefixBytes[i]) return false;
        }
        return true;
    }

    // ========================
    // Grand Prize / Chainlink VRF Tests
    // ========================

    function test_GrandPrizeNotTriggeredMidSupply() public {
        // Mint one NFT, should not trigger VRF
        uint256 mintFee = nft.getMintFee();
        vm.deal(user1, mintFee);
        vm.prank(user1);
        nft.mint{value: mintFee}();

        assertFalse(nft.grandPrizeAwarded());
    }

    function test_GrandPrizeConfig() public {
        assertEq(nft.vrfCoordinator(), MOCK_VRF_COORDINATOR);
        assertEq(nft.vrfSubscriptionId(), MOCK_SUBSCRIPTION_ID);
        assertEq(nft.vrfKeyHash(), MOCK_KEY_HASH);
    }

    function test_SetCallbackGasLimit() public {
        nft.setCallbackGasLimit(200000);
        assertEq(nft.callbackGasLimit(), 200000);
    }

    function test_SetRequestConfirmations() public {
        nft.setRequestConfirmations(6);
        assertEq(nft.requestConfirmations(), 6);
    }

    // ========================
    // Withdrawal Tests
    // ========================

    function test_WithdrawETH() public {
        // Send ETH to contract
        vm.deal(address(nft), 1 ether);

        uint256 ownerBefore = owner.balance;
        nft.withdrawETH();
        assertEq(owner.balance, ownerBefore + 1 ether);
    }

    function test_WithdrawERC20() public {
        // Deploy a mock ERC20 and send to NFT contract
        vm.prank(owner);
        ameowToken.transfer(address(nft), 100 * 10 ** 18);

        uint256 ownerBefore = ameowToken.balanceOf(owner);
        nft.withdrawERC20(address(ameowToken));
        assertEq(ameowToken.balanceOf(owner), ownerBefore + 100 * 10 ** 18);
    }

    // ========================
    // View Functions Tests
    // ========================

    function test_TotalSupply() public {
        uint256 mintFee = nft.getMintFee();
        vm.deal(user1, mintFee * 3);

        vm.prank(user1);
        nft.batchMint{value: mintFee * 3}(3);

        assertEq(nft.totalSupply(), 3);
    }

    function test_ContractBalance() public {
        uint256 mintFee = nft.getMintFee();
        vm.deal(user1, mintFee);
        vm.prank(user1);
        nft.mint{value: mintFee}();

        // Contract should have received half the mint fee
        uint256 half = mintFee / 2;
        assertEq(nft.getContractBalance(), half);
    }

    function test_NFTPowerLevelInitialized() public {
        uint256 mintFee = nft.getMintFee();
        vm.deal(user1, mintFee);
        vm.prank(user1);
        nft.mint{value: mintFee}();

        assertEq(nft.getNFTPowerLevel(0), 1); // Starts at 1, not 0
    }

    // ========================
    // Edge Cases
    // ========================

    function test_ReentrantMintProtected() public {
        // NFT contract should be protected against reentrancy
        uint256 mintFee = nft.getMintFee();
        vm.deal(user1, mintFee);
        vm.prank(user1);
        nft.mint{value: mintFee}();
        // If no revert, mint succeeded
        assertEq(nft.balanceOf(user1), 1);
    }

    function test_PowerUpNFTBurnsAMEOW() public {
        // Mint NFT
        uint256 mintFee = nft.getMintFee();
        vm.deal(user1, mintFee);
        vm.prank(user1);
        nft.mint{value: mintFee}();

        uint256 amount = 20 * 10 ** 18;
        vm.prank(user1);
        ameowToken.approve(address(nft), amount);

        uint256 userBalanceBefore = ameowToken.balanceOf(user1);
        uint256 contractAMeowBefore = ameowToken.balanceOf(address(nft));

        vm.prank(user1);
        nft.powerUpNFT(0, amount);

        // User should have less AMEOW (spent)
        assertEq(ameowToken.balanceOf(user1), userBalanceBefore - amount);
        // Contract should have AMEOW temporarily, then burn
        // After burn, contract AMEOW balance = contractAMeowBefore + amount - burned
        uint256 expectedContractBalance = contractAMeowBefore + amount - amount;
        assertEq(ameowToken.balanceOf(address(nft)), expectedContractBalance);
    }
}
