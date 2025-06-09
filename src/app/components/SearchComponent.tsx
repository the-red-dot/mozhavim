// ─────────────────────────────────────────────────────────────
// src/app/components/SearchComponent.tsx
// Search box + price card.  Now uses listing_id to avoid duplicate keys.
// ─────────────────────────────────────────────────────────────
"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import PriceOpinion from "./PriceOpinion";
import { supabase } from "../lib/supabaseClient";
import {
  QuotePoint,
  representativePrice,
  consensusStats,
  blendPrices,
} from "../utils/pricing";
import DepreciationSummary, {
  DepreciationStatsDisplay,
  StatsSourceType as DepreciationStatsSourceType,
} from "./DepreciationSummary";
import { Item as DepreciationItemFromService } from "../lib/depreciationService";

/* ------------------------------------------------------- */
/*  🗂️  Types & helpers                                    */
/* ------------------------------------------------------- */

type AllowedTier = "regular" | "gold" | "diamond" | "emerald";

/** Item rows now ALSO carry a unique `listing_id` coming
    straight from the SQL view. */
type Item = DepreciationItemFromService & {
  /** From the item_definitions table */
  allowed_tiers?: AllowedTier[];
  /** NEW: unique per-listing primary key (may be undefined for
      definition-only rows that have no listing) */
  listing_id?: string;
};

interface Assumption {
  id: string;
  item_name: string;
  user_id: string;
  username: string | null;
  regular: number | null;
  gold: number | null;
  diamond: number | null;
  emerald: number | null;
  created_at: string;
  profiles: { username: string | null } | null;
}

interface Props {
  initialItems: Item[];
  generalDepreciationStats: DepreciationStatsDisplay | undefined | null;
  generalDepreciationSource: DepreciationStatsSourceType | undefined;
}

/* ---------- helper: extract EWMA quote points ---------- */
const toQuotePoints = (rows: Item[]): QuotePoint[] =>
  rows.flatMap((r) => {
    const buy = r.buyregular ? +r.buyregular.replace(/[^\d.]/g, "") : NaN;
    const sell = r.sellregular ? +r.sellregular.replace(/[^\d.]/g, "") : NaN;
    const price = !isNaN(buy) && !isNaN(sell)
      ? (buy + sell) / 2
      : !isNaN(buy)
      ? buy
      : !isNaN(sell)
      ? sell
      : NaN;
    const date = r.date ? new Date(r.date) : null;
    return Number.isFinite(price) && date && !Number.isNaN(+date)
      ? [{ price, date }]
      : [];
  });

/** English → Hebrew label map (once, at top-level) */
const TIER_LABELS: Record<AllowedTier, string> = {
  regular: "רגיל",
  gold: "זהב",
  diamond: "יהלום",
  emerald: "אמרלד",
};

/* ------------------------------------------------------- */
/*  🔎  Component                                           */
/* ------------------------------------------------------- */
export default function SearchComponent({
  initialItems,
  generalDepreciationStats,
  generalDepreciationSource,
}: Props) {
  /* ------------------------------------------- state */
  const [term, setTerm] = useState("");
  const [sugs, setSugs] = useState<string[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [drop, showDrop] = useState(false);
  const [viewDiscord, setView] = useState(true);
  const [assumps, setAssumps] = useState<Assumption[]>([]);
  const [imageHasError, setImageHasError] = useState(false);

  const box = useRef<HTMLDivElement>(null);

  /* ------------------------------------------- autocomplete */
  useEffect(() => {
    if (!term.trim()) {
      setSugs([]);
      showDrop(false);
      setSel(null);
      return;
    }
    if (sel && term === sel) {
      showDrop(false);
      return;
    }
    if (sel && term !== sel) setSel(null);

    const uniques = [...new Set(initialItems.map((i) => i.name))];
    const m = uniques.filter((n) =>
      n.toLowerCase().includes(term.toLowerCase())
    );
    setSugs(m);
    showDrop(!!m.length);
  }, [term, sel, initialItems]);

  /* hide dropdown on outside click */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) {
        showDrop(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  /* ------------------------------------------- selection-related memo’s */
  const itemsForSel = useMemo(
    () => (sel ? initialItems.filter((x) => x.name === sel) : []),
    [sel, initialItems]
  );

  const firstSelected = itemsForSel[0]; // meta row

  /* reset image error when item changes */
  useEffect(() => setImageHasError(false), [firstSelected?.image]);

  /* ------------------------------------------- assumptions (community) */
  useEffect(() => {
    if (!sel) {
      setAssumps([]);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("assumptions")
        .select("*, profiles(username)")
        .eq("item_name", sel);
      if (error) {
        console.error(error);
      } else {
        setAssumps((data as Assumption[]) ?? []);
      }
    })();
  }, [sel]);

  /* ------------------------------------------- stats calculations */
  const discordStats = useMemo(() => {
    const pts = toQuotePoints(itemsForSel);
    const ewma = representativePrice(pts);
    const base = consensusStats(pts.map((p) => p.price));
    return { ...base, price: ewma ?? base.price };
  }, [itemsForSel]);

  const communityStats = useMemo(() => {
    const vals = assumps.map((a) => a.regular ?? NaN);
    return consensusStats(vals as number[]);
  }, [assumps]);

  const blended = useMemo(
    () => blendPrices(discordStats, communityStats),
    [discordStats, communityStats]
  );

  /* ------------------------------------------- price per tier */
  const calculatedTierPrices = useMemo(() => {
    if (!blended.final || !generalDepreciationStats)
      return { gold: null, diamond: null, emerald: null };

    const base = blended.final;
    const {
      average_gold_depreciation: depG,
      average_diamond_depreciation: depD,
      average_emerald_depreciation: depE,
    } = generalDepreciationStats;

    const calc = (mult: number, dep: number | null) => {
      if (dep == null || Number.isNaN(dep)) return null;
      const eff = Math.min(Math.max(dep, -200), 100);
      return Math.round(base * mult * (1 - eff / 100));
    };

    return {
      gold: calc(4, depG),
      diamond: calc(16, depD),
      emerald: calc(64, depE),
    };
  }, [blended.final, generalDepreciationStats]);

  /* -------------------- 🔑 NEW: what tiers are allowed? */
  const allowedTiers: AllowedTier[] = useMemo(() => {
    if (!firstSelected) return ["regular", "gold", "diamond", "emerald"];
    return (
      (firstSelected.allowed_tiers as AllowedTier[] | undefined) ?? [
        "regular",
        "gold",
        "diamond",
        "emerald",
      ]
    );
  }, [firstSelected]);

  /* ------------------------------------------- price-lines list */
  const priceLines = useMemo(() => {
    const base = [
      {
        key: "final",
        tier: "regular" as AllowedTier,
        label: `מחיר סופי (${TIER_LABELS.regular}):`,
        value: blended.final,
        className: "",
      },
      {
        key: "gold",
        tier: "gold" as AllowedTier,
        label: `מחיר ${TIER_LABELS.gold} (משוערך):`,
        value: calculatedTierPrices.gold,
        className: "gold",
      },
      {
        key: "diamond",
        tier: "diamond" as AllowedTier,
        label: `מחיר ${TIER_LABELS.diamond} (משוערך):`,
        value: calculatedTierPrices.diamond,
        className: "diamond",
      },
      {
        key: "emerald",
        tier: "emerald" as AllowedTier,
        label: `מחיר ${TIER_LABELS.emerald} (משוערך):`,
        value: calculatedTierPrices.emerald,
        className: "emerald",
      },
    ];
    return base.filter(
      (l) => allowedTiers.includes(l.tier) && l.value !== null
    );
  }, [blended.final, calculatedTierPrices, allowedTiers]);

  /* ------------------------------------------------------- */
  /*  🎨  Render                                              */
  /* ------------------------------------------------------- */
  return (
    <div className="search-container" ref={box}>
      {/* 🔍 search box */}
      <input
        className="search-input"
        placeholder="חפש כאן…"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onFocus={() => {
          // only show suggestions if there’s a term, it’s not already selected, and we have suggestions
          if (term.trim() && (!sel || term !== sel) && sugs.length) {
            showDrop(true);
          }
        }}
      />

      {/* suggestions */}
      {drop && !!sugs.length && (
        <ul className="suggestions-dropdown show">
          {sugs.map((n) => (
            <li
              key={n}
              onClick={() => {
                setSel(n);
                setTerm(n);
                showDrop(false);
              }}
            >
              {n}
            </li>
          ))}
        </ul>
      )}

      {/* result card */}
      {sel && firstSelected && (
        <div className="results-container">
          {/* ---------- side card ---------- */}
          <div className="item-representation">
            <h2>{firstSelected.name}</h2>
            {/* image */}
            {firstSelected.image ? (
              imageHasError ? (
                <Image
                  className="item-image"
                  src="https://placehold.co/200x150/1a1a1a/ededed?text=Error"
                  alt={
                    firstSelected.name
                      ? `${firstSelected.name} (תמונה לא זמינה)`
                      : "תמונה לא זמינה"
                  }
                  width={200}
                  height={150}
                  unoptimized
                />
              ) : (
                <Image
                  className="item-image"
                  src={firstSelected.image}
                  alt={firstSelected.name || "תמונת פריט"}
                  width={200}
                  height={150}
                  onError={() => setImageHasError(true)}
                />
              )
            ) : (
              <p>אין תמונה זמינה</p>
            )}
            <p>{firstSelected.description || "אין תיאור זמין"}</p>

            {/* price block */}
            {priceLines.length > 0 && (
              <div className="item-average-container">
                {priceLines.map((l) => (
                  <div key={l.key} className="price-line">
                    <span className="price-label">{l.label}</span>
                    <span className={`price-value ${l.className}`}>
                      <span>{l.value?.toLocaleString()}</span>
                      <span className="currency-symbol"> ₪</span>
                    </span>
                  </div>
                ))}
                <div className="price-source-info">
                  דיסקורד {Math.round(blended.weightD * 100)}% | קהילה{" "}
                  {Math.round(blended.weightC * 100)}%
                </div>
              </div>
            )}
          </div>

          {/* depreciation summary */}
          {generalDepreciationStats && generalDepreciationSource ? (
            <DepreciationSummary
              stats={generalDepreciationStats}
              source={generalDepreciationSource}
            />
          ) : (
            <div
              style={{
                marginTop: "30px",
                textAlign: "center",
                color: "orange",
                padding: "10px",
                border: "1px dashed orange",
                borderRadius: "8px",
              }}
            >
              טוען נתוני סיכום פחת כלליים...
            </div>
          )}

          {/* user opinion widget */}
          <PriceOpinion
            itemName={firstSelected.name}
            discordAverage={discordStats.price ?? 0}
            expectedPrices={{
              regular: blended.final,
              gold: calculatedTierPrices.gold,
              diamond: calculatedTierPrices.diamond,
              emerald: calculatedTierPrices.emerald,
            }}
            allowedTiers={allowedTiers} // ✅ NEW: restrict assumption inputs
          />

          {/* toggle discord / community */}
          <div className="list-toggle">
            <button
              className={viewDiscord ? "active" : ""}
              onClick={() => setView(true)}
            >
              מחירי קהילת דיסקורד
            </button>
            <button
              className={!viewDiscord ? "active" : ""}
              onClick={() => setView(false)}
            >
              מחירי קהילת מוזהבים
            </button>
          </div>

          {/* listings lists (depend on toggle) */}
          {viewDiscord ? (
            <div className="matching-results">
              <h3>מחירי דיסקורד עבור {sel}</h3>
              {itemsForSel.length ? (
                <ul>
                  {itemsForSel.map((i) => (
                    /*  👇 UNIQUE key = listing_id (falls back to definition id) */
                    <li
                      key={i.listing_id ?? i.id}
                      className="result-item"
                    >
                      <div className="price-info">
                        {i.buyregular && <span>קנייה (רגיל): {i.buyregular}</span>}
                        {i.buygold && <span>קנייה (זהב): {i.buygold}</span>}
                        {i.buydiamond && <span>קנייה (יהלום): {i.buydiamond}</span>}
                        {i.buyemerald && <span>קנייה (אמרלד): {i.buyemerald}</span>}
                        {i.sellregular && <span>מכירה (רגיל): {i.sellregular}</span>}
                        {i.sellgold && <span>מכירה (זהב): {i.sellgold}</span>}
                        {i.selldiamond && (
                          <span>מכירה (יהלום): {i.selldiamond}</span>
                        )}
                        {i.sellemerald && (
                          <span>מכירה (אמרלד): {i.sellemerald}</span>
                        )}
                      </div>
                      <div className="meta-info">
                        {i.publisher && <span>פורסם ע״י: {i.publisher}</span>}
                        {i.date && <span>תאריך: {i.date}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>אין רשומות דיסקורד.</p>
              )}
            </div>
          ) : (
            <div className="assumptions-list scrollable">
              <h3>מחירי קהילה עבור {sel}</h3>
              {assumps.length ? (
                <ul>
                  {assumps.map((a) => (
                    <li key={a.id}>
                      <div>
                        <strong>
                          {a.username ?? a.profiles?.username ?? "Unknown"}
                        </strong>{" "}
                        ({new Date(a.created_at).toLocaleString("he-IL")})
                      </div>
                      <div className="price-info">
                        {a.regular !== null && (
                          <span>רגיל: {a.regular.toLocaleString()}</span>
                        )}
                        {a.gold !== null && (
                          <span>זהב: {a.gold.toLocaleString()}</span>
                        )}
                        {a.diamond !== null && (
                          <span>יהלום: {a.diamond.toLocaleString()}</span>
                        )}
                        {a.emerald !== null && (
                          <span>אמרלד: {a.emerald.toLocaleString()}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>אין הערכות משתמשים.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* no match notice */}
      {!sel && term.trim() && !sugs.length && (
        <div style={{ marginTop: "20px", textAlign: "center", color: "#aaa" }}>
          לא נמצאו פריטים תואמים עבור &quot;{term}&quot;.
        </div>
      )}
    </div>
  );
}
