import assert from "node:assert/strict";
import hre from "hardhat";
import { decodeEventLog, parseEther, zeroAddress } from "viem";

export const ZERO_ADDRESS = zeroAddress;
export const MAX_SUPPLY = 1_000_000n * 10n ** 18n;
export const NFT_MAX_SUPPLY = 10_000n;
export const MINT_FEE = 1_000_000_000_000_000n;
export const AMEOW_PER_POWER = 10n * 10n ** 18n;

export async function getViem() {
  const connection = await hre.network.getOrCreate();
  const viem = connection.viem;
  const publicClient = await viem.getPublicClient();
  const [deployer, user, treasury, operator] = await viem.getWalletClients();

  return { connection, viem, publicClient, deployer, user, treasury, operator };
}

export async function waitForTx(hash: `0x${string}`) {
  const { publicClient } = await getViem();
  return publicClient.waitForTransactionReceipt({ hash });
}

export async function deployAMeowFixture() {
  const { viem, publicClient, deployer, user, operator } = await getViem();
  const ameow = await viem.deployContract("AMeowToken", [], {
    client: { wallet: deployer },
  });

  return { viem, publicClient, deployer, user, operator, ameow };
}

export async function deployRegistryFixture() {
  const { viem, publicClient, deployer } = await getViem();
  const registry = await viem.deployContract("CatSVGRegistry", [], {
    client: { wallet: deployer },
  });

  return { viem, publicClient, deployer, registry };
}

export async function deployDomesticCatFixture() {
  const { viem, publicClient, deployer, user, treasury, operator } = await getViem();

  const ameow = await viem.deployContract("AMeowToken", [], {
    client: { wallet: deployer },
  });
  const registry = await viem.deployContract("CatSVGRegistry", [], {
    client: { wallet: deployer },
  });
  const nft = await viem.deployContract(
    "DomesticCatNFT",
    [ameow.address, registry.address],
    { client: { wallet: deployer } },
  );

  await waitForTx(
    await ameow.write.setNFTContract([nft.address], {
      client: { wallet: deployer },
    }),
  );

  return { viem, publicClient, deployer, user, treasury, operator, ameow, registry, nft };
}

export async function getAMeowAs(address: `0x${string}`, wallet: any) {
  const { viem } = await getViem();
  return viem.getContractAt("AMeowToken", address, { client: { wallet } });
}

export async function getDomesticCatAs(address: `0x${string}`, wallet: any) {
  const { viem } = await getViem();
  return viem.getContractAt("DomesticCatNFT", address, { client: { wallet } });
}

export function decodeTokenURI(uri: string) {
  assert.ok(uri.startsWith("data:application/json;base64,"));
  const b64 = uri.replace("data:application/json;base64,", "");
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

export function decodeImageDataURI(image: string) {
  assert.ok(image.startsWith("data:image/svg+xml;base64,"));
  const b64 = image.replace("data:image/svg+xml;base64,", "");
  return Buffer.from(b64, "base64").toString("utf8");
}

export async function expectRejects(action: () => Promise<unknown>, pattern?: RegExp) {
  await assert.rejects(action, pattern ?? /.*/);
}

export function findEvent(receipt: any, abi: any, eventName: string) {
  for (const log of receipt.logs) {
    try {
      const event = decodeEventLog({
        abi,
        data: log.data,
        topics: log.topics,
      });
      if (event.eventName === eventName) return event;
    } catch {
      // Ignore logs emitted by other contracts.
    }
  }

  return undefined;
}

export { parseEther };
