import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, tokenStore } from "./api";
import type { User } from "@lifexp/types";

type Status = "loading" | "authed" | "anon";

interface AuthValue {
  user: User | null;
  status: Status;
  login: (identifier: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  async function loadMe() {
    try {
      const { user } = await api.me();
      setUser(user);
      setStatus("authed");
    } catch {
      setUser(null);
      setStatus("anon");
    }
  }

  useEffect(() => {
    (async () => {
      const access = await tokenStore.getAccess();
      if (!access) {
        setStatus("anon");
        return;
      }
      await loadMe();
    })();
  }, []);

  const value: AuthValue = {
    user,
    status,
    async login(identifier, password) {
      const res = await api.login({ identifier, password });
      await tokenStore.setTokens(res.accessToken, res.refreshToken);
      setUser(res.user);
      setStatus("authed");
    },
    async register(username, email, password) {
      const res = await api.register({ username, email, password });
      await tokenStore.setTokens(res.accessToken, res.refreshToken);
      setUser(res.user);
      setStatus("authed");
    },
    async logout() {
      await tokenStore.clear();
      setUser(null);
      setStatus("anon");
    },
    refreshMe: loadMe,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
