/**
 * Arweave GraphQL helper (used to query by tags).
 *
 * Previously this hit the Irys GraphQL endpoint
 * (`https://devnet.irys.xyz/graphql`). It now queries the canonical Arweave
 * gateway (`https://arweave.net/graphql`), which indexes both bundled and
 * L1 txs. Same call signature as before; callers don't need to change.
 *
 * Kept under the `irys/` directory only to preserve import paths during the
 * migration. New code should treat this as a generic Arweave helper.
 */

const ARWEAVE_GQL_ENDPOINT = "https://arweave.net/graphql";

export interface QueryTag {
  name: string;
  values: string[];
}

export interface IrysQueryNode {
  id: string;
  address: string;
  /**
   * Arweave doesn't expose Irys-style signed receipts. We populate a stub
   * compatible with the old type so call sites that only read `id`/`tags`
   * continue to work without rewrites.
   */
  receipt: {
    deadlineHeight: number;
    signature: string;
    timestamp: number;
    version: string;
  };
  tags: { name: string; value: string }[];
}

/**
 * Query Arweave by tags. Returns the same `{ node }` edge shape the Irys
 * helper used to return.
 */
export async function queryArweaveByTags(
  tags: QueryTag[],
  limit = 10,
  order: "ASC" | "DESC" = "DESC",
): Promise<{ node: IrysQueryNode }[]> {
  const tagFilters = tags
    .map(t => `{ name: "${t.name}", values: ${JSON.stringify(t.values)} }`)
    .join(", ");

  const query = `
    query {
      transactions(
        tags: [${tagFilters}],
        first: ${limit},
        sort: ${order === "DESC" ? "HEIGHT_DESC" : "HEIGHT_ASC"}
      ) {
        edges {
          node {
            id
            owner { address }
            tags { name value }
            block { height timestamp }
          }
        }
      }
    }`;

  try {
    // Hard timeout so a slow/unresponsive Arweave gateway never blocks
    // higher-level flows (profile discovery, route guards, etc.).
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    let res: Response;
    try {
      res = await fetch(ARWEAVE_GQL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!res.ok) throw new Error(`Arweave GQL failed: ${res.statusText}`);
    const json = await res.json();
    const edges = json?.data?.transactions?.edges ?? [];
    return edges.map((e: any) => ({
      node: {
        id: e.node.id,
        address: e.node.owner?.address ?? "",
        receipt: {
          deadlineHeight: e.node.block?.height ?? 0,
          signature: "",
          timestamp: (e.node.block?.timestamp ?? 0) * 1000,
          version: "1.0.0",
        },
        tags: e.node.tags ?? [],
      },
    }));
  } catch (err) {
    console.warn("[Arweave] GraphQL error (returning empty):", err);
    return [];
  }
}

/** @deprecated Old name. Use {@link queryArweaveByTags}. */
export const queryIrysByTags = queryArweaveByTags;
