import React, { createContext, useContext } from "react";
import { useIsAdmin as useIsAdminHook } from "@/hooks/useIsAdmin";

type AdminContextValue = { isAdmin: boolean; loading: boolean };

const AdminContext = createContext<AdminContextValue>({ isAdmin: false, loading: true });

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useIsAdminHook();
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
};

/**
 * Shared admin status — reads from the AdminProvider so the underlying
 * Supabase RPC + auth-state subscription only runs ONCE per app instance,
 * rather than once per consumer.
 */
export const useAdmin = (): AdminContextValue => useContext(AdminContext);
