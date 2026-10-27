import { createPublicClient, createWalletClient, custom, http, parseEther, type Address, type Hash } from "viem";
import { apeChain } from "viem/chains";
import { LILY_APE_DROP_ABI, LILY_APE_DROP_BYTECODE } from "./dropArtifact";
import { PLATFORM_WALLETS } from "@/config/treasury";

/** Platform cut of every primary ApeChain mint, enforced in the contract. */
export const APECHAIN_PLATFORM_FEE_BPS = 1500;
export const APECHAIN_EXPLORER = "https://apescan.io";

const publicClient = createPublicClient({ chain: apeChain, transport: http("https://rpc.apechain.com/http") });

function getProvider(): any {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No EVM wallet found. Install MetaMask, Rabby or Phantom to use ApeChain.");
  return eth;
}

/** Ask the wallet for an account and make sure it is on ApeChain mainnet (adds it if missing). */
export async function connectApeChain(): Promise<Address> {
  const eth = getProvider();
  const [account] = (await eth.request({ method: "eth_requestAccounts" })) as Address[];
  const hexId = "0x" + apeChain.id.toString(16);
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  } catch (err: any) {
    if (err?.code !== 4902 && err?.data?.originalError?.code !== 4902) throw err;
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: hexId,
        chainName: "ApeChain",
        nativeCurrency: { name: "ApeCoin", symbol: "APE", decimals: 18 },
        rpcUrls: ["https://rpc.apechain.com/http"],
        blockExplorerUrls: [APECHAIN_EXPLORER],
      }],
    });
  }
  return account;
}

function wallet() {
  return createWalletClient({ chain: apeChain, transport: custom(getProvider()) });
}

export interface ApeDropParams {
  name: string;
  symbol: string;
  baseUri: string; // e.g. ipfs://CID/ — token N resolves to `${baseUri}N.json`
  maxSupply: number;
  priceApe: string;
  maxPerTx: number;
  royaltyBps: number;
}

export function normalizeBaseUri(uri: string): string {
  const u = uri.trim();
  return u.endsWith("/") ? u : `${u}/`;
}

export async function deployApeDrop(p: ApeDropParams): Promise<{ address: Address; hash: Hash; deployer: Address }> {
  if (!p.baseUri.trim()) throw new Error("Metadata folder link is required");
  if (p.maxSupply < 1 || p.maxSupply > 10000) throw new Error("Supply must be 1–10,000");
  const account = await connectApeChain();
  const hash = await wallet().deployContract({
    account,
    chain: apeChain,
    abi: LILY_APE_DROP_ABI,
    bytecode: LILY_APE_DROP_BYTECODE,
    args: [
      p.name,
      p.symbol,
      normalizeBaseUri(p.baseUri),
      BigInt(p.maxSupply),
      parseEther(p.priceApe || "0"),
      BigInt(Math.max(1, p.maxPerTx)),
      BigInt(Math.min(1000, Math.max(0, Math.round(p.royaltyBps)))),
      PLATFORM_WALLETS.monad.treasury as Address,
      APECHAIN_PLATFORM_FEE_BPS,
    ],
  } as any);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error("Contract deployment failed on ApeChain");
  return { address: receipt.contractAddress, hash, deployer: account };
}

export async function readApeDrop(address: Address) {
  const read = (functionName: any) => publicClient.readContract({ address, abi: LILY_APE_DROP_ABI, functionName } as any);
  const [totalSupply, maxSupply, mintPrice, maxPerTx, mintOpen] = await Promise.all([
    read("totalSupply"), read("maxSupply"), read("mintPrice"), read("maxPerTx"), read("mintOpen"),
  ]);
  return {
    totalSupply: Number(totalSupply), maxSupply: Number(maxSupply),
    mintPrice: mintPrice as bigint, maxPerTx: Number(maxPerTx), mintOpen: Boolean(mintOpen),
  };
}

/** Mint `qty` NFTs straight into the connected collector wallet. Price is read on-chain. */
export async function mintApeDrop(address: Address, qty: number): Promise<{ hash: Hash; account: Address }> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("This collection has no valid ApeChain contract");
  const account = await connectApeChain();
  const info = await readApeDrop(address);
  if (!info.mintOpen) throw new Error("Minting is paused by the creator");
  if (info.totalSupply + qty > info.maxSupply) throw new Error("Not enough NFTs left");
  if (qty > info.maxPerTx) throw new Error(`Max ${info.maxPerTx} per transaction`);
  const { request } = await publicClient.simulateContract({
    account, address, abi: LILY_APE_DROP_ABI, functionName: "mint",
    args: [BigInt(qty)], value: info.mintPrice * BigInt(qty),
  });
  const hash = await wallet().writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Mint transaction reverted");
  return { hash, account };
}
