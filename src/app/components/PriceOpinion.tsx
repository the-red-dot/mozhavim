// src/app/components/PriceOpinion.tsx
"use client";

/* ─── Section 1: Imports ─────────────────────────────────── */
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { useUser } from "../context/UserContext";

/* ─── End Section 1 ───────────────────────────────────────── */

/* ─── Section 2: Types, Labels & Helpers ─────────────────── */
export interface ExpectedPrices {
  regular: number | null;
  gold: number | null;
  diamond: number | null;
  emerald: number | null;
}

type TierKey = "regular" | "gold" | "diamond" | "emerald";

const TIER_LABEL_HE: Record<TierKey, string> = {
  regular: "רגיל",
  gold: "זהב",
  diamond: "יהלום",
  emerald: "אמרלד",
};

interface Props {
  itemName: string;
  discordAverage: number;
  expectedPrices: ExpectedPrices;
  /** only these tiers may be assumed */
  allowedTiers: TierKey[];
}

/** Typed row for inserting assumptions */
type AssumptionRow = {
  item_name: string;
  user_id: string;
} & Partial<Record<TierKey, number | null>>;

/* ─── End Section 2 ───────────────────────────────────────── */

/* ─── Section 3: Component ───────────────────────────────── */
export default function PriceOpinion({
  itemName,
  discordAverage,
  expectedPrices,
  allowedTiers,
}: Props) {

  /* 3-A  User & primitive state --------------------------- */
  const { user } = useUser();
  const [voteCounts, setVoteCounts] = useState({
    reasonable: 0,
    too_low: 0,
    too_high: 0,
  });
  const [userVote, setUserVote] = useState<string | null>(null);
  const [hasVotedRecently, setHasVotedRecently] = useState(false);
  const [nextVoteTime, setNextVoteTime] = useState<Date | null>(null);
  const [selectedVote, setSelectedVote] = useState<string | null>(null);

  const [assumptions, setAssumptions] = useState<Record<TierKey, string>>({
    regular: "",
    gold: "",
    diamond: "",
    emerald: "",
  });

  const [showForm, setShowForm] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  /* 3-B  Helpers (load counts, check last vote) ----------- */
  async function loadVoteCounts() {
    const { data, error } = await supabase
      .from("votes")
      .select("vote")
      .eq("item_name", itemName);

    if (error) {
      console.error("loadVoteCounts:", error.message);
      return;
    }

    const counts = { reasonable: 0, too_low: 0, too_high: 0 };
    data?.forEach((v) => {
      if (v.vote === "reasonable") counts.reasonable++;
      if (v.vote === "too_low") counts.too_low++;
      if (v.vote === "too_high") counts.too_high++;
    });
    setVoteCounts(counts);
  }

  async function checkUserVote() {
    if (!user) return;

    const { data, error } = await supabase
      .from("votes")
      .select("vote, created_at")
      .eq("item_name", itemName)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("checkUserVote:", error.message);
      return;
    }

    if (data) {
      const last = new Date(data.created_at);
      const next = new Date(+last + 7 * 24 * 60 * 60 * 1000);
      if (next > new Date()) {
        setHasVotedRecently(true);
        setUserVote(data.vote);
        setNextVoteTime(next);
        return;
      }
    }
    setHasVotedRecently(false);
    setUserVote(null);
    setNextVoteTime(null);
  }

  const pickVote = (v: "reasonable" | "too_low" | "too_high") => {
    if (hasVotedRecently) return;
    setSelectedVote(v);
    setShowForm(true);
  };

  /* 3-C  Confirm handler (save vote + assumptions) -------- */
  async function handleConfirm() {
    setErrorMsg("");
    setSuccessMsg("");

    if (!user) {
      setErrorMsg("עליך להתחבר כדי להצביע.");
      return;
    }
    if (!selectedVote) {
      setErrorMsg("בחר אפשרות הצבעה.");
      return;
    }

    // parse inputs
    const parse = (s: string) => (s.trim() ? +s.replace(/,/g, "") : null);
    const vals: Record<TierKey, number | null> = {
      regular: parse(assumptions.regular),
      gold: parse(assumptions.gold),
      diamond: parse(assumptions.diamond),
      emerald: parse(assumptions.emerald),
    };

    // base on discord/community blend
    const base: Record<TierKey, number | null> = {
      regular: expectedPrices.regular ?? discordAverage,
      gold:
        expectedPrices.gold ??
        (discordAverage > 0 ? discordAverage * 4 : null),
      diamond:
        expectedPrices.diamond ??
        (discordAverage > 0 ? discordAverage * 16 : null),
      emerald:
        expectedPrices.emerald ??
        (discordAverage > 0 ? discordAverage * 64 : null),
    };

    // validate only allowed tiers
    for (const tier of allowedTiers) {
      const v = vals[tier];
      const b = base[tier];
      if (v !== null && !isNaN(v) && b && b > 0) {
        const min = 0.3 * b;
        const max = 2.0 * b;
        if (v < min || v > max) {
          setErrorMsg(
            `ערך ${TIER_LABEL_HE[tier]} לא סביר (הטווח ${Math.round(
              min
            )}–${Math.round(max)})`
          );
          return;
        }
      }
    }

    /* 3.2 save vote */
    if (!hasVotedRecently) {
      await supabase
        .from("votes")
        .delete()
        .eq("item_name", itemName)
        .eq("user_id", user.id);

      const { error } = await supabase.from("votes").insert({
        item_name: itemName,
        user_id: user.id,
        vote: selectedVote,
      });
      if (error) {
        console.error("insert vote:", error.message);
        setErrorMsg("שגיאה בשמירת ההצבעה.");
        return;
      }

      setHasVotedRecently(true);
      setUserVote(selectedVote);
      setNextVoteTime(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    }

    /* 3.3 save assumptions only for allowed tiers */
    const row: AssumptionRow = {
      item_name: itemName,
      user_id: user.id,
    };
    allowedTiers.forEach((tier) => {
      row[tier] = vals[tier];
    });

    const { error: err2 } = await supabase.from("assumptions").insert(row);
    if (err2) {
      console.error("insert assumption:", err2.message);
      setErrorMsg("שגיאה בשמירת ההשערה.");
      return;
    }

    /* 3.4 refresh UI */
    await loadVoteCounts();
    setSuccessMsg("✅ ההצבעה נשמרה בהצלחה!");
    setAssumptions({ regular: "", gold: "", diamond: "", emerald: "" });
    setShowForm(false);
    setSelectedVote(null);
    setTimeout(() => setSuccessMsg(""), 3000);
  }

  /* 3-D  Init -------------------------------------------- */
  useEffect(() => {
    loadVoteCounts();
    checkUserVote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemName]);

  /* 3-E  Render ------------------------------------------ */
  return (
    <div className="price-opinion-container">
      <p className="vote-question">האם המחיר נראה לך הגיוני?</p>

      <div className="voting-buttons">
        <button
          onClick={() => pickVote("reasonable")}
          disabled={hasVotedRecently}
          className={selectedVote === "reasonable" ? "vote-selected" : ""}
        >
          הגיוני ({voteCounts.reasonable})
        </button>
        <button
          onClick={() => pickVote("too_low")}
          disabled={hasVotedRecently}
          className={selectedVote === "too_low" ? "vote-selected" : ""}
        >
          נמוך מדי ({voteCounts.too_low})
        </button>
        <button
          onClick={() => pickVote("too_high")}
          disabled={hasVotedRecently}
          className={selectedVote === "too_high" ? "vote-selected" : ""}
        >
          גבוה מדי ({voteCounts.too_high})
        </button>
      </div>

      {userVote && (
        <p>
          הצבעת:{" "}
          {userVote === "reasonable"
            ? "המחיר הגיוני"
            : userVote === "too_low"
            ? "נמוך מדי"
            : "גבוה מדי"}
        </p>
      )}
      {hasVotedRecently && nextVoteTime && (
        <p>תוכל להצביע שוב ב-{nextVoteTime.toLocaleString("he-IL")}.</p>
      )}

      {showForm && (
        <div className="assumption-form">
          <p>הזן הערכת מחיר (לא חובה):</p>
          {allowedTiers.map((tier) => (
            <label key={tier}>
              {TIER_LABEL_HE[tier]}:
              <input
                type="text"
                value={assumptions[tier]}
                onChange={(e) => {
                  setAssumptions({ ...assumptions, [tier]: e.target.value });
                  setErrorMsg("");
                }}
              />
            </label>
          ))}
          <button onClick={handleConfirm}>אישור</button>
        </div>
      )}

      {errorMsg && <p className="error">{errorMsg}</p>}
      {successMsg && <p className="success">{successMsg}</p>}
    </div>
  );
}
/* ─── End Section 3 ─────────────────────────────────────── */