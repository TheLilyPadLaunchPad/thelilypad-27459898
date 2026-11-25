export interface PackPurchase {
  id: string;
  item_id: string;
  user_id: string;
  from_address: string | null;
  delivery_status?: string | null;
  delivery_results?: unknown;
}

/** A receipt authorizes only its original account, pack, and delivery wallet. */
export function packPurchaseAccess(purchase: PackPurchase | null, userId: string, packId: string, wallet: string): boolean {
  return Boolean(purchase && purchase.user_id === userId && purchase.item_id === packId
    && (!purchase.from_address || purchase.from_address === wallet));
}