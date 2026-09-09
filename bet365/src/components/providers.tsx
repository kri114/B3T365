"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/* ------------------------------------------------------------------ */
/* Session user                                                        */
/* ------------------------------------------------------------------ */

export type ClientUser = {
  id: string;
  username: string;
  balanceCents: number;
  /** Overdraft allowance — how far below €0 this player may stake. */
  creditLimitCents?: number;
  isAdmin: boolean;
};

type UserCtx = {
  user: ClientUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (u: ClientUser | null) => void;
};

const UserContext = createContext<UserCtx>({
  user: null,
  loading: true,
  refresh: async () => {},
  setUser: () => {},
});

export function useUser() {
  return useContext(UserContext);
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

type Toast = { id: number; title: string; body?: string; tone: "ok" | "err" | "info" };
type ToastCtx = { toast: (t: Omit<Toast, "id">) => void };
const ToastContext = createContext<ToastCtx>({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

/* ------------------------------------------------------------------ */

export function Providers({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ClientUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(1);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const data = await res.json();
      setUser(data?.user ?? null);
    } catch {
      /* keep previous state */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 25_000);
    return () => clearInterval(t);
  }, [refresh]);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = idRef.current++;
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4200);
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, refresh, setUser }}>
      <ToastContext.Provider value={{ toast }}>
        {children}
        <div className="fixed bottom-5 left-1/2 z-[90] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`animate-rise rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-md ${
                t.tone === "ok"
                  ? "border-live/40 bg-[#0a1410f2]"
                  : t.tone === "err"
                    ? "border-loss/40 bg-[#170d0df2]"
                    : "border-gold/30 bg-[#151209ee]"
              }`}
            >
              <p
                className={`text-[13px] font-semibold ${
                  t.tone === "ok" ? "text-live" : t.tone === "err" ? "text-loss" : "text-gold"
                }`}
              >
                {t.title}
              </p>
              {t.body && <p className="mt-0.5 text-xs text-mute">{t.body}</p>}
            </div>
          ))}
        </div>
      </ToastContext.Provider>
    </UserContext.Provider>
  );
}
