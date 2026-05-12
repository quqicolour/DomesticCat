// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title CatSVGLib
 * @notice Library for on-chain SVG cat generation — all pure color/pattern helpers.
 *         Breaking this out of DomesticCatNFT reduces the main contract bytecode
 *         below the EIP-170 limit (24576 bytes).
 */
library CatSVGLib {
    // =======================================================================
    // Color palettes
    // =======================================================================

    function bgColor1(uint256 s) internal pure returns (string memory) {
        string[12] memory c = [
            "#1a1a3e","#0f2027","#2c003e","#1b1b2f","#0d1b2a","#1a0033",
            "#0b1e3d","#1c1c40","#0a1628","#2d1b3d","#111d35","#0e2038"
        ];
        return c[s % 12];
    }

    function bgColor2(uint256 s) internal pure returns (string memory) {
        string[12] memory c = [
            "#0d0d2b","#203a45","#1a0a2e","#1a1a35","#0a1622","#1a0030",
            "#0a1428","#1a1a30","#070f1e","#2d1b35","#0e1e38","#0a1a2e"
        ];
        return c[s % 12];
    }

    function bgAccent(uint256 s) internal pure returns (string memory) {
        string[12] memory c = [
            "#4a3f6b","#3a6073","#6b3a6b","#3a4a6b","#3a5a6b","#6b3a5a",
            "#3a5a7b","#4a3a6b","#2a4a6b","#6b4a3a","#3a6b5a","#4a3a5b"
        ];
        return c[s % 12];
    }

    function bodyColor(uint256 s) internal pure returns (string memory) {
        string[16] memory c = [
            "#FFB6C1","#FFA07A","#FFDAB9","#F5DEB3",
            "#FFE4E1","#FFEFD5","#FFF0F5","#FAF0E6",
            "#E6E6FA","#F0FFF0","#F5F5DC","#FFDEAD",
            "#FFE4B5","#FDF5E6","#FFF8DC","#FFCAD4"
        ];
        return c[s % 16];
    }

    function bodyShade(uint256 s) internal pure returns (string memory) {
        string[16] memory c = [
            "#E89BA5","#E88A64","#E8C2A3","#DEC099",
            "#E8CED5","#E8D9BF","#E8D9EF","#E8D8D0",
            "#D0D0E8","#D8E8D8","#D8D8C0","#E8C89B",
            "#E8CE9F","#E8D9D8","#E8E0C4","#E8B0BC"
        ];
        return c[s % 16];
    }

    function innerEar(uint256 s) internal pure returns (string memory) {
        string[8] memory c = [
            "#FFB6C1","#FFA07A","#FFDAB9","#FF9CAD",
            "#E8A0A0","#F4C2C2","#FFB0A0","#E8B8B8"
        ];
        return c[s % 8];
    }

    function eyeIris(uint256 s) internal pure returns (string memory) {
        string[12] memory c = [
            "#4169E1","#32CD32","#FFD700","#9370DB",
            "#20B2AA","#FF6347","#48D1CC","#BA55D3",
            "#00CED1","#FF8C00","#7B68EE","#00FA9A"
        ];
        return c[s % 12];
    }

    function eyePupil(uint256 s) internal pure returns (string memory) {
        string[12] memory c = [
            "#191970","#006400","#8B6914","#4B0082",
            "#005050","#8B0000","#005555","#4B0080",
            "#005050","#8B4500","#3a0070","#005040"
        ];
        return c[s % 12];
    }

    function noseColor(uint256 s) internal pure returns (string memory) {
        string[8] memory c = [
            "#FF9999","#FF7777","#FFB3B3","#FFAAAA",
            "#E88888","#FFAAAA","#FF8888","#EE9999"
        ];
        return c[s % 8];
    }

    function whiskerColor(uint256 s) internal pure returns (string memory) {
        string[8] memory c = [
            "#555","#444","#666","#3a3a3a",
            "#4a4a4a","#555","#333","#4a4a4a"
        ];
        return c[s % 8];
    }

    function patternColor(uint256 s) internal pure returns (string memory) {
        string[8] memory c = [
            "#3a3a3a","#5a3a5a","#3a5a3a","#3a3a5a",
            "#5a4a3a","#3a5a5a","#5a3a3a","#4a3a4a"
        ];
        return c[s % 8];
    }

    // =======================================================================
    // Trait name getters
    // =======================================================================

    function bgTraitName(uint256 s) internal pure returns (string memory) {
        string[12] memory names = [
            "Midnight","Ocean","Royal","Nebula",
            "Deep Sea","Twilight","Sapphire","Cosmos",
            "Abyss","Violet Night","Steel","Arctic"
        ];
        return names[s % 12];
    }

    function bodyTraitName(uint256 s) internal pure returns (string memory) {
        string[16] memory names = [
            "Light Pink","Light Salmon","Navajo White","Wheat",
            "Misty Rose","Papaya Whip","Lavender Blush","Linen",
            "Lavender","Honeydew","Beige","Burlywood",
            "Moccasin","Old Lace","Cornsilk","Pink"
        ];
        return names[s % 16];
    }

    function eyeTraitName(uint256 s) internal pure returns (string memory) {
        string[12] memory names = [
            "Royal Blue","Lime Green","Gold","Medium Purple",
            "Light Sea Green","Tomato","Medium Turquoise","Orchid",
            "Dark Turquoise","Dark Orange","Medium Slate Blue","Medium Spring Green"
        ];
        return names[s % 12];
    }

    function patternTraitName(uint256 s) internal pure returns (string memory) {
        string[7] memory names = [
            "Tiger Stripes","Spotted","Heart Mark","Marble Swirls",
            "Star Marked","Dotted","Solid"
        ];
        return names[s % 7];
    }

    function auraTraitName(uint32 power) internal pure returns (string memory) {
        if (power >= 81) return "Legendary Gold";
        if (power >= 51) return "Mystic Purple";
        if (power >= 21) return "Ethereal Cyan";
        if (power >= 6)  return "Soft Silver";
        return "None";
    }

    // =======================================================================
    // SVG element builders
    // =======================================================================

    function buildBgStars(uint256 seed) internal pure returns (string memory) {
        uint256 cnt = 4 + (seed % 7);
        bytes memory parts = new bytes(0);
        for (uint256 i = 0; i < cnt; i++) {
            uint256 sx = 20 + ((seed * (i + 3) * 7) % 360);
            uint256 sy = 15 + ((seed * (i + 5) * 11) % 370);
            uint256 sr = 1 + ((seed * (i + 2)) % 3);
            uint256 op = 30 + ((seed * (i + 7)) % 50);
            parts = abi.encodePacked(
                parts,
                '<circle cx="', _u2s(sx), '" cy="', _u2s(sy),
                '" r="', _u2s(sr), '" fill="white" opacity="0.', _u2s(op), '"/>'
            );
        }
        return string(parts);
    }

    function buildTail(uint256 seed, string memory bc, string memory bs)
        internal pure returns (string memory)
    {
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

    function buildWhiskers(string memory col) internal pure returns (string memory) {
        return string(
            abi.encodePacked(
                '<line x1="140" y1="168" x2="58"  y2="155" stroke="', col, '" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>',
                '<line x1="140" y1="173" x2="55"  y2="173" stroke="', col, '" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>',
                '<line x1="140" y1="178" x2="58"  y2="192" stroke="', col, '" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>',
                '<line x1="260" y1="168" x2="342" y2="155" stroke="', col, '" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>',
                '<line x1="260" y1="173" x2="345" y2="173" stroke="', col, '" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>',
                '<line x1="260" y1="178" x2="342" y2="192" stroke="', col, '" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>'
            )
        );
    }

    function buildEye(string memory cx, string memory cy)
        internal pure returns (string memory)
    {
        return string(
            abi.encodePacked(
                '<ellipse cx="', cx, '" cy="', cy, '" rx="17" ry="20" fill="white"/>',
                '<ellipse cx="', cx, '" cy="', cy, '" rx="14" ry="17" fill="#333"/>',
                '<ellipse cx="', cx, '" cy="', cy, '" rx="4"  ry="13" fill="black"/>',
                '<circle  cx="', cx, '" cy="', cy, '" r="2.5" fill="white" opacity="0.9"/>'
            )
        );
    }

    function buildChestEmblem(uint32 power, string memory bc, string memory bs)
        internal pure returns (string memory)
    {
        if (power <= 5) return "";

        string memory ec;
        uint256 r;
        if (power <= 20)      { ec = "#C0C0C0"; r = 8;  }
        else if (power <= 50) { ec = "#00FFFF"; r = 12; }
        else if (power <= 80) { ec = "#FF00FF"; r = 16; }
        else                   { ec = "#FFD700"; r = 22; }

        return string(
            abi.encodePacked(
                '<circle cx="200" cy="238" r="', _u2s(r),
                '" fill="', ec, '" opacity="0.75" filter="url(#glow)"/>',
                '<circle cx="200" cy="238" r="', _u2s(r / 2),
                '" fill="', bs, '" opacity="0.6"/>'
            )
        );
    }

    function buildAuraFX(uint32 power)
        internal pure returns (string memory auraSvg, string memory blurR, string memory opacity)
    {
        if (power <= 5) return ("", "0", "0");

        string memory color;
        if (power <= 20)      { color = "#D8D8D8"; blurR = "8";  opacity = "0.3";  }
        else if (power <= 50) { color = "#00FFFF"; blurR = "12"; opacity = "0.35"; }
        else if (power <= 80) { color = "#DA70D6"; blurR = "16"; opacity = "0.4";  }
        else                   { color = "#FFD700"; blurR = "20"; opacity = "0.55"; }

        string memory extra = "";
        if (power >= 81) {
            extra = string(
                abi.encodePacked(
                    '<circle cx="200" cy="205" r="155" fill="none" stroke="#FFD700" stroke-width="2" opacity="0.3"/>',
                    '<circle cx="200" cy="205" r="165" fill="none" stroke="#FFFACD" stroke-width="1" opacity="0.2"/>'
                )
            );
        }

        auraSvg = string(
            abi.encodePacked(
                '<circle cx="200" cy="205" r="150" fill="', color, '" opacity="', opacity, '"/>',
                extra
            )
        );
    }

    function buildPattern(uint256 seed, string memory pc) internal pure returns (string memory) {
        uint256 p = seed % 7;

        if (p == 0) {
            return string(
                abi.encodePacked(
                    '<path d="M155,215 Q165,195 175,215 Q185,195 195,215" stroke="', pc, '" stroke-width="4" fill="none" opacity="0.55" stroke-linecap="round"/>',
                    '<path d="M170,235 Q180,212 190,235 Q200,212 210,235" stroke="', pc, '" stroke-width="4" fill="none" opacity="0.55" stroke-linecap="round"/>',
                    '<path d="M185,255 Q195,232 205,255 Q215,232 225,255" stroke="', pc, '" stroke-width="4" fill="none" opacity="0.55" stroke-linecap="round"/>'
                )
            );
        }
        if (p == 1) {
            return string(
                abi.encodePacked(
                    '<circle cx="160" cy="230" r="14" fill="', pc, '" opacity="0.45"/>',
                    '<circle cx="200" cy="215" r="10" fill="', pc, '" opacity="0.45"/>',
                    '<circle cx="240" cy="230" r="14" fill="', pc, '" opacity="0.45"/>',
                    '<circle cx="180" cy="260" r="9"  fill="', pc, '" opacity="0.45"/>',
                    '<circle cx="222" cy="258" r="11" fill="', pc, '" opacity="0.45"/>'
                )
            );
        }
        if (p == 2) {
            return string(
                abi.encodePacked(
                    '<path d="M192,105 C192,97 183,97 183,106 C183,113 192,120 192,120 C192,120 201,113 201,106 C201,97 192,97 192,105Z" fill="', pc, '" opacity="0.5"/>'
                )
            );
        }
        if (p == 3) {
            return string(
                abi.encodePacked(
                    '<path d="M145,240 Q175,210 200,240 Q225,270 255,240" stroke="', pc, '" stroke-width="5" fill="none" opacity="0.45" stroke-linecap="round"/>',
                    '<path d="M150,260 Q180,235 205,260 Q230,285 255,258" stroke="', pc, '" stroke-width="4" fill="none" opacity="0.4" stroke-linecap="round"/>'
                )
            );
        }
        if (p == 4) {
            // Star-marked: sparkle circles at 3 body positions
            return string(
                abi.encodePacked(
                    '<circle cx="155" cy="220" r="7" fill="', pc, '" opacity="0.6"/>',
                    '<circle cx="200" cy="205" r="9" fill="', pc, '" opacity="0.6"/>',
                    '<circle cx="245" cy="220" r="7" fill="', pc, '" opacity="0.6"/>'
                )
            );
        }
        if (p == 5) {
            return string(
                abi.encodePacked(
                    '<circle cx="155" cy="220" r="6" fill="', pc, '" opacity="0.5"/>',
                    '<circle cx="200" cy="208" r="6" fill="', pc, '" opacity="0.5"/>',
                    '<circle cx="245" cy="220" r="6" fill="', pc, '" opacity="0.5"/>',
                    '<circle cx="170" cy="255" r="5" fill="', pc, '" opacity="0.45"/>',
                    '<circle cx="230" cy="255" r="5" fill="', pc, '" opacity="0.45"/>'
                )
            );
        }
        return ""; // p == 6: solid (no pattern)
    }

    // =======================================================================
    // Utility
    // =======================================================================

    /// @notice Convert uint256 to string (no library needed)
    function _u2s(uint256 n) internal pure returns (string memory) {
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
}
