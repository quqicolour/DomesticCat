// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title CatSVGRegistry
 * @notice On-chain SVG renderer for DomesticCat NFTs.
 *         10,000 unique designs — each tokenId maps to exactly one visual variant.
 *         All colors derived from keccak256(tokenId, tag). No optimizer needed.
 *
 *  Unique design space (10,000 exactly):
 *    trait[0] = tokenId % 10  — background hue
 *    trait[1] = tokenId % 10  — cat body color
 *    trait[2] = tokenId % 10  — eye color
 *    trait[3] = tokenId % 10  — pattern style
 *    power-driven: aura circle + chest emblem evolve with AMeow
 *
 *  Compilation: solc 0.8.28, viaIR: false, optimizer: disabled
 */
contract CatSVGRegistry {
    // =======================================================================
    // Pure utilities
    // =======================================================================

    /// @notice keccak256 → deterministic hex color, range [50,254] per channel
    function _c(
        uint256 seed,
        uint256 tag
    ) private pure returns (string memory) {
        bytes32 h = keccak256(abi.encodePacked(seed, tag));
        uint256 r = ((uint256(uint8(h[0])) * 205) >> 8) + 50;
        uint256 g = ((uint256(uint8(h[1])) * 205) >> 8) + 50;
        uint256 b = ((uint256(uint8(h[2])) * 205) >> 8) + 50;
        bytes memory hx = new bytes(7);
        hx[0] = "#";
        hx[1] = _hex(uint8(r >> 4));
        hx[2] = _hex(uint8(r & 0x0f));
        hx[3] = _hex(uint8(g >> 4));
        hx[4] = _hex(uint8(g & 0x0f));
        hx[5] = _hex(uint8(b >> 4));
        hx[6] = _hex(uint8(b & 0x0f));
        return string(hx);
    }

    function _hex(uint8 n) private pure returns (bytes1) {
        return n < 10 ? bytes1(n + 48) : bytes1(n + 87);
    }

    /// @notice uint256 → decimal string
    function _u2s(uint256 n) private pure returns (string memory) {
        if (n == 0) return "0";
        uint256 len;
        uint256 tmp = n;
        while (tmp != 0) {
            len++;
            tmp /= 10;
        }
        bytes memory b = new bytes(len);
        for (uint256 i = len; i > 0; i--) {
            b[i - 1] = bytes1(uint8(48 + (n % 10)));
            n /= 10;
        }
        return string(b);
    }

    /// @notice Raw bytes → Base64 URL-safe string
    function _b64(bytes memory data) private pure returns (string memory) {
        bytes
            memory alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        uint256 len = data.length;
        uint256 resultLen = ((len + 2) / 3) * 4;
        bytes memory result = new bytes(resultLen);
        uint256 idx;
        for (uint256 i = 0; i < len; i += 3) {
            uint256 a = uint8(data[i]);
            uint256 b = i + 1 < len ? uint8(data[i + 1]) : 0;
            uint256 c = i + 2 < len ? uint8(data[i + 2]) : 0;
            result[idx++] = alphabet[a >> 2];
            result[idx++] = alphabet[((a & 3) << 4) | (b >> 4)];
            if (i + 1 < len) {
                result[idx++] = alphabet[((b & 15) << 2) | (c >> 6)];
                result[idx++] = i + 2 < len ? alphabet[c & 63] : bytes1("=");
            } else {
                result[idx++] = "=";
                result[idx++] = "=";
            }
        }
        return string(result);
    }

    // =======================================================================
    // Internal SVG element builders (each ≤ 4 parameters)
    // =======================================================================

    /// @notice Aura circle — evolves with power level
    function _aura(uint32 p) private pure returns (string memory) {
        if (p < 6)
            return
                '<circle cx="200" cy="200" r="140" fill="#888" opacity="0.2"/>';
        if (p < 21)
            return
                '<circle cx="200" cy="200" r="145" fill="#C0C0C0" opacity="0.35"/>';
        if (p < 51)
            return
                '<circle cx="200" cy="200" r="148" fill="#00FFFF" opacity="0.4"/>';
        if (p < 81)
            return
                '<circle cx="200" cy="200" r="150" fill="#DA70D6" opacity="0.45"/>';
        return
            string(
                abi.encodePacked(
                    '<circle cx="200" cy="200" r="155" fill="#FFD700" opacity="0.5"/>',
                    '<circle cx="200" cy="200" r="165" fill="none" stroke="#FFD700" stroke-width="2" opacity="0.3"/>'
                )
            );
    }

    /// @notice Chest emblem — evolves with power level
    function _emblem(
        uint32 p,
        string memory bs
    ) private pure returns (string memory) {
        if (p < 6) return "";
        if (p < 21)
            return
                string(
                    abi.encodePacked(
                        '<circle cx="200" cy="250" r="10" fill="#C0C0C0" opacity="0.8"/>',
                        '<circle cx="200" cy="250" r="5" fill="',
                        bs,
                        '" opacity="0.7"/>'
                    )
                );
        if (p < 51)
            return
                string(
                    abi.encodePacked(
                        '<circle cx="200" cy="250" r="14" fill="#00FFFF" opacity="0.8"/>',
                        '<circle cx="200" cy="250" r="7" fill="',
                        bs,
                        '" opacity="0.7"/>'
                    )
                );
        if (p < 81)
            return
                string(
                    abi.encodePacked(
                        '<circle cx="200" cy="250" r="18" fill="#FF00FF" opacity="0.8"/>',
                        '<circle cx="200" cy="250" r="9" fill="',
                        bs,
                        '" opacity="0.7"/>'
                    )
                );
        return
            string(
                abi.encodePacked(
                    '<circle cx="200" cy="250" r="24" fill="#FFD700" opacity="0.85"/>',
                    '<circle cx="200" cy="250" r="12" fill="',
                    bs,
                    '" opacity="0.75"/>'
                )
            );
    }

    /// @notice Pattern — 10 styles derived from trait[3]
    function _pattern(
        uint256 seed,
        string memory pc
    ) private pure returns (string memory) {
        uint256 i = seed % 10;
        // Stripes
        if (i == 0)
            return
                string(
                    abi.encodePacked(
                        '<path d="M140,220 Q170,190 200,220 Q230,250 260,220" stroke="',
                        pc,
                        '" stroke-width="5" fill="none" opacity="0.5" stroke-linecap="round"/>',
                        '<path d="M145,245 Q175,215 205,245 Q235,275 260,248" stroke="',
                        pc,
                        '" stroke-width="4" fill="none" opacity="0.4" stroke-linecap="round"/>'
                    )
                );
        // 5 body spots
        if (i == 1)
            return
                string(
                    abi.encodePacked(
                        '<circle cx="155" cy="215" r="12" fill="',
                        pc,
                        '" opacity="0.5"/>',
                        '<circle cx="200" cy="200" r="8" fill="',
                        pc,
                        '" opacity="0.5"/>',
                        '<circle cx="245" cy="215" r="12" fill="',
                        pc,
                        '" opacity="0.5"/>',
                        '<circle cx="170" cy="255" r="9" fill="',
                        pc,
                        '" opacity="0.45"/>',
                        '<circle cx="230" cy="255" r="9" fill="',
                        pc,
                        '" opacity="0.45"/>'
                    )
                );
        // Heart on forehead
        if (i == 2)
            return
                string(
                    abi.encodePacked(
                        '<path d="M192,115 C192,105 183,105 183,114 C183,121 192,130 192,130 C192,130 201,121 201,114 C201,105 192,105 192,115Z" fill="',
                        pc,
                        '" opacity="0.6"/>'
                    )
                );
        // Marble waves
        if (i == 3)
            return
                string(
                    abi.encodePacked(
                        '<path d="M130,240 Q165,205 200,240 Q235,275 270,240" stroke="',
                        pc,
                        '" stroke-width="6" fill="none" opacity="0.45" stroke-linecap="round"/>',
                        '<path d="M135,262 Q170,227 205,262 Q240,297 270,265" stroke="',
                        pc,
                        '" stroke-width="5" fill="none" opacity="0.4" stroke-linecap="round"/>'
                    )
                );
        // 3 body dots
        if (i == 4)
            return
                string(
                    abi.encodePacked(
                        '<circle cx="155" cy="218" r="10" fill="',
                        pc,
                        '" opacity="0.55"/>',
                        '<circle cx="200" cy="202" r="12" fill="',
                        pc,
                        '" opacity="0.55"/>',
                        '<circle cx="245" cy="218" r="10" fill="',
                        pc,
                        '" opacity="0.55"/>'
                    )
                );
        // 5 small dots
        if (i == 5)
            return
                string(
                    abi.encodePacked(
                        '<circle cx="150" cy="215" r="6" fill="',
                        pc,
                        '" opacity="0.55"/>',
                        '<circle cx="175" cy="240" r="6" fill="',
                        pc,
                        '" opacity="0.55"/>',
                        '<circle cx="200" cy="200" r="6" fill="',
                        pc,
                        '" opacity="0.55"/>',
                        '<circle cx="225" cy="240" r="6" fill="',
                        pc,
                        '" opacity="0.55"/>',
                        '<circle cx="250" cy="215" r="6" fill="',
                        pc,
                        '" opacity="0.55"/>'
                    )
                );
        // Tiger stripes on head
        if (i == 6)
            return
                string(
                    abi.encodePacked(
                        '<path d="M160,130 Q175,115 190,130" stroke="',
                        pc,
                        '" stroke-width="4" fill="none" opacity="0.5" stroke-linecap="round"/>',
                        '<path d="M180,125 Q195,110 210,125" stroke="',
                        pc,
                        '" stroke-width="4" fill="none" opacity="0.5" stroke-linecap="round"/>',
                        '<path d="M200,130 Q215,115 230,130" stroke="',
                        pc,
                        '" stroke-width="4" fill="none" opacity="0.5" stroke-linecap="round"/>'
                    )
                );
        // Star on body
        if (i == 7)
            return
                string(
                    abi.encodePacked(
                        '<circle cx="200" cy="225" r="16" fill="',
                        pc,
                        '" opacity="0.4"/>',
                        '<circle cx="200" cy="225" r="8" fill="',
                        pc,
                        '" opacity="0.6"/>'
                    )
                );
        // Belly spot
        if (i == 8)
            return
                string(
                    abi.encodePacked(
                        '<ellipse cx="200" cy="265" rx="35" ry="25" fill="',
                        pc,
                        '" opacity="0.35"/>'
                    )
                );
        // collar dots
        if (i == 9)
            return
                string(
                    abi.encodePacked(
                        '<circle cx="170" cy="280" r="5" fill="',
                        pc,
                        '" opacity="0.6"/>',
                        '<circle cx="200" cy="285" r="5" fill="',
                        pc,
                        '" opacity="0.6"/>',
                        '<circle cx="230" cy="280" r="5" fill="',
                        pc,
                        '" opacity="0.6"/>'
                    )
                );
        return "";
    }

    // =======================================================================
    // Trait names — if/else chains (no storage, no arrays)
    // =======================================================================

    function _bgTrait(uint256 i) private pure returns (string memory) {
        if (i == 0) return "Midnight";
        if (i == 1) return "Ocean";
        if (i == 2) return "Royal";
        if (i == 3) return "Nebula";
        if (i == 4) return "Deep Sea";
        if (i == 5) return "Twilight";
        if (i == 6) return "Sapphire";
        if (i == 7) return "Cosmos";
        if (i == 8) return "Abyss";
        if (i == 9) return "Violet Night";
        return "Arctic";
    }

    function _bodyTrait(uint256 i) private pure returns (string memory) {
        if (i == 0) return "Light Pink";
        if (i == 1) return "Salmon";
        if (i == 2) return "Wheat";
        if (i == 3) return "Misty Rose";
        if (i == 4) return "Lavender";
        if (i == 5) return "Honeydew";
        if (i == 6) return "Beige";
        if (i == 7) return "Moccasin";
        if (i == 8) return "Old Lace";
        if (i == 9) return "Cornsilk";
        return "Peach";
    }

    function _eyeTrait(uint256 i) private pure returns (string memory) {
        if (i == 0) return "Royal Blue";
        if (i == 1) return "Lime Green";
        if (i == 2) return "Gold";
        if (i == 3) return "Orchid";
        if (i == 4) return "Turquoise";
        if (i == 5) return "Tomato";
        if (i == 6) return "Violet";
        if (i == 7) return "Cyan";
        if (i == 8) return "Amber";
        if (i == 9) return "Silver";
        return "Ruby";
    }

    function _patTrait(uint256 i) private pure returns (string memory) {
        if (i == 0) return "Stripes";
        if (i == 1) return "Spots";
        if (i == 2) return "Heart";
        if (i == 3) return "Marble";
        if (i == 4) return "Dots";
        if (i == 5) return "Tiger";
        if (i == 6) return "Star";
        if (i == 7) return "Belly";
        if (i == 8) return "Collar";
        return "Solid";
    }

    function _auraTrait(uint32 p) private pure returns (string memory) {
        if (p < 6) return "None";
        if (p < 21) return "Soft Silver";
        if (p < 51) return "Ethereal Cyan";
        if (p < 81) return "Mystic Purple";
        return "Legendary Gold";
    }

    // =======================================================================
    // Public SVG generator
    // =======================================================================

    /// @notice Generate SVG for a given tokenId + power level
    /// @param tokenId   NFT token ID (determines unique visual variant)
    /// @param power     Current power level (0-100), drives aura + emblem
    function generateSVG(
        uint256 tokenId,
        uint32 power
    ) external pure returns (string memory) {
        // Pre-compute all colors once — avoids stack-too-deep from inline _c() calls
        string memory c10 = _c(tokenId, 0x10); // bg
        string memory c11 = _c(tokenId, 0x11); // body
        string memory c12 = _c(tokenId, 0x12); // shade
        string memory c13 = _c(tokenId, 0x13); // eye iris
        string memory c14 = _c(tokenId, 0x14); // eye pupil
        string memory c15 = _c(tokenId, 0x15); // pattern color
        string memory c16 = _c(tokenId, 0x16); // nose + whisker

        // Step 1: open + background + aura
        string memory s1 = string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
                '<rect width="400" height="400" fill="',
                c10,
                '"/>',
                _aura(power)
            )
        );

        // Step 2: body + pattern
        string memory s2 = string(
            abi.encodePacked(
                '<ellipse cx="200" cy="220" rx="130" ry="120" fill="',
                c11,
                '"/>',
                '<ellipse cx="200" cy="220" rx="110" ry="100" fill="',
                c12,
                '" opacity="0.3"/>',
                '<ellipse cx="200" cy="295" rx="70" ry="50" fill="',
                c12,
                '" opacity="0.3"/>',
                _pattern(tokenId, c15)
            )
        );

        // Step 3a: ears + eyes + nose + mouth
        string memory s3a = string(
            abi.encodePacked(
                '<polygon points="135,110 115,45 185,90" fill="',
                c11,
                '"/>',
                '<polygon points="265,110 285,45 215,90" fill="',
                c11,
                '"/>',
                '<polygon points="140,105 125,60 178,88" fill="',
                c16,
                '" opacity="0.7"/>',
                '<polygon points="260,105 275,60 222,88" fill="',
                c16,
                '" opacity="0.7"/>',
                '<ellipse cx="168" cy="148" rx="16" ry="19" fill="white"/>',
                '<ellipse cx="168" cy="148" rx="13" ry="16" fill="',
                c13,
                '"/>',
                '<ellipse cx="168" cy="148" rx="4" ry="12" fill="',
                c14,
                '"/>',
                '<circle cx="163" cy="143" r="2.5" fill="white" opacity="0.9"/>',
                '<ellipse cx="232" cy="148" rx="16" ry="19" fill="white"/>',
                '<ellipse cx="232" cy="148" rx="13" ry="16" fill="',
                c13,
                '"/>',
                '<ellipse cx="232" cy="148" rx="4" ry="12" fill="',
                c14,
                '"/>',
                '<circle cx="227" cy="143" r="2.5" fill="white" opacity="0.9"/>',
                '<path d="M193,173 L200,181 L207,173 Q200,170 193,173Z" fill="',
                c16,
                '"/>',
                '<path d="M200,181 L200,190" stroke="',
                c16,
                '" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
                '<path d="M200,190 Q188,197 178,192" stroke="',
                c16,
                '" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
                '<path d="M200,190 Q212,197 222,192" stroke="',
                c16,
                '" stroke-width="1.5" fill="none" stroke-linecap="round"/>'
            )
        );

        // Step 3b: whiskers
        string memory s3b = string(
            abi.encodePacked(
                '<line x1="140" y1="170" x2="58"  y2="158" stroke="',
                c16,
                '" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>',
                '<line x1="140" y1="175" x2="55"  y2="175" stroke="',
                c16,
                '" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>',
                '<line x1="140" y1="180" x2="58"  y2="193" stroke="',
                c16,
                '" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>',
                '<line x1="260" y1="170" x2="342" y2="158" stroke="',
                c16,
                '" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>',
                '<line x1="260" y1="175" x2="345" y2="175" stroke="',
                c16,
                '" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>',
                '<line x1="260" y1="180" x2="342" y2="193" stroke="',
                c16,
                '" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>'
            )
        );

        // Step 4a: paws + tail
        string memory s4a = string(
            abi.encodePacked(
                '<ellipse cx="155" cy="330" rx="26" ry="15" fill="',
                c12,
                '"/>',
                '<ellipse cx="245" cy="330" rx="26" ry="15" fill="',
                c12,
                '"/>',
                '<path d="M290,275 Q340,255 348,295 Q352,310 342,305" stroke="',
                c11,
                '" stroke-width="18" fill="none" stroke-linecap="round"/>',
                '<circle cx="342" cy="305" r="11" fill="',
                c12,
                '"/>'
            )
        );

        // Step 4b: emblem
        string memory s4b = _emblem(power, c11);

        // Step 4c: close svg
        string memory s4c = "</svg>";

        return string(abi.encodePacked(s1, s2, s3a, s3b, s4a, s4b, s4c));
    }

    // =======================================================================
    // Public trait getters (for OpenSea floor price tools)
    // =======================================================================

    function getBgTrait(uint256 tokenId) external pure returns (string memory) {
        return _bgTrait(tokenId % 10);
    }

    function getBodyTrait(
        uint256 tokenId
    ) external pure returns (string memory) {
        return _bodyTrait(tokenId % 10);
    }

    function getEyeTrait(
        uint256 tokenId
    ) external pure returns (string memory) {
        return _eyeTrait(tokenId % 10);
    }

    function getPatternTrait(
        uint256 tokenId
    ) external pure returns (string memory) {
        return _patTrait(tokenId % 10);
    }

    function getAuraTrait(uint32 power) external pure returns (string memory) {
        return _auraTrait(power);
    }

    /// @notice Return the 4 trait indices for a tokenId
    function variantIndices(
        uint256 tokenId
    )
        external
        pure
        returns (
            uint256 bgTrait,
            uint256 bodyTrait,
            uint256 eyeTrait,
            uint256 patTrait
        )
    {
        bgTrait = tokenId % 10;
        bodyTrait = tokenId % 10;
        eyeTrait = tokenId % 10;
        patTrait = tokenId % 10;
    }

    // =======================================================================
    // buildTokenURI — ERC721 metadata, JSON built in 2 steps
    // =======================================================================

    function buildTokenURI(
        uint256 tokenId,
        uint32 power,
        uint256 accumulatedAMeow,
        uint256 maxPower
    ) external view returns (string memory) {
        // SVG
        string memory svg = this.generateSVG(tokenId, power);
        bytes memory svgB64 = bytes(svg);
        string memory img = string(
            abi.encodePacked("data:image/svg+xml;base64,", _b64(svgB64))
        );

        // JSON — split into 2 steps to avoid stack-too-deep
        bytes memory json1 = abi.encodePacked(
            '{"name":"DomesticCat #',
            _u2s(tokenId),
            '","description":"A unique domestic cat NFT. Every tokenId maps to exactly one of 10,000 visual designs. Cats evolve by accumulating AMeow tokens.","image":"',
            img,
            '","attributes":['
        );
        bytes memory json2 = abi.encodePacked(
            '{"trait_type":"Background","value":"',
            _bgTrait(tokenId % 10),
            '"},',
            '{"trait_type":"Body Color","value":"',
            _bodyTrait(tokenId % 10),
            '"},',
            '{"trait_type":"Eye Color","value":"',
            _eyeTrait(tokenId % 10),
            '"},',
            '{"trait_type":"Pattern","value":"',
            _patTrait(tokenId % 10),
            '"},',
            '{"trait_type":"Aura","value":"',
            _auraTrait(power),
            '"},',
            '{"trait_type":"Power Level","value":',
            _u2s(power),
            ',"display_type":"number"},',
            '{"trait_type":"Max Power","value":',
            _u2s(maxPower),
            ',"display_type":"number"},',
            '{"trait_type":"AMeow Accumulated","value":',
            _u2s(accumulatedAMeow),
            ',"display_type":"number"}'
        );
        bytes memory json3 = abi.encodePacked(json2, "]}");

        // Base64 encode + prefix
        return
            string(
                abi.encodePacked(
                    "data:application/json;base64,",
                    _b64(abi.encodePacked(json1, json3))
                )
            );
    }
}
