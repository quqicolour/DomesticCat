// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title CatSVGRegistry
 * @notice SVG renderer for DomesticCat NFTs. Optimized for bytecode size.
 *         All color data in memory arrays inside pure/view functions.
 *         DomesticCatNFT stays below EIP-170 (24576 bytes).
 *
 * Visual system (deterministic from tokenId):
 *   bgIdx   = tokenId % 12
 *   bodyIdx = tokenId % 16
 *   eyeIdx  = tokenId % 12
 *   patIdx  = tokenId % 7
 *   Aura (0-100) evolves with AMeow accumulation
 */
contract CatSVGRegistry {

    // =====================================================================
    // Color palettes — string memory arrays
    // =====================================================================

    string[12] private _bg1 = [
        "#1a1a3e","#0f2027","#2c003e","#1b1b2f","#0d1b2a","#1a0033",
        "#0b1e3d","#1c1c40","#0a1628","#2d1b3d","#111d35","#0e2038"
    ];
    string[12] private _bg2 = [
        "#0d0d2b","#203a45","#1a0a2e","#1a1a35","#0a1622","#1a0030",
        "#0a1428","#1a1a30","#070f1e","#2d1b35","#0e1e38","#0a1a2e"
    ];
    string[12] private _eyeIris = [
        "#4169E1","#32CD32","#FFD700","#9370DB",
        "#20B2AA","#FF6347","#48D1CC","#BA55D3",
        "#00CED1","#FF8C00","#7B68EE","#00FA9A"
    ];
    string[12] private _eyePupil = [
        "#191970","#006400","#8B6914","#4B0082",
        "#005050","#8B0000","#005555","#4B0080",
        "#005050","#8B4500","#3a0070","#005040"
    ];

    // =====================================================================
    // Pure utilities
    // =====================================================================

    function _u2s(uint256 n) private pure returns (string memory) {
        if (n == 0) return "0";
        uint256 len;
        uint256 tmp = n;
        while (tmp != 0) { len++; tmp /= 10; }
        bytes memory b = new bytes(len);
        for (uint256 i = len; i > 0; i--) {
            b[i - 1] = bytes1(uint8(48 + n % 10));
            n /= 10;
        }
        return string(b);
    }

    // Derive color from seed+tag via keccak256 — pure math, always deterministic
    function _c(uint256 seed, uint256 tag) private pure returns (string memory) {
        bytes32 h = keccak256(abi.encodePacked(seed, tag));
        uint256 r = (uint8(h[0]) * 205 >> 8) + 50;
        uint256 g = (uint8(h[1]) * 205 >> 8) + 50;
        uint256 b = (uint8(h[2]) * 205 >> 8) + 50;
        bytes memory hx = new bytes(7);
        hx[0] = "#";
        uint256 v;
        v = r; hx[6] = bytes1(uint8(48 + v % 10)); v /= 10; hx[5] = bytes1(uint8(48 + v % 10)); v /= 10; hx[4] = bytes1(uint8(48 + v));
        v = g; hx[3] = bytes1(uint8(48 + v % 10)); v /= 10; hx[2] = bytes1(uint8(48 + v % 10)); v /= 10; hx[1] = bytes1(uint8(48 + v));
        return string(hx);
    }

    function _base64Encode(bytes memory data) private pure returns (string memory) {
        if (data.length == 0) return "";
        bytes memory alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        bytes memory result = new bytes((data.length + 2) / 3 * 4);
        uint256 idx;
        for (uint256 i = 0; i < data.length; i += 3) {
            uint256 a = uint8(data[i]);
            uint256 b = i + 1 < data.length ? uint8(data[i + 1]) : 0;
            uint256 c = i + 2 < data.length ? uint8(data[i + 2]) : 0;
            result[idx++] = alphabet[a >> 2];
            result[idx++] = alphabet[((a & 3) << 4) | (b >> 4)];
            if (i + 1 < data.length) {
                result[idx++] = alphabet[((b & 15) << 2) | (c >> 6)];
                result[idx++] = alphabet[c & 63];
            } else {
                result[idx++] = "=";
                result[idx++] = "=";
            }
        }
        return string(result);
    }

    // =====================================================================
    // Internal SVG builders
    // =====================================================================

    function _eye(string memory cx, string memory cy, string memory iris, string memory pupil)
        private pure returns (string memory)
    {
        return string(
            abi.encodePacked(
                '<ellipse cx="', cx, '" cy="', cy, '" rx="17" ry="20" fill="white"/>',
                '<ellipse cx="', cx, '" cy="', cy, '" rx="14" ry="17" fill="', iris, '"/>',
                '<ellipse cx="', cx, '" cy="', cy, '" rx="4" ry="13" fill="', pupil, '"/>',
                '<circle  cx="', cx, '" cy="', cy, '" r="2.5" fill="white" opacity="0.9"/>'
            )
        );
    }

    function _aura(uint32 p) private pure returns (string memory) {
        if (p < 6)  return "";
        if (p < 21) return '<circle cx="200" cy="205" r="150" fill="#D8D8D8" opacity="0.3"/>';
        if (p < 51) return '<circle cx="200" cy="205" r="150" fill="#00FFFF" opacity="0.35"/>';
        if (p < 81) return '<circle cx="200" cy="205" r="150" fill="#DA70D6" opacity="0.4"/>';
        return string(
            abi.encodePacked(
                '<circle cx="200" cy="205" r="150" fill="#FFD700" opacity="0.55"/>',
                '<circle cx="200" cy="205" r="160" fill="none" stroke="#FFD700" stroke-width="2" opacity="0.3"/>',
                '<circle cx="200" cy="205" r="168" fill="none" stroke="#FFFACD" stroke-width="1" opacity="0.2"/>'
            )
        );
    }

    function _tail(uint256 seed, string memory bc, string memory bs) private pure returns (string memory) {
        uint256 crv = 35 + (seed % 50);
        uint256 th  = 18 - (seed % 6);
        uint256 tip = crv - 25;
        return string(
            abi.encodePacked(
                '<path d="M295,265 Q340,240 350,', _u2s(crv),
                ' Q355,', _u2s(crv - 15), ' 345,', _u2s(tip),
                '" stroke="', bc, '" stroke-width="', _u2s(th),
                '" fill="none" stroke-linecap="round"/>',
                '<circle cx="345" cy="', _u2s(tip),
                '" r="', _u2s(th / 2 + 2), '" fill="', bs, '"/>'
            )
        );
    }

    function _emblem(uint32 p, string memory bs) private pure returns (string memory) {
        if (p < 6) return "";
        if (p < 21) return string(abi.encodePacked('<circle cx="200" cy="238" r="8"  fill="#C0C0C0" opacity="0.75"/><circle cx="200" cy="238" r="4"  fill="', bs, '" opacity="0.6"/>'));
        if (p < 51) return string(abi.encodePacked('<circle cx="200" cy="238" r="12" fill="#00FFFF" opacity="0.75"/><circle cx="200" cy="238" r="6"  fill="', bs, '" opacity="0.6"/>'));
        if (p < 81) return string(abi.encodePacked('<circle cx="200" cy="238" r="16" fill="#FF00FF" opacity="0.75"/><circle cx="200" cy="238" r="8"  fill="', bs, '" opacity="0.6"/>'));
        return string(abi.encodePacked('<circle cx="200" cy="238" r="22" fill="#FFD700" opacity="0.75"/><circle cx="200" cy="238" r="11" fill="', bs, '" opacity="0.6"/>'));
    }

    function _pattern(uint256 tid, string memory pc) private pure returns (string memory) {
        uint256 i = tid % 7;
        if (i == 0) return string(abi.encodePacked(
            '<path d="M155,215 Q165,195 175,215 Q185,195 195,215" stroke="', pc, '" stroke-width="4" fill="none" opacity="0.55" stroke-linecap="round"/>',
            '<path d="M170,235 Q180,212 190,235 Q200,212 210,235" stroke="', pc, '" stroke-width="4" fill="none" opacity="0.55" stroke-linecap="round"/>',
            '<path d="M185,255 Q195,232 205,255 Q215,232 225,255" stroke="', pc, '" stroke-width="4" fill="none" opacity="0.55" stroke-linecap="round"/>'
        ));
        if (i == 1) return string(abi.encodePacked(
            '<circle cx="160" cy="230" r="14" fill="', pc, '" opacity="0.45"/>',
            '<circle cx="200" cy="215" r="10" fill="', pc, '" opacity="0.45"/>',
            '<circle cx="240" cy="230" r="14" fill="', pc, '" opacity="0.45"/>',
            '<circle cx="180" cy="260" r="9"  fill="', pc, '" opacity="0.45"/>',
            '<circle cx="222" cy="258" r="11" fill="', pc, '" opacity="0.45"/>'
        ));
        if (i == 2) return string(abi.encodePacked(
            '<path d="M192,105 C192,97 183,97 183,106 C183,113 192,120 192,120 C192,120 201,113 201,106 C201,97 192,97 192,105Z" fill="', pc, '" opacity="0.5"/>'
        ));
        if (i == 3) return string(abi.encodePacked(
            '<path d="M145,240 Q175,210 200,240 Q225,270 255,240" stroke="', pc, '" stroke-width="5" fill="none" opacity="0.45" stroke-linecap="round"/>',
            '<path d="M150,260 Q180,235 205,260 Q230,285 255,258" stroke="', pc, '" stroke-width="4" fill="none" opacity="0.4" stroke-linecap="round"/>'
        ));
        if (i == 4) return string(abi.encodePacked(
            '<circle cx="155" cy="220" r="7" fill="', pc, '" opacity="0.6"/>',
            '<circle cx="200" cy="205" r="9" fill="', pc, '" opacity="0.6"/>',
            '<circle cx="245" cy="220" r="7" fill="', pc, '" opacity="0.6"/>'
        ));
        if (i == 5) return string(abi.encodePacked(
            '<circle cx="155" cy="220" r="6" fill="', pc, '" opacity="0.5"/>',
            '<circle cx="200" cy="208" r="6" fill="', pc, '" opacity="0.5"/>',
            '<circle cx="245" cy="220" r="6" fill="', pc, '" opacity="0.5"/>',
            '<circle cx="170" cy="255" r="5" fill="', pc, '" opacity="0.45"/>',
            '<circle cx="230" cy="255" r="5" fill="', pc, '" opacity="0.45"/>'
        ));
        return "";
    }

    function _stars(uint256 seed) private pure returns (string memory) {
        uint256 cnt = 4 + (seed % 7);
        bytes memory parts = new bytes(0);
        for (uint256 i = 0; i < cnt; i++) {
            uint256 sx = 20  + ((seed * (i + 3) * 7) % 360);
            uint256 sy = 15  + ((seed * (i + 5) * 11) % 370);
            uint256 sr = 1   + ((seed * (i + 2)) % 3);
            uint256 op = 30  + ((seed * (i + 7)) % 50);
            parts = abi.encodePacked(parts,
                '<circle cx="', _u2s(sx), '" cy="', _u2s(sy),
                '" r="', _u2s(sr), '" fill="white" opacity="0.', _u2s(op), '"/>');
        }
        return string(parts);
    }

    // =====================================================================
    // Trait name arrays — if/else chains (smaller than arrays for names)
    // =====================================================================

    function _bgTrait(uint256 i) private pure returns (string memory) {
        if (i < 4)  { if (i < 2) { if (i == 0) return "Midnight"; return "Ocean";      } if (i == 2) return "Royal";    return "Nebula";    }
        if (i < 8)  { if (i < 6) { if (i == 4) return "Deep Sea";  return "Twilight";   } if (i == 6) return "Sapphire"; return "Cosmos";    }
        if (i < 10) { if (i == 8) return "Abyss";       return "Violet Night"; }
                         if (i == 10) return "Steel";    return "Arctic";
    }

    function _bodyTrait(uint256 i) private pure returns (string memory) {
        if (i < 4)  { if (i < 2) { if (i == 0) return "Light Pink";    return "Light Salmon";  } if (i == 2) return "Navajo White"; return "Wheat";      }
        if (i < 8)  { if (i < 6) { if (i == 4) return "Misty Rose";    return "Papaya Whip";   } if (i == 6) return "Lavender Blush"; return "Linen";    }
        if (i < 12) { if (i < 10){ if (i == 8) return "Lavender";      return "Honeydew";      } return "Beige";  }
        if (i < 14) { if (i == 12) return "Moccasin";  return "Old Lace";  }
                         if (i == 14) return "Cornsilk"; return "Pink";
    }

    function _eyeTrait(uint256 i) private pure returns (string memory) {
        if (i < 4)  { if (i < 2) { if (i == 0) return "Royal Blue";            return "Lime Green";        } if (i == 2) return "Gold";               return "Medium Purple";    }
        if (i < 8)  { if (i < 6) { if (i == 4) return "Light Sea Green";       return "Tomato";            } if (i == 6) return "Medium Turquoise";  return "Orchid";            }
        if (i < 10) { if (i == 8) return "Dark Turquoise";       return "Dark Orange";         }
                         if (i == 10) return "Medium Slate Blue"; return "Medium Spring Green";
    }

    function _patTrait(uint256 i) private pure returns (string memory) {
        if (i < 2)  { if (i == 0) return "Tiger Stripes"; return "Spotted";      }
        if (i < 4)  { if (i == 2) return "Heart Mark";    return "Marble Swirls";}
        if (i < 6)  { if (i == 4) return "Star Marked";   return "Dotted";       }
        return "Solid";
    }

    function _auraTrait(uint32 p) private pure returns (string memory) {
        if (p < 6)  return "None";
        if (p < 21) return "Soft Silver";
        if (p < 51) return "Ethereal Cyan";
        if (p < 81) return "Mystic Purple";
        return "Legendary Gold";
    }

    // =====================================================================
    // Public SVG generator — view to allow memory arrays
    // =====================================================================

    function generateSVG(
        uint256 tokenId,
        uint256 /* bgIdx */,
        uint256 /* bodyIdx */,
        uint256 /* eyeIdx */,
        uint256 /* patIdx */,
        uint32  power
    ) public view returns (string memory) {
        uint256 ti = tokenId;

        string memory bg1col = _bg1[ti % 12];
        string memory bg2col = _bg2[ti % 12];
        string memory bc    = _c(ti, 0x10);
        string memory bs    = _c(ti, 0x11);
        string memory ie    = _c(ti, 0x12);
        string memory ei    = _eyeIris[ti % 12];
        string memory ep    = _eyePupil[ti % 12];
        string memory nc    = _c(ti, 0x30);
        string memory wc    = _c(ti, 0x31);
        string memory pc    = _c(ti, 0x40);

        return string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
                '<rect width="400" height="400" fill="', bg1col, '"/>',
                '<rect width="400" height="400" fill="', bg2col, '" opacity="0.6"/>',
                _aura(power),
                '<ellipse cx="200" cy="205" r="150" fill="', bc, '"/>',
                '<ellipse cx="200" cy="205" rx="130" ry="130" fill="', bs, '" opacity="0.25"/>',
                _pattern(ti, pc),
                '<ellipse cx="200" cy="285" rx="75" ry="55" fill="', bs, '" opacity="0.3"/>',
                '<ellipse cx="148" cy="325" rx="28" ry="16" fill="', bs, '"/>',
                '<ellipse cx="252" cy="325" rx="28" ry="16" fill="', bs, '"/>',
                _tail(ti, bc, bs),
                '<circle cx="200" cy="158" r="76" fill="', bc, '"/>',
                '<circle cx="175" cy="130" r="38" fill="', bc, '" opacity="0.4"/>',
                '<polygon points="138,105 118,42 188,85" fill="', bc, '"/>',
                '<polygon points="262,105 282,42 212,85" fill="', bc, '"/>',
                '<polygon points="140,100 126,56 182,85" fill="', ie, '"/>',
                '<polygon points="260,100 274,56 218,85" fill="', ie, '"/>',
                _eye("168","145", ei, ep),
                _eye("232","145", ei, ep),
                '<path d="M192,172 L200,180 L208,172 Q200,168 192,172Z" fill="', nc, '"/>',
                '<path d="M200,180 L200,188" stroke="', wc, '" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
                '<path d="M200,188 Q188,195 180,190" stroke="', wc, '" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
                '<path d="M200,188 Q212,195 220,190" stroke="', wc, '" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
                '<line x1="140" y1="168" x2="58"  y2="155" stroke="', wc, '" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>',
                '<line x1="140" y1="173" x2="55"  y2="173" stroke="', wc, '" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>',
                '<line x1="140" y1="178" x2="58"  y2="192" stroke="', wc, '" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>',
                '<line x1="260" y1="168" x2="342" y2="155" stroke="', wc, '" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>',
                '<line x1="260" y1="173" x2="345" y2="173" stroke="', wc, '" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>',
                '<line x1="260" y1="178" x2="342" y2="192" stroke="', wc, '" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>',
                _emblem(power, bs),
                _stars(ti),
                '</svg>'
            )
        );
    }

    // =====================================================================
    // Public trait getters
    // =====================================================================

    function getBgTrait(uint256 tokenId) external view returns (string memory) {
        return _bgTrait(tokenId % 12);
    }
    function getBodyTrait(uint256 tokenId) external view returns (string memory) {
        return _bodyTrait(tokenId % 16);
    }
    function getEyeTrait(uint256 tokenId) external view returns (string memory) {
        return _eyeTrait(tokenId % 12);
    }
    function getPatternTrait(uint256 tokenId) external view returns (string memory) {
        return _patTrait(tokenId % 7);
    }
    function getAuraTrait(uint32 power) external pure returns (string memory) {
        return _auraTrait(power);
    }

    function variantIndices(uint256 tokenId) external pure returns (
        uint256 bgIdx, uint256 bodyIdx, uint256 eyeIdx, uint256 patIdx
    ) {
        bgIdx   = tokenId % 12;
        bodyIdx = tokenId % 16;
        eyeIdx  = tokenId % 12;
        patIdx  = tokenId % 7;
    }

    // =====================================================================
    // buildTokenURI
    // =====================================================================

    function buildTokenURI(
        uint256 tokenId,
        uint32  power,
        uint256 accumulatedAMeow,
        uint256 maxPower
    ) external view returns (string memory) {
        uint256 ti = tokenId;
        uint256 bgIdx   = ti % 12;
        uint256 bodyIdx = ti % 16;
        uint256 eyeIdx  = ti % 12;
        uint256 patIdx  = ti % 7;

        string memory svg = this.generateSVG(ti, bgIdx, bodyIdx, eyeIdx, patIdx, power);

        string memory json = string(
            abi.encodePacked(
                '{"name":"DomesticCat #', _u2s(ti),
                '","description":"A unique domestic cat NFT. Provably determined by token ID. Cats evolve by accumulating AMeow tokens.",',
                '"image":"data:image/svg+xml;base64,',
                _base64Encode(bytes(svg)),
                '","attributes":['
                '{"trait_type":"Background","value":"', _bgTrait(bgIdx), '"},',
                '{"trait_type":"Body Color","value":"', _bodyTrait(bodyIdx), '"},',
                '{"trait_type":"Eye Color","value":"', _eyeTrait(eyeIdx), '"},',
                '{"trait_type":"Pattern","value":"', _patTrait(patIdx), '"},',
                '{"trait_type":"Aura","value":"', _auraTrait(power), '"},',
                '{"trait_type":"Power Level","value":', _u2s(power),',"display_type":"number"},',
                '{"trait_type":"Max Power","value":', _u2s(maxPower),',"display_type":"number"},',
                '{"trait_type":"AMeow Accumulated","value":', _u2s(accumulatedAMeow),',"display_type":"number"}',
                ']}'
            )
        );
        return string(abi.encodePacked("data:application/json;base64,", _base64Encode(bytes(json))));
    }
}
