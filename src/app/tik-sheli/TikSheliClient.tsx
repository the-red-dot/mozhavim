// src/app/tik-sheli/TikSheliClient.tsx
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

/* ╭─────────────────────── טיפוסים וקבועים ────────────────────────╮ */
const TIERS = ["רגיל", "זהב", "יהלום", "אמרלד"] as const;
type Tier = (typeof TIERS)[number];

/** Map English → Hebrew tier labels (matches DB <-> UI) */
const TIER_EN2HE: Record<string, Tier> = {
  regular: "רגיל",
  gold: "זהב",
  diamond: "יהלום",
  emerald: "אמרלד",
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

/* ╭──────────────────────────────────────────────────────────╮
   │  TikSheliClient                                         │
   ╰──────────────────────────────────────────────────────────╯*/
export default function TikSheliClient({
  initialItems,
  generalDepreciationStats,
}: {
  initialItems: Item[];
  generalDepreciationStats: GeneralDepreciationStats | null;
}) {
  const { user } = useUser();

  /* ───────── wallet-existence flag ───────── */
  const [hasWallet, setHasWallet] = useState(false);
  useEffect(() => {
    const checkWallet = async () => {
      if (!user) return setHasWallet(false);
      const { data } = await supabase
        .from("wallets")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      setHasWallet(Boolean(data));
    };
    checkWallet();
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
      .then(({ data }) => {
        setUserName(data?.username ?? user.email ?? user.id);
      });
  }, [user]);

  /* ───────── WALLET control ───────── */
  const [isWalletOpen, setIsWalletOpen] = useState(false);

  /* ───────── ADD-ITEM local state ─────────
     selections: { itemId → { tier → qty } }
     currentTier: which tier dropdown is showing for each item card          */
  const [selections, setSelections] = useState<
    Record<string, Record<Tier, number>>
  >({});
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

  /* ───────── DB: SAVE ITEMS ───────── */
  const handleSave = async () => {
    if (!user) {
      setMessage("יש להתחבר כדי לשמור פריטים.");
      return;
    }

    // flatten selections → array of rows to save
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

  /* ───────── PRICING (discord + community blend) ───────── */
  const [discordPts, setDiscordPts] = useState<Record<string, QuotePoint[]>>({});
  const [communityVals, setCommunityVals] = useState<Record<string, number[]>>({});

  useEffect(() => {
    if (!collection.length) {
      setDiscordPts({});
      setCommunityVals({});
      return;
    }
    const ids = [...new Set(collection.map((r) => r.item_id))];

    // discord quotes
    (async () => {
      const { data } = await supabase
        .from("item_listings")
        .select("item_id,buyregular,sellregular,date")
        .in("item_id", ids);
      const m: Record<string, QuotePoint[]> = {};
      data?.forEach((r) => {
        const buy = +r.buyregular?.replace(/[^\d]/g, "") || NaN;
        const sell = +r.sellregular?.replace(/[^\d]/g, "") || NaN;
        const p = !isNaN(buy) && !isNaN(sell)
          ? (buy + sell) / 2
          : !isNaN(buy)
          ? buy
          : !isNaN(sell)
          ? sell
          : NaN;
        if (r.date && Number.isFinite(p)) {
          (m[r.item_id] ??= []).push({ price: p, date: new Date(r.date) });
        }
      });
      setDiscordPts(m);
    })();

    // community assumptions
    (async () => {
      const names = initialItems.filter((i) => ids.includes(i.id)).map((i) => i.name);
      const { data } = await supabase
        .from("assumptions")
        .select("item_name,regular")
        .in("item_name", names);
      const m: Record<string, number[]> = {};
      data?.forEach((r) => {
        if (r.regular != null) (m[r.item_name] ??= []).push(r.regular);
      });
      setCommunityVals(m);
    })();
  }, [collection, initialItems]);

  const blendedRegular = useMemo(() => {
    const out: Record<string, number | null> = {};
    collection.forEach((row) => {
      const meta = initialItems.find((i) => i.id === row.item_id);
      if (!meta) return;
      const pts = discordPts[row.item_id] ?? [];
      const ewma = representativePrice(pts);
      const disSt = consensusStats(pts.map((p) => p.price));
      if (ewma != null) disSt.price = ewma;
      const comSt = consensusStats(communityVals[meta.name] ?? []);
      out[row.item_id] = blendPrices(disSt, comSt).final;
    });
    return out;
  }, [collection, discordPts, communityVals, initialItems]);

  /* ───────── depreciation summary ───────── */
  const [depStats, setDepStats] = useState<GeneralDepreciationStats | null>(
    generalDepreciationStats
  );
  useEffect(() => {
    if (depStats) return;
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
            average_diamond_depreciation:
              data.average_diamond_depreciation ?? null,
            average_emerald_depreciation:
              data.average_emerald_depreciation ?? null,
          });
        }
      });
  }, [depStats]);

  /* ───────── helpers ───────── */
  const tierPrice = (base: number | null, mult: number, dep: number | null) =>
    base == null
      ? null
      : Math.round(
          base *
            mult *
            (dep == null || isNaN(dep)
              ? 1
              : 1 - Math.min(Math.max(dep, -200), 100) / 100)
        );

  const unitPriceOf = useCallback(
    (r: CollectionRow) => {
      const base = blendedRegular[r.item_id];
      switch (r.item_type) {
        case "זהב":
          return tierPrice(base, 4, depStats?.average_gold_depreciation ?? null);
        case "יהלום":
          return tierPrice(
            base,
            16,
            depStats?.average_diamond_depreciation ?? null
          );
        case "אמרלד":
          return tierPrice(
            base,
            64,
            depStats?.average_emerald_depreciation ?? null
          );
        default:
          return base;
      }
    },
    [blendedRegular, depStats]
  );

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
    () => collection.reduce((sum, r) => (unitPriceOf(r) ?? 0) * r.quantity + sum, 0),
    [collection, unitPriceOf]
  );

  /* ╭─────────────────────────── UI ───────────────────────────╮ */
  return (
    <main className={styles.wrapper}>
      <h1>ניהול תיק מוזהבים</h1>

      <Wallet
        formOpen={isWalletOpen}
        setFormOpen={setIsWalletOpen}
        onWalletChange={setHasWallet}
      />

      <div className={styles.triggersContainer}>
        {!isWalletOpen && !hasWallet && (
          <div
            className={styles.openItemsTrigger}
            onClick={() => setIsWalletOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => ["Enter", " "].includes(e.key) && setIsWalletOpen(true)}
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
            onKeyDown={(e) =>
              ["Enter", " "].includes(e.key) && setIsAddItemListOpen(true)
            }
          >
            <span className={styles.plusIcon}>+</span>
            <span className={styles.openItemsText}>הוסף מוזהבים חדשים לתיק</span>
          </div>
        ) : (
          <div
            className={`${styles.card} ${styles.closeItemsTrigger}`}
            onClick={() => setIsAddItemListOpen(false)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) =>
              ["Enter", " "].includes(e.key) && setIsAddItemListOpen(false)
            }
          >
            <span className={styles.minusIcon}>-</span>
            <span className={styles.closeItemsText}>סגור רשימת מוזהבים</span>
          </div>
        )}
      </div>

      {isAddItemListOpen && (
        <>
          <div className={styles.addGrid}>
            {initialItems.map((item) => {
              const allowedHeb = (item.allowedTiers ?? [])
                .map((en) => TIER_EN2HE[en] ?? en)
                .filter((h): h is Tier => TIERS.includes(h));
              const finalAllowed = allowedHeb.length ? allowedHeb : TIERS;

              const tier = currentTier[item.id] ?? finalAllowed[0];
              const qty = selections[item.id]?.[tier] ?? 0;
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

      <section>
        <h2>התיק האישי שלי</h2>
        {!collection.length ? (
          <p>עדיין לא הוספת פריטים.</p>
        ) : (
          <>
            <ul className={styles.list}>
              {collection.map((row) => {
                const meta = initialItems.find((i) => i.id === row.item_id);
                if (!meta) {
                  console.warn(`Item metadata missing for id=${row.item_id}`);
                  return null;
                }
                const unit = unitPriceOf(row);
                const total = unit != null ? unit * row.quantity : null;

                return (
                  <li
                    key={row.id}
                    className={`${styles.listItem} ${bgClass(row.item_type)}`}
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
                      <div>כמות: {row.quantity}</div>
                      <div>נוסף ב-: {fmtDate(row.inserted_at)}</div>
                      <div>עודכן: {fmtDate(row.updated_at)}</div>
                      <div>
                        מחיר ליחידה:{" "}
                        {unit != null ? unit.toLocaleString() + " ₪" : "—"}
                      </div>
                      {total != null && row.quantity > 1 && (
                        <div>שווי כולל: {total.toLocaleString()} ₪</div>
                      )}
                    </div>

                    <button
                      className={styles.removeBtn}
                      onClick={() => handleRemove(row)}
                    >
                      ❌
                    </button>
                  </li>
                );
              })}
            </ul>

            <h3 className={styles.totalSummary}>
              שווי תיק כולל: {bagTotal ? bagTotal.toLocaleString() + " ₪" : "—"}
            </h3>
          </>
        )}
      </section>
    </main>
  );
}
