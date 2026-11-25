export function canViewFooterResources(isAdmin: boolean, loading: boolean): boolean {
  return isAdmin && !loading;
}