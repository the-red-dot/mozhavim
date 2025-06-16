// src/app/components/TraderPanel.tsx

// ─── Section 1: Imports ───────────────────────────────────
"use client";

import { Fragment, useState, useEffect } from "react";
import Image       from "next/image";
import confetti    from "canvas-confetti";
import {
  useTrade,
  type AllowedTier,
}                 from "../context/TradeContext";
import styles      from "./TraderPanel.module.css";
// ─── End Section 1 ────────────────────────────────────────



// ─── Section 2: Component Definition & Hooks ─────────────
export default function TraderPanel() {
  const { buy, sell, removeItem, setCash, totals } = useTrade();

  /* popup-modal state */
  const [open,   setOpen] = useState(false);
  const [profit, setP]    = useState(0);

  /* confetti + SFX (runs only in the browser) */
  useEffect(() => {
    if (!open) return;

    confetti({ particleCount: 180, spread: 80, origin: { y: 0.6 } });

    /* mini “ding” (~150 ms, inline WAV) */
    const au = new Audio(
      "data:audio/wav;base64,UklGRkQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQgAAAABA"
    );
    au.volume = 0.55;
    au.play().catch(() => {});
  }, [open]);
// ─── End Section 2 ────────────────────────────────────────



// ─── Section 3: UI Rendering & Logic ──────────────────────
/* tier → Hebrew label */
const TIER_LABELS: Record<AllowedTier, string> = {
  regular: "רגיל",
  gold:    "זהב",
  diamond: "יהלום",
  emerald: "אמרלד",
};

/* verdict helpers */
const verdictText = (p: number) =>
  p >= 0
    ? `הרווח שלך מהטרייד עשוי להיות:\n${p.toLocaleString()} ₪`
    : `ההפסד שלך מהטרייד עשוי להיות:\n${Math.abs(p).toLocaleString()} ₪`;

const verdictEmoji = (p: number) => {
  const abs  = Math.abs(p);
  const plus = p >= 0;
  if (abs < 1_000)  return plus ? "😀" : "😕";
  if (abs < 10_000) return plus ? "🤩" : "😖";
  if (abs < 50_000) return plus ? "🥳" : "😩";
  return plus ? "🤯" : "😭";
};

/* helper: does side contain *any* value? */
const sideHasValue = (s: ReturnType<typeof useTrade>["buy"]) =>
  s.items.length > 0 || s.cash > 0;

/* render one trade side */
function renderSide(
  side   : "buy" | "sell",
  title  : string,
  state  : ReturnType<typeof useTrade>["buy"],
  remove : typeof removeItem,
  cashFn : typeof setCash
) {
  const itemsValue = state.items.reduce(
    (sum, it) => sum + it.unitPrice * it.quantity,
    0
  );
  const totalValue = itemsValue + state.cash;

  return (
    <div className={styles.tradeSide}>
      <h3>{title}</h3>

      <div className={styles.tradeGrid}>
        {state.items.map((it, idx) => {
          const tierClass =
            it.tier === "gold"
              ? styles.tierGold
              : it.tier === "diamond"
              ? styles.tierDiamond
              : it.tier === "emerald"
              ? styles.tierEmerald
              : "";

          return (
            <div
              key={`${side}-${idx}`}
              className={`${styles.tradeSlot} ${tierClass}`}
            >
              {it.imageUrl ? (
                <Image
                  src={it.imageUrl}
                  alt={it.name}
                  width={64}
                  height={64}
                  unoptimized
                />
              ) : (
                <div className={styles.tradePlaceholder} />
              )}

              <span className={styles.tradeName}>{it.name}</span>
              <span className={styles.tradeTier}>{TIER_LABELS[it.tier]}</span>
              {it.quantity > 1 && (
                <span className={styles.tradeQty}>x{it.quantity}</span>
              )}

              <button
                className={styles.tradeRemove}
                onClick={() => remove(side, idx)}
              >
                ✕
              </button>
            </div>
          );
        })}

        {/* pad to 9 slots */}
        {Array.from({ length: 9 - state.items.length }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className={`${styles.tradeSlot} ${styles.empty}`}
          />
        ))}
      </div>

      {/* cash input */}
      <div className={styles.tradeCash}>
        <label>
          מזומן (₪):
          <input
            type="number"
            min={0}
            value={state.cash}
            onChange={(e) => cashFn(side, +e.target.value)}
          />
        </label>
      </div>

      {/* side summary */}
      <p className={styles.tradeSummary}>
        שווי מוזהבים: {itemsValue.toLocaleString()} ₪
        <br />
        מזומן: {state.cash.toLocaleString()} ₪
        <br />
        סה&quot;כ: {totalValue.toLocaleString()} ₪
      </p>
    </div>
  );
}

return (
  <Fragment>
    <div className={styles.tradePanel}>
      {renderSide("buy",  "קנייה (הצד השני)", buy,  removeItem, setCash)}
      {renderSide("sell", "מכירה (שלי)",      sell, removeItem, setCash)}

      <div className={styles.tradeResult}>
        <button
          /* enabled when BOTH sides contain either items or cash */
          disabled={!(sideHasValue(buy) && sideHasValue(sell))}
          onClick={() => {
            setP(totals.profit);
            setOpen(true);
          }}
        >
          שווה לי?
        </button>
      </div>
    </div>

    {open && (
      <div className={styles.resultModalBackdrop}>
        <div className={styles.resultModal}>
          <button
            className={styles.modalClose}
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
          <div className={styles.emoji}>{verdictEmoji(profit)}</div>
          <p className={styles.resultText}>{verdictText(profit)}</p>
        </div>
      </div>
    )}
  </Fragment>
);
// ─── End Section 3 ────────────────────────────────────────
}
