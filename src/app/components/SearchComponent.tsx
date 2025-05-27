// src/app/components/SearchComponent.tsx
"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Image from 'next/image'; // Import the Next.js Image component
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
  StatsSourceType as DepreciationStatsSourceType
} from "./DepreciationSummary";
import { Item as DepreciationItemFromService } from "../lib/depreciationService";

type Item = DepreciationItemFromService;

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

const toQuotePoints = (rows: Item[]): QuotePoint[] =>
  rows.flatMap((r) => {
    const buy = r.buyregular ? +r.buyregular.replace(/[^\d.]/g, "") : NaN;
    const sell = r.sellregular ? +r.sellregular.replace(/[^\d.]/g, "") : NaN;
    const price = !isNaN(buy) && !isNaN(sell) ? (buy + sell) / 2 : !isNaN(buy) ? buy : !isNaN(sell) ? sell : NaN;
    const date = r.date ? new Date(r.date) : null;
    return Number.isFinite(price) && date && !Number.isNaN(+date) ? [{ price, date }] : [];
  });

export default function SearchComponent({
  initialItems,
  generalDepreciationStats,
  generalDepreciationSource
}: Props) {
  const [term, setTerm] = useState("");
  const [sugs, setSugs] = useState<string[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [drop, showDrop] = useState(false);
  const [viewDiscord, setView] = useState(true);
  const [assumps, setAssumps] = useState<Assumption[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const [imageHasError, setImageHasError] = useState(false);

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
    if (sel && term !== sel) {
      setSel(null);
    }

    const uniqueNames = [...new Set(initialItems.map((i) => i.name))];
    const matchingSuggestions = uniqueNames.filter((name) =>
      name.toLowerCase().includes(term.toLowerCase())
    );
    setSugs(matchingSuggestions);
    showDrop(!!matchingSuggestions.length);
  }, [term, sel, initialItems]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) {
        showDrop(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const itemsForSel = useMemo(
    () => (sel ? initialItems.filter((i) => i.name === sel) : []),
    [sel, initialItems]
  );

  const firstSelectedItem = itemsForSel[0];

  useEffect(() => {
    setImageHasError(false);
  }, [firstSelectedItem?.image]);


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
        console.error("Error fetching assumptions:", error);
        setAssumps([]);
      } else {
        setAssumps(data as Assumption[] || []);
      }
    })();
  }, [sel]);


  const discordStats = useMemo(() => {
    const pts = toQuotePoints(itemsForSel);
    const mu = representativePrice(pts);
    const base = consensusStats(pts.map((p) => p.price));
    return { ...base, price: mu ?? base.price };
  }, [itemsForSel]);

  const communityStats = useMemo(() => {
    const vals = assumps.map((a) => a.regular ?? NaN);
    return consensusStats(vals as number[]);
  }, [assumps]);

  const blended = useMemo(
    () => blendPrices(discordStats, communityStats),
    [discordStats, communityStats]
  );


  const calculatedTierPrices = useMemo(() => {
    if (!blended.final || !generalDepreciationStats) {
      return { gold: null, diamond: null, emerald: null };
    }

    const basePrice = blended.final;
    const {
      average_gold_depreciation,
      average_diamond_depreciation,
      average_emerald_depreciation
    } = generalDepreciationStats;

    const calculateTierPrice = (multiplier: number, depreciation: number | null) => {
      if (depreciation === null || isNaN(depreciation)) return null;
      const effectiveDepreciation = Math.min(Math.max(depreciation, -200), 100);
      return Math.round((basePrice * multiplier) * (1 - (effectiveDepreciation / 100)));
    };

    return {
      gold: calculateTierPrice(4, average_gold_depreciation),
      diamond: calculateTierPrice(16, average_diamond_depreciation),
      emerald: calculateTierPrice(64, average_emerald_depreciation),
    };
  }, [blended.final, generalDepreciationStats]);

  const priceLinesToDisplay = useMemo(() => {
    const lines = [
      {
        key: 'final',
        label: 'מחיר סופי (רגיל):',
        value: blended.final,
        valueClassName: '',
        condition: blended.final !== null,
      },
      {
        key: 'gold',
        label: 'מחיר זהב (משוערך):',
        value: calculatedTierPrices.gold,
        valueClassName: 'gold',
        condition: calculatedTierPrices.gold !== null,
      },
      {
        key: 'diamond',
        label: 'מחיר יהלום (משוערך):',
        value: calculatedTierPrices.diamond,
        valueClassName: 'diamond',
        condition: calculatedTierPrices.diamond !== null,
      },
      {
        key: 'emerald',
        label: 'מחיר אמרלד (משוערך):',
        value: calculatedTierPrices.emerald,
        valueClassName: 'emerald',
        condition: calculatedTierPrices.emerald !== null,
      },
    ];
    return lines.filter(line => line.condition);
  }, [blended.final, calculatedTierPrices]);


  return (
    <div className="search-container" ref={box}>
      <input
        className="search-input"
        placeholder="חפש כאן…"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onFocus={() => {
          if (term.trim() && (!sel || term !== sel) && sugs.length > 0) {
            showDrop(true);
          }
        }}
      />

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

      {sel && firstSelectedItem && (
        <div className="results-container">
          <div className="item-representation">
            <h2>{firstSelectedItem.name}</h2>
            {firstSelectedItem.image ? (
              imageHasError ? (
                <Image
                  className="item-image"
                  src="https://placehold.co/200x150/1a1a1a/ededed?text=Error"
                  alt={firstSelectedItem.name ? `${firstSelectedItem.name} (תמונה לא זמינה)` : "תמונה לא זמינה"}
                  width={200}
                  height={150}
                  unoptimized={true}
                />
              ) : (
                <Image
                  className="item-image"
                  src={firstSelectedItem.image}
                  alt={firstSelectedItem.name || "תמונת פריט"}
                  width={200}
                  height={150}
                  onError={() => {
                    setImageHasError(true);
                  }}
                />
              )
            ) : (
              <p>אין תמונה זמינה</p>
            )}
            <p>{firstSelectedItem.description || "אין תיאור זמין"}</p>

            {priceLinesToDisplay.length > 0 && (
              <div className="item-average-container">
                {priceLinesToDisplay.map((line) => (
                  <div key={line.key} className="price-line">
                    <span className="price-label">{line.label}</span>
                    <span className={`price-value ${line.valueClassName}`}>
                      <span>{line.value?.toLocaleString()}</span>
                      <span className="currency-symbol">₪</span>
                    </span>
                  </div>
                ))}
                <div className="price-source-info">
                  דיסקורד {Math.round(blended.weightD * 100)}% | קהילה {Math.round(blended.weightC * 100)}%
                </div>
              </div>
            )}
          </div>

          {generalDepreciationStats && generalDepreciationSource ? (
            <DepreciationSummary
              stats={generalDepreciationStats}
              source={generalDepreciationSource}
            />
          ) : (
            <div style={{ marginTop: '30px', textAlign: 'center', color: 'orange', padding: '10px', border: '1px dashed orange', borderRadius: '8px' }}>
              טוען נתוני סיכום פחת כלליים...
            </div>
          )}

          <PriceOpinion
            itemName={firstSelectedItem.name}
            discordAverage={discordStats.price ?? 0}
            expectedPrices={{
              regular: blended.final,
              gold: calculatedTierPrices.gold,
              diamond: calculatedTierPrices.diamond,
              emerald: calculatedTierPrices.emerald,
            }}
          />

          <div className="list-toggle">
            <button className={viewDiscord ? "active" : ""} onClick={() => setView(true)}>
              מחירי קהילת דיסקורד
            </button>
            <button className={!viewDiscord ? "active" : ""} onClick={() => setView(false)}>
              מחירי קהילת מוזהבים
            </button>
          </div>

          {viewDiscord ? (
            <div className="matching-results">
              <h3>מחירי דיסקורד עבור {sel}</h3>
              {itemsForSel.length ? (
                <ul>
                  {itemsForSel.map((i) => (
                    <li key={i.id} className="result-item">
                      <div className="price-info">
                        {i.buyregular && (<span>קנייה (רגיל): {i.buyregular}</span>)}
                        {i.buygold && (<span>קנייה (זהב): {i.buygold}</span>)}
                        {i.buydiamond && (<span>קנייה (יהלום): {i.buydiamond}</span>)}
                        {i.buyemerald && (<span>קנייה (אמרלד): {i.buyemerald}</span>)}
                        {i.sellregular && (<span>מכירה (רגיל): {i.sellregular}</span>)}
                        {i.sellgold && (<span>מכירה (זהב): {i.sellgold}</span>)}
                        {i.selldiamond && (<span>מכירה (יהלום): {i.selldiamond}</span>)}
                        {i.sellemerald && (<span>מכירה (אמרלד): {i.sellemerald}</span>)}
                      </div>
                      <div className="meta-info">
                        {i.publisher && <span>פורסם ע״י: {i.publisher}</span>}
                        {i.date && <span>תאריך: {i.date}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (<p>אין רשומות דיסקורד.</p>)}
            </div>
          ) : (
            <div className="assumptions-list scrollable">
              <h3>מחירי קהילה עבור {sel}</h3>
              {assumps.length ? (
                <ul>
                  {assumps.map((a) => (
                    <li key={a.id}>
                      <div><strong>{a.username ?? a.profiles?.username ?? "Unknown"}</strong> ({new Date(a.created_at).toLocaleString("he-IL")})</div>
                      <div className="price-info">
                        {a.regular !== null && (<span>רגיל: {a.regular.toLocaleString()}</span>)}
                        {a.gold !== null && (<span>זהב: {a.gold.toLocaleString()}</span>)}
                        {a.diamond !== null && (<span>יהלום: {a.diamond.toLocaleString()}</span>)}
                        {a.emerald !== null && (<span>אמרלד: {a.emerald.toLocaleString()}</span>)}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (<p>אין הערכות משתמשים.</p>)}
            </div>
          )}
        </div>
      )}

      {!sel && term.trim() && !sugs.length && (
        <div style={{ marginTop: '20px', textAlign: 'center', color: '#aaa' }}>
          לא נמצאו פריטים תואמים עבור &quot;{`${term}`}&quot;.
        </div>
      )}
    </div>
  );
}