// src/app/context/TradeContext.tsx

// ─── Section 1: Imports ───────────────────────────────────
"use client";

import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  ReactNode,
} from "react";
import { supabase } from "../lib/supabaseClient";
import { useUser } from "../context/UserContext";
// ─── End Section 1 ────────────────────────────────────────



// ─── Section 2: Types & Constants ─────────────────────────
export type AllowedTier = "regular" | "gold" | "diamond" | "emerald";

/** One catalogue entry placed inside a trade-slot */
export interface TradeItem {
  itemId:    string;            // PK (item_definitions)
  name:      string;
  imageUrl:  string | null;
  tier:      AllowedTier;
  quantity:  number;
  unitPrice: number;            // ₪ – calculated when the item is added
}

/** State for one side of the trade (buy / sell) */
export interface TradeSideState {
  items: TradeItem[];
  cash:  number;                // ₪ typed in the cash-input
}

/** Everything exposed by <TradeProvider> via useTrade() */
interface TradeContextValue {
  /* live state for each side */
  buy:  TradeSideState;         // “קנייה”  – the other player (what we GET)
  sell: TradeSideState;         // “מכירה” – us          (what we GIVE)

  /* actions */
  addItem:    (side: "buy" | "sell", item: TradeItem) => boolean;
  removeItem: (side: "buy" | "sell", index: number)  => void;
  setCash:    (side: "buy" | "sell", amount: number) => void;

  /* commission-free game-pass flag (true ⇒ 0 % tax on cash) */
  commissionFree: boolean;
  setCommissionFree: (free: boolean) => void;

  /* numbers for the UI (button “שווה לי?”) */
  totals: {
    buy:    number;   // value we get      – ₪
    sell:   number;   // value we give     – ₪
    profit: number;   // buy − sell        – ₪
  };
}

const MAX_PER_SIDE = 9;
// ─── End Section 2 ────────────────────────────────────────



// ─── Section 3: Context Creation ──────────────────────────
const TradeContext = createContext<TradeContextValue | undefined>(undefined);
// ─── End Section 3 ────────────────────────────────────────



// ─── Section 4: <TradeProvider> Component ─────────────────
export function TradeProvider({ children }: { children: ReactNode }) {
  /* ---------- state (slots & cash) ----------------------- */
  const [buy,  setBuy ] = useState<TradeSideState>({ items: [], cash: 0 });
  const [sell, setSell] = useState<TradeSideState>({ items: [], cash: 0 });

  /* ---------- commission-free flag (hydrate from wallet) -- */
  const [commissionFree, setCommissionFree] = useState(false);
  const { user } = useUser();

  useEffect(() => {
    (async () => {
      if (!user) {
        setCommissionFree(false);
        return;
      }
      const { data, error } = await supabase
        .from("wallets")
        .select("has_commission_free_gamepass")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) console.error("wallet fetch failed:", error);
      setCommissionFree(Boolean(data?.has_commission_free_gamepass));
    })();
  }, [user]);
  /* Wallet.tsx also calls setCommissionFree() right after
     a save, so the UI updates instantly and this fetch is
     merely for hydration on refresh/login.                  */

  /* ---------- public actions ----------------------------- */
  const addItem = (side: "buy" | "sell", item: TradeItem): boolean => {
    const setter = side === "buy" ? setBuy : setSell;

    let added = false;
    setter(prev => {
      if (prev.items.length >= MAX_PER_SIDE) return prev;      // hard cap = 9
      added = true;
      return { ...prev, items: [...prev.items, item] };
    });
    return added;
  };

  const removeItem = (side: "buy" | "sell", index: number) => {
    const setter = side === "buy" ? setBuy : setSell;
    setter(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const setCash = (side: "buy" | "sell", amount: number) => {
    const setter = side === "buy" ? setBuy : setSell;
    setter(prev => ({ ...prev, cash: Math.max(0, amount) }));
  };

  /* ---------- totals (memoised) -------------------------- *
   * Rule (when no game-pass):
   *   • We VALUE the other player's cash after the 20 % fee
   *   • We incur the FULL cost of any cash we give
   *   • Items are always at face value                      */
  const totals = useMemo(() => {
    const recvCoeff = commissionFree ? 1 : 0.8;

    const itemsVal = (arr: TradeItem[]) =>
      arr.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);

    const buyValue  = itemsVal(buy.items)  + buy.cash  * recvCoeff; // what we GET
    const sellValue = itemsVal(sell.items) + sell.cash;            // what we GIVE

    return {
      buy:    buyValue,
      sell:   sellValue,
      profit: buyValue - sellValue,
    };
  }, [buy, sell, commissionFree]);

  /* ---------- context obj -------------------------------- */
  const ctx: TradeContextValue = {
    buy,
    sell,
    commissionFree,
    setCommissionFree,
    addItem,
    removeItem,
    setCash,
    totals,
  };

  return <TradeContext.Provider value={ctx}>{children}</TradeContext.Provider>;
}
// ─── End Section 4 ────────────────────────────────────────



// ─── Section 5: useTrade Hook ─────────────────────────────
export function useTrade() {
  const ctx = useContext(TradeContext);
  if (!ctx) throw new Error("useTrade must be used inside <TradeProvider>.");
  return ctx;
}
// ─── End Section 5 ────────────────────────────────────────
