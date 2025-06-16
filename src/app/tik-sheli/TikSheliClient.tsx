// src/app/tik-sheli/TikSheliClient.tsx
// ─── Section 1: Imports ───────────────────────────────────
"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import Image from "next/image";
import styles from "./TikSheliClient.module.css";
import { useUser } from "../context/UserContext";
import { supabase } from "../lib/supabaseClient";
import {
  QuotePoint,
  representativePrice,
  consensusStats,
  blendPrices,
} from "../utils/pricing";
import Wallet from "./Wallet";

// 🚀 Imports for Trade Simulation
import { useTrade, type AllowedTier } from "../context/TradeContext";
import TraderPanel from "../components/TraderPanel";
import tradeStyles from "../components/TraderPanel.module.css";
// ─── End Section 1 ────────────────────────────────────────

// ─── Section 2: Constants & Types ─────────────────────────
const TIERS = ["רגיל", "זהב", "יהלום", "אמרלד"] as const;
type Tier = (typeof TIERS)[number];

/** Map English → Hebrew tier labels (matches DB <-> UI) */
const TIER_EN2HE: Record<string, Tier> = {
  regular: "רגיל",
  gold: "זהב",
  diamond: "יהלום",
  emerald: "אמרלד",
};

/** Map Hebrew → English (AllowedTier) */
const TIER_HE2EN: Record<Tier, AllowedTier> = {
  רגיל: "regular",
  זהב: "gold",
  יהלום: "diamond",
  אמרלד: "emerald",
};

type Item = {
  id: string;
  name: string;
  imageUrl: string;
  /** Which tiers are valid for this item (from item_definitions.allowed_tiers) */
  allowedTiers?: string[] | null;
};

type CollectionRow = {
  id: string;
  item_id: string;
  item_type: Tier;
  quantity: number;
  inserted_at: string | null;
  updated_at: string | null;
};

export interface GeneralDepreciationStats {
  average_gold_depreciation: number | null;
  average_diamond_depreciation: number | null;
  average_emerald_depreciation: number | null;
}

// ─── End Section 2 ────────────────────────────────────────

/* ╭──────────────────────────────────────────────────────────╮
   │  TikSheliClient                                         │
   ╰──────────────────────────────────────────────────────────╯*/

  // ─── Section 3: Component Signature & Context Hooks ───────
  export default function TikSheliClient({
    initialItems,
    generalDepreciationStats,
  }: {
    initialItems: Item[];
    generalDepreciationStats: GeneralDepreciationStats | null;
  }) {
    const { user } = useUser();

    /*  useTrade נותן לנו גם את הצד “sell” כדי שנוכל לראות
        אילו פריטים כבר הוזזו לטרייד ולהפחית אותם זמנית מהתיק  */
    const { addItem, buy, sell } = useTrade();

// ─── End Section 3 ────────────────────────────────────────

// ─── Section 4: Wallet & Username Effects ─────────────────
  /* ───────── wallet-existence flag ───────── */
  const [hasWallet, setHasWallet] = useState(false);
  useEffect(() => {
    if (!user) return setHasWallet(false);
    supabase
      .from("wallets")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setHasWallet(Boolean(data)));
  }, [user]);

  /* ─── username (for audit) ─── */
  const [userName, setUserName] = useState("");
  useEffect(() => {
    if (!user) return setUserName("");
    supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single()
      .then(({ data }) => setUserName(data?.username ?? user.email ?? user.id));
  }, [user]);

  // ─── End Section 4 ────────────────────────────────────────

// ─── Section 5: Add-Item State & Helpers ──────────────────
  /* ───────── WALLET control ───────── */
  const [isWalletOpen, setIsWalletOpen] = useState(false);

  /* ───────── ADD-ITEM local state ───────── */
  const [selections, setSelections] = useState<Record<string, Record<Tier, number>>>({});
  const [currentTier, setCurrentTier] = useState<Record<string, Tier>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isAddItemListOpen, setIsAddItemListOpen] = useState(false);

  /* ---------- helpers to mutate selections ---------- */
  const setTierQty = (itemId: string, tier: Tier, qty: number) =>
    setSelections((prev) => {
      const byTier = { ...(prev[itemId] ?? {}) };
      byTier[tier] = Math.max(0, qty);
      return { ...prev, [itemId]: byTier };
    });

  const totalQtyForItem = (itemId: string) =>
    Object.values(selections[itemId] ?? {}).reduce((s, v) => s + v, 0);

  // ─── End Section 5 ────────────────────────────────────────

// ─── Section 6: DB Operations (Save, Fetch, Remove) ───────
  /* ─── DB: SAVE ITEMS ─── */
  const handleSave = async () => {
    if (!user) {
      setMessage("יש להתחבר כדי לשמור פריטים.");
      return;
    }
    const toSave = Object.entries(selections).flatMap(([item_id, byTier]) =>
      (Object.entries(byTier) as [Tier, number][])
        .filter(([, qty]) => qty > 0)
        .map(([item_type, added]) => ({ item_id, item_type, added }))
    );
    if (!toSave.length) {
      setMessage("בחר לפחות פריט אחד לפני השמירה.");
      return;
    }
    setIsSaving(true);
    setMessage(null);

    const { data: existing } = await supabase
      .from("tik_sheli_collections")
      .select("item_id,item_type,quantity")
      .eq("user_id", user.id);

    const prevMap: Record<string, number> = {};
    (existing ?? []).forEach((r) => {
      prevMap[`${r.item_id}|${r.item_type}`] = r.quantity;
    });

    const rows = toSave.map(({ item_id, item_type, added }) => ({
      user_id: user.id,
      user_name: userName,
      item_id,
      item_name: initialItems.find((x) => x.id === item_id)?.name ?? null,
      item_type,
      quantity: (prevMap[`${item_id}|${item_type}`] ?? 0) + added,
    }));

    const { error } = await supabase
      .from("tik_sheli_collections")
      .upsert(rows, { onConflict: "user_id,item_id,item_type" });

    if (error) {
      console.error(error);
      setMessage("אירעה שגיאה בשמירה.");
    } else {
      setSelections({});
      setCurrentTier({});
      fetchCollection();
      setMessage("✅ נשמר בהצלחה!");
    }
    setIsSaving(false);
  };

  /* ───────── DB: COLLECTION ───────── */
  const [collection, setCollection] = useState<CollectionRow[]>([]);
  const fetchCollection = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("tik_sheli_collections")
      .select("id,item_id,item_type,quantity,inserted_at,updated_at")
      .eq("user_id", user.id)
      .order("inserted_at", { ascending: false });
    if (error) console.error(error);
    else setCollection(data ?? []);
  }, [user]);

  useEffect(() => {
    fetchCollection();
  }, [fetchCollection]);

  /* ───────── REMOVE ITEM ───────── */
  const handleRemove = async (row: CollectionRow) => {
    let qty = row.quantity;
    if (qty > 1) {
      const v = prompt(`יש לך ${qty} יחידות. כמה להסיר? (1-${qty})`, "1");
      if (v === null) return;
      const n = parseInt(v, 10);
      if (!Number.isFinite(n) || n < 1 || n > qty) {
        alert("כמות לא חוקית.");
        return;
      }
      qty = n;
    } else if (!confirm("האם אתה בטוח?")) {
      return;
    }

    if (qty === row.quantity) {
      await supabase.from("tik_sheli_collections").delete().eq("id", row.id);
    } else {
      await supabase
        .from("tik_sheli_collections")
        .update({ quantity: row.quantity - qty })
        .eq("id", row.id);
    }
    fetchCollection();
  };

  // ─── End Section 6 ────────────────────────────────────────

  // ─── Section 7: Pricing Logic ─────────────────────────────
  const [depStats, setDepStats] = useState<GeneralDepreciationStats | null>(
    generalDepreciationStats
  );

  useEffect(() => {
    if (depStats) return; // already have fresh stats
    supabase
      .from("depreciation_stats")
      .select(
        "average_gold_depreciation,average_diamond_depreciation,average_emerald_depreciation"
      )
      .eq("id", "current_summary")
      .single()
      .then(({ data }) => {
        if (data) {
          setDepStats({
            average_gold_depreciation: data.average_gold_depreciation ?? null,
            average_diamond_depreciation: data.average_diamond_depreciation ?? null,
            average_emerald_depreciation: data.average_emerald_depreciation ?? null,
          });
        }
      });
  }, [depStats]);

  /* ❷  Regular-tier price for **every** catalogue item */
  const [regularPriceMap, setRegularPriceMap] = useState<
    Record<string, number | null>
  >({});

  useEffect(() => {
    const ids = initialItems.map((i) => i.id);

    (async () => {
      // ---------- Discord quotes ----------
      const { data: disc } = await supabase
        .from("item_listings")
        .select("item_id,buyregular,sellregular,date")
        .in("item_id", ids);

      const discPts: Record<string, QuotePoint[]> = {};
      disc?.forEach((r) => {
        const buy = +r.buyregular?.replace(/[^\d]/g, "") || NaN;
        const sell = +r.sellregular?.replace(/[^\d]/g, "") || NaN;
        const p =
          !isNaN(buy) && !isNaN(sell)
            ? (buy + sell) / 2
            : !isNaN(buy)
            ? buy
            : !isNaN(sell)
            ? sell
            : NaN;
        if (r.date && Number.isFinite(p)) {
          (discPts[r.item_id] ??= []).push({ price: p, date: new Date(r.date) });
        }
      });

      // ---------- Community assumptions ----------
      const names = initialItems.map((i) => i.name);
      const { data: comm } = await supabase
        .from("assumptions")
        .select("item_name,regular")
        .in("item_name", names);

      const commVals: Record<string, number[]> = {};
      comm?.forEach((r) => {
        if (r.regular != null) (commVals[r.item_name] ??= []).push(r.regular);
      });

      // ---------- Blend & store ----------
      const out: Record<string, number | null> = {};
      initialItems.forEach((meta) => {
        const pts = discPts[meta.id] ?? [];
        const ewma = representativePrice(pts);
        const disSt = consensusStats(pts.map((p) => p.price));
        if (ewma != null) disSt.price = ewma;
        const comSt = consensusStats(commVals[meta.name] ?? []);
        out[meta.id] = blendPrices(disSt, comSt).final;
      });
      setRegularPriceMap(out);
    })();
  }, [initialItems]);

  /* ❸  Price helpers ------------------------------------------------ */
  const priceOf = useCallback(
    (itemId: string, tier: Tier): number => {
      const base = regularPriceMap[itemId];
      if (base == null) return 0;

      const dep =
        tier === "זהב"
          ? depStats?.average_gold_depreciation
          : tier === "יהלום"
          ? depStats?.average_diamond_depreciation
          : tier === "אמרלד"
          ? depStats?.average_emerald_depreciation
          : null;

      const mult =
        tier === "זהב" ? 4 : tier === "יהלום" ? 16 : tier === "אמרלד" ? 64 : 1;

      const factor =
        dep == null || isNaN(dep)
          ? 1
          : 1 - Math.min(Math.max(dep, -200), 100) / 100;

      return Math.round(base * mult * factor);
    },
    [regularPriceMap, depStats]
  );
  // ─── End Section 7 ────────────────────────────────────────
  
  // ─── Section 8: Depreciation & Helper Functions ───────────
  const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleString("he-IL") : "-";

  const bgClass = (t: Tier) =>
    t === "זהב"
      ? styles.bgGold
      : t === "יהלום"
      ? styles.bgDiamond
      : t === "אמרלד"
      ? styles.bgEmerald
      : styles.bgRegular;

  const bagTotal = useMemo(
    () =>
      collection.reduce(
        (sum, r) => priceOf(r.item_id, r.item_type) * r.quantity + sum,
        0
      ),
    [collection, priceOf]
  );

  // ─── End Section 8 ────────────────────────────────────────

  // ─── Section 9: UI Return ──────────────────────────────────
    return (
      <main className={styles.wrapper}>
        <h1>ניהול תיק מוזהבים</h1>

        <Wallet
          formOpen={isWalletOpen}
          setFormOpen={setIsWalletOpen}
          onWalletChange={setHasWallet}
        />

        {/* ───── טריגרים עליונים ───── */}
        <div className={styles.triggersContainer}>
          {!isWalletOpen && !hasWallet && (
            <div
              className={styles.openItemsTrigger}
              onClick={() => setIsWalletOpen(true)}
              role="button"
              tabIndex={0}
            >
              <span className={styles.plusIcon}>+</span>
              <span className={styles.openItemsText}>הוסף ארנק</span>
            </div>
          )}

          {!isAddItemListOpen ? (
            <div
              className={styles.openItemsTrigger}
              onClick={() => setIsAddItemListOpen(true)}
              role="button"
              tabIndex={0}
            >
              <span className={styles.plusIcon}>+</span>
              <span className={styles.openItemsText}>הוסף מוזהבים לתיק/לטרייד</span>
            </div>
          ) : (
            <div
              className={`${styles.card} ${styles.closeItemsTrigger}`}
              onClick={() => setIsAddItemListOpen(false)}
              role="button"
              tabIndex={0}
            >
              <span className={styles.minusIcon}>-</span>
              <span className={styles.closeItemsText}>סגור רשימת מוזהבים</span>
            </div>
          )}
        </div>

        {/* 🚩 Trade Simulation Panel */}
        <TraderPanel />
        {/* ─── End Section 9 ────────────────────────────────── */}

        {/* ─── Section 10 ────────────────────────────────── */}
        {/* ───── בחירת מוזהבים מהקטלוג ───── */}
        {isAddItemListOpen && (
          <>
            <div className={styles.addGrid}>
              {initialItems.map((item) => {
                const allowedHeb = (item.allowedTiers ?? [])
                  .map((en) => TIER_EN2HE[en] ?? en)
                  .filter((h): h is Tier => TIERS.includes(h));
                const finalAllowed = allowedHeb.length ? allowedHeb : TIERS;

                const tier   = currentTier[item.id] ?? finalAllowed[0];
                const qty    = selections[item.id]?.[tier] ?? 0;
                const active = totalQtyForItem(item.id) > 0;

                return (
                  <div
                    key={item.id}
                    className={`${styles.card} ${active ? styles.cardActive : ""}`}
                  >
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        className={styles.cardImage}
                        width={160}
                        height={120}
                        unoptimized
                      />
                    ) : (
                      <div className={styles.cardPlaceholder} />
                    )}

                    <div className={styles.itemName}>{item.name}</div>

                    <select
                      className={styles.select}
                      value={tier}
                      onChange={(e) =>
                        setCurrentTier((c) => ({
                          ...c,
                          [item.id]: e.target.value as Tier,
                        }))
                      }
                    >
                      {finalAllowed.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>

                    <div className={styles.qtyControls}>
                      <button
                        className={styles.qtyBtn}
                        disabled={qty === 0}
                        onClick={() => setTierQty(item.id, tier, qty - 1)}
                      >
                        –
                      </button>
                      <div>{qty}</div>
                      <button
                        className={styles.qtyBtn}
                        onClick={() => setTierQty(item.id, tier, qty + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 🔵 הוסף ל-BUY (קנייה) */}
            <button
              className={`${styles.saveBtn} ${styles.saveBtnEnabled}`}
              onClick={() => {
                let current = buy.items.length;
                const entries = Object.entries(selections) as [
                  string,
                  Record<Tier, number>
                ][];

                for (const [id, byTier] of entries) {
                  for (const [tierHeb, qty] of Object.entries(
                    byTier
                  ) as [Tier, number][]) {
                    for (let i = 0; i < qty; i++) {
                      if (current >= 9) {
                        alert("הגעת למגבלת 9 פריטים בצד הקנייה");
                        return;
                      }
                      const meta = initialItems.find((m) => m.id === id);
                      if (!meta) continue;

                      addItem("buy", {
                        itemId:   id,
                        name:     meta.name,
                        imageUrl: meta.imageUrl,
                        tier:     TIER_HE2EN[tierHeb],
                        quantity: 1,
                        unitPrice: priceOf(id, tierHeb),
                      });
                      current++;
                    }
                  }
                }

                /* מאפסים בחירות אך משאירים את החלון פתוח */
                setSelections({});
                setCurrentTier({});
              }}
            >
              הוסף מוזהבים לטרייד
            </button>

            {/* 🟢 הוסף לתיק */}
            <button
              className={`${styles.saveBtn} ${
                user && !isSaving ? styles.saveBtnEnabled : styles.saveBtnDisabled
              }`}
              onClick={handleSave}
              disabled={!user || isSaving}
            >
              {isSaving ? "שומר…" : "הוסף מוזהבים לתיק"}
            </button>
            {message && <p className={styles.message}>{message}</p>}
          </>
        )}

        {/* ─── End Section 10 ────────────────────────────────── */}

        {/* ─── Section 11 ────────────────────────────────── */}
        {/* ───── התיק האישי שלי ───── */}
        <section>
          <h2>התיק האישי שלי</h2>
          {!collection.length ? (
            <p>עדיין לא הוספת פריטים.</p>
          ) : (
            <>
              <ul className={styles.list}>
                {/* ✨ Alphabetical order by Hebrew name (א ← ת) */}
                {[...collection]
                  .sort((a, b) => {
                    const nameA =
                      initialItems.find((i) => i.id === a.item_id)?.name ?? "";
                    const nameB =
                      initialItems.find((i) => i.id === b.item_id)?.name ?? "";
                    return nameA.localeCompare(nameB, "he");
                  })
                  .map((row) => {
                    /* כמה יחידות כבר “שמורות” לצד המכירה ב-Trade */
                    const reserved = sell.items.filter(
                      (it) =>
                        it.itemId === row.item_id &&
                        it.tier === TIER_HE2EN[row.item_type]
                    ).length;

                    const remaining = row.quantity - reserved;
                    if (remaining <= 0) return null;

                    const meta = initialItems.find(
                      (i) => i.id === row.item_id
                    );
                    if (!meta) return null;

                    const unit = priceOf(row.item_id, row.item_type as Tier);
                    const total = unit * remaining;

                    return (
                      <li
                        key={row.id}
                        className={`${styles.listItem} ${bgClass(
                          row.item_type
                        )}`}
                      >
                        {meta.imageUrl ? (
                          <Image
                            src={meta.imageUrl}
                            alt={meta.name}
                            className={styles.listImage}
                            width={64}
                            height={64}
                            unoptimized
                          />
                        ) : (
                          <div className={styles.listPlaceholder} />
                        )}

                        <div className={styles.itemInfo}>
                          <strong>{meta.name}</strong>
                          <div>סוג: {row.item_type}</div>
                          <div>כמות זמינה: {remaining}</div>
                          <div>נוסף ב-: {fmtDate(row.inserted_at)}</div>
                          <div>עודכן: {fmtDate(row.updated_at)}</div>
                          <div>מחיר ליחידה: {unit.toLocaleString()} ₪</div>
                          {remaining > 1 && (
                            <div>שווי כולל: {total.toLocaleString()} ₪</div>
                          )}
                        </div>

                        {/* ❌ מחיקה קבועה מהתיק */}
                        <button
                          className={styles.removeBtn}
                          onClick={() => handleRemove(row)}
                        >
                          ❌
                        </button>

                        {/* ➕ הוספה זמנית ל-SELL */}
                        <button
                          className={tradeStyles.tradeSmallBtn}
                          onClick={() => {
                            const max = remaining;
                            const toAdd =
                              max > 1
                                ? Number(
                                    prompt(
                                      `כמה יחידות להוסיף לטרייד? (1-${max})`,
                                      "1"
                                    )
                                  ) || 0
                                : 1;

                            if (toAdd < 1 || toAdd > max) return;

                            let current = sell.items.length;
                            if (current >= 9) {
                              alert(
                                "הגעת למגבלת 9 פריטים בצד המכירה"
                              );
                              return;
                            }

                            for (let i = 0; i < toAdd; i++) {
                              if (current >= 9) {
                                alert(
                                  "הגעת למגבלת 9 פריטים בצד המכירה"
                                );
                                break;
                              }

                              addItem("sell", {
                                itemId: row.item_id,
                                name: meta.name,
                                imageUrl: meta.imageUrl,
                                tier: TIER_HE2EN[row.item_type],
                                quantity: 1,
                                unitPrice: unit,
                              });
                              current++;
                            }
                          }}
                        >
                          הוסף לטרייד
                        </button>
                      </li>
                    );
                  })}
              </ul>

              <h3 className={styles.totalSummary}>
                שווי תיק כולל: {bagTotal.toLocaleString()} ₪
              </h3>
            </>
          )}
        </section>
      </main>
    );
  }
{/* ─── End Section 11 ────────────────────────────────── */}

