import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";
import { baseSepolia } from "viem/chains";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    compilers: [
      {
        version: "0.8.28",
        settings: {
          viaIR: true,
          optimizer: { enabled: true, runs: 200 }
        }
      },
    ],
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    baseSepolia: {
      type: "http",
      chainType: "op",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },
    arcTestnet: {
      type: "http",
      chainType: "l1",
      url: configVariable("ARC_TESTNET_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    }
  },
});
