import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@lifexp/types";
import { api, tokenStore } from "./api";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then((res) => setUser(res.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  async function login(identifier: string, password: string) {
    const res = await api.login({ identifier, password });
    tokenStore.set(res.accessToken);
    setUser(res.user);
  }

  async function register(username: string, email: string, password: string) {
    const res = await api.register({ username, email, password });
    tokenStore.set(res.accessToken);
    setUser(res.user);
  }

  function logout() {
    tokenStore.clear();
    setUser(null);
  }

  async function refresh() {
    const res = await api.me();
    setUser(res.user);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
