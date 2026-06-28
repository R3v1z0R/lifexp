import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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

  const loadMe = useCallback(async () => {
    try {
      const { user } = await api.me();
      setUser(user);
      setStatus("authed");
    } catch {
      setUser(null);
      setStatus("anon");
    }
  }, []);

  useEffect(() => {
    (async () => {
      const access = await tokenStore.getAccess();
      if (!access) {
        setStatus("anon");
        return;
      }
      await loadMe();
    })();
  }, [loadMe]);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await api.login({ identifier, password });
    await tokenStore.setTokens(res.accessToken, res.refreshToken);
    setUser(res.user);
    setStatus("authed");
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const res = await api.register({ username, email, password });
    await tokenStore.setTokens(res.accessToken, res.refreshToken);
    setUser(res.user);
    setStatus("authed");
  }, []);

  const logout = useCallback(async () => {
    await tokenStore.clear();
    setUser(null);
    setStatus("anon");
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user, status, login, register, logout, refreshMe: loadMe }),
    [user, status, login, register, logout, loadMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
