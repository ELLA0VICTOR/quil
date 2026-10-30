import { createContext, useContext } from "react";
import type { SessionView } from "../../shared/session";

export type Account = { session: SessionView | null; error: string; refresh: () => Promise<void>; openAccount: () => void };
export const AccountContext = createContext<Account | null>(null);
export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw Error("Account provider required");
  return value;
}
