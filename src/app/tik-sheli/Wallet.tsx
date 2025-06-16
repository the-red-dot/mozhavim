// src/app/components/Wallet.tsx
// ─────────────────────────────────────────────────────────────
// Wallet – create / update / delete a game-wallet for the user
// (controlled by the parent – formOpen + setFormOpen are injected)
// ─────────────────────────────────────────────────────────────
"use client";

/* ─── Section 1: Imports ─────────────────────────────────── */

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import clientStyles from "./TikSheliClient.module.css";
import styles from "../tik-sheli/Wallet.module.css";
import { useUser } from "../context/UserContext";
import { supabase } from "../lib/supabaseClient";

/* ─── End Section 1 ───────────────────────────────────────── */

/* ─── Section 2: Types & Constants ────────────────────────── */
/* ╭─────────────── DB row mapping ────────────────╮ */
type WalletRow = {
  id: string;
  amount: number;
  roblox_username: string | null;
  roblox_user_id: number | null;
  roblox_thumb: string | null;
  has_commission_free_gamepass: boolean;
  in_blooming: boolean;
  blooming_role: string | null;
  in_merkaz: boolean;
  merkaz_role: string | null;
  roblox_confirmed_at: string | null;
  roblox_change_attempt_at: string | null;
  inserted_at: string | null;
  updated_at: string | null;
};

/* props passed from the parent */
export interface WalletProps {
  formOpen: boolean;
  setFormOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** let the parent know if a wallet exists (true) or was removed (false) */
  onWalletChange?: (hasWallet: boolean) => void;
}

/* ╭────────────────────── Helpers ───────────────────────╮ */
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleString("he-IL") : "—";

const RAW_BASE =
  process.env.NEXT_PUBLIC_ROBLOX_API_URL ||
  "https://roblox-api-67sv.onrender.com";
const RENDER_BASE = (() => {
  try {
    return new URL(RAW_BASE).origin;
  } catch {
    return RAW_BASE.replace(/\/(get_user_id|lookup).*$/, "");
  }
})();
const avatarSrc = (id: number) => `${RENDER_BASE}/avatar/${id}`;

/* ─── End Section 2 ───────────────────────────────────────── */

/* ─── Section 3: Wallet Component ─────────────────────────── */

export default function Wallet({
  formOpen,
  setFormOpen,
  onWalletChange,
}: WalletProps) {
  /* ── 3-A: User & Profile ──────────────────────────────── */
  const { user } = useUser();

  const [profileName, setProfileName] = useState("");
  useEffect(() => {
    if (!user) {
      setProfileName("");
      return;
    }
    supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single()
      .then(({ data }) =>
        setProfileName(data?.username ?? user.email ?? user.id)
      );
  }, [user]);

  /* ── End 3-A ──────────────────────────────────────────── */

  /* ── 3-B: Wallet State & Drafts ───────────────────────── */
  const [wallet, setWallet] = useState<WalletRow | null>(null);

  /* whenever wallet state changes – notify parent */
  useEffect(() => {
    onWalletChange?.(Boolean(wallet));
  }, [wallet, onWalletChange]);

  /* draft fields for the form */
  const [amountDraft, setAmountDraft] = useState("");
  const [robloxDraft, setRobloxDraft] = useState("");
  const [robloxId, setRobloxId] = useState<number | null>(null);
  const [robloxThumb, setRobloxThumb] = useState<string | null>(null);
  const [confirmSelf, setConfirmSelf] = useState(false);
  const [hasPassDraft, setHasPassDraft] = useState(false);

  /* group flags */
  const [inBlooming, setInBlooming] = useState(false);
  const [bloomRole, setBloomRole] = useState<string | null>(null);
  const [inMerkaz, setInMerkaz] = useState(false);
  const [merkazRole, setMerkazRole] = useState<string | null>(null);

  type RStatus = "idle" | "loading" | "found" | "notfound" | "error";
  const [robloxStatus, setRobloxStatus] = useState<RStatus>("idle");

  /* ── End 3-B ──────────────────────────────────────────── */

  /* ── 3-C: Fetch Wallet (DB) ───────────────────────────── */
  const fetchWallet = async () => {
    if (!user) {
      setWallet(null);
      return;
    }
    const { data } = await supabase
      .from("wallets")
      .select(
        `id,amount,roblox_username,roblox_user_id,roblox_thumb,
         has_commission_free_gamepass,in_blooming,blooming_role,
         in_merkaz,merkaz_role,roblox_confirmed_at,roblox_change_attempt_at,
         inserted_at,updated_at`
      )
      .eq("user_id", user.id)
      .maybeSingle();

    setWallet(data ?? null);

    /* prime the draft fields */
    setAmountDraft(data ? String(data.amount) : "");
    setRobloxDraft(data?.roblox_username ?? "");
    setRobloxId(data?.roblox_user_id ?? null);
    setRobloxThumb(
      data?.roblox_thumb ??
        (data?.roblox_user_id ? avatarSrc(data.roblox_user_id) : null)
    );
    setHasPassDraft(data?.has_commission_free_gamepass ?? false);
    setInBlooming(data?.in_blooming ?? false);
    setBloomRole(data?.blooming_role ?? null);
    setInMerkaz(data?.in_merkaz ?? false);
    setMerkazRole(data?.merkaz_role ?? null);

    if (data?.roblox_username) {
      setRobloxStatus("found");
      setConfirmSelf(true);
    } else {
      setRobloxStatus("idle");
      setConfirmSelf(false);
    }
  };
  useEffect(() => {
    fetchWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /* ── End 3-C ──────────────────────────────────────────── */

  /* ── 3-D: Roblox Lookup (debounced) ───────────────────── */
  const API_URL = `${RENDER_BASE}/lookup`;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const uname = robloxDraft.trim();

    /* unchanged == short-circuit */
    if (wallet && uname === wallet.roblox_username) {
      setRobloxId(wallet.roblox_user_id);
      setRobloxThumb(
        wallet.roblox_thumb ??
          (wallet.roblox_user_id ? avatarSrc(wallet.roblox_user_id) : null)
      );
      setInBlooming(wallet.in_blooming);
      setBloomRole(wallet.blooming_role);
      setInMerkaz(wallet.in_merkaz);
      setMerkazRole(wallet.merkaz_role);
      setRobloxStatus("found");
      setConfirmSelf(true);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!uname) {
      setRobloxStatus("idle");
      setRobloxId(null);
      setRobloxThumb(null);
      setConfirmSelf(false);
      setInBlooming(false);
      setBloomRole(null);
      setInMerkaz(false);
      setMerkazRole(null);
      return;
    }

    setRobloxStatus("loading");
    setConfirmSelf(false);

    debounceRef.current = setTimeout(async () => {
      try {
        const stripped = uname.startsWith("@") ? uname.slice(1) : uname;
        const res = await fetch(
          `${API_URL}?username=${encodeURIComponent(stripped)}`
        );
        const json = await res.json();

        if (res.ok && json.user_id) {
          const idNum = Number(json.user_id);
          setRobloxId(idNum);
          setRobloxThumb(avatarSrc(idNum));
          setInBlooming(json.in_blooming);
          setBloomRole(json.blooming_role);
          setInMerkaz(json.in_merkaz);
          setMerkazRole(json.merkaz_role);
          setRobloxStatus("found");
        } else if (res.status === 404) {
          setRobloxStatus("notfound");
          setRobloxId(null);
          setRobloxThumb(null);
        } else {
          throw new Error();
        }
      } catch {
        setRobloxStatus("error");
        setRobloxId(null);
        setRobloxThumb(null);
      }
    }, 500);
  }, [robloxDraft, wallet, API_URL]);

  /* ── End 3-D ──────────────────────────────────────────── */

  /* ── 3-E: Helper Functions ────────────────────────────── */
  const validAmount = () => {
    const n = parseFloat(amountDraft);
    return Number.isFinite(n) && n >= 0;
  };
  const robloxOK =
    robloxDraft.trim() === ""
      ? true
      : robloxStatus === "found" && confirmSelf;

  const robloxHelper = () => {
    switch (robloxStatus) {
      case "loading":
        return "בודק…";
      case "found":
        return confirmSelf
          ? `אומת (ID: ${robloxId})`
          : `נמצא (ID: ${robloxId}) – נא אשר/י`;
      case "notfound":
        return "לא נמצא";
      case "error":
        return "שגיאה בבדיקה";
      default:
        return "";
    }
  };

  const GroupsBadge = () => (
    <>
      <p className={styles.groupsBadgeItem}>
        Blooming Ent.: {inBlooming ? "✅" : "❌"}
        {inBlooming && bloomRole ? ` — ${bloomRole}` : ""}
      </p>
      <p className={styles.groupsBadgeItem}>
        Merkaz Ent.: {inMerkaz ? "✅" : "❌"}
        {inMerkaz && merkazRole ? ` — ${merkazRole}` : ""}
      </p>
    </>
  );

  /* ── End 3-E ──────────────────────────────────────────── */

  /* ── 3-F: Save & Delete Handlers ──────────────────────── */
  const saveWallet = async () => {
    if (!user) {
      alert("יש להתחבר תחילה.");
      return;
    }
    if (!validAmount()) {
      alert("סכום לא תקין.");
      return;
    }
    if (!robloxOK) {
      alert("יש לאשר שזה הפרופיל שלך.");
      return;
    }

    const amt = parseFloat(amountDraft);
    const robloxName = robloxDraft.trim() || null;
    const nowISO = new Date().toISOString();

    /* --------------- existing wallet --------------- */
    if (wallet) {
      const usernameChanged = robloxName !== wallet.roblox_username;

      /* amount / flags only */
      if (!usernameChanged) {
        await supabase
          .from("wallets")
          .update({
            amount: amt,
            has_commission_free_gamepass: hasPassDraft,
            in_blooming: inBlooming,
            blooming_role: bloomRole,
            in_merkaz: inMerkaz,
            merkaz_role: merkazRole,
          })
          .eq("id", wallet.id);
        await fetchWallet();
        setFormOpen(false);
        return;
      }

      /* username change – enforce locks */
      const confirmedAt = wallet.roblox_confirmed_at
        ? new Date(wallet.roblox_confirmed_at).getTime()
        : null;
      const lastAttemptAt = wallet.roblox_change_attempt_at
        ? new Date(wallet.roblox_change_attempt_at).getTime()
        : null;
      const now = Date.now();

      if (!confirmedAt /* first ever confirm */) {
        await supabase
          .from("wallets")
          .update({
            amount: amt,
            roblox_username: robloxName,
            roblox_user_id: robloxId,
            roblox_thumb: robloxThumb,
            has_commission_free_gamepass: hasPassDraft,
            in_blooming: inBlooming,
            blooming_role: bloomRole,
            in_merkaz: inMerkaz,
            merkaz_role: merkazRole,
            roblox_confirmed_at: nowISO,
            roblox_change_attempt_at: nowISO,
          })
          .eq("id", wallet.id);
        await fetchWallet();
        setFormOpen(false);
        return;
      }

      if (confirmedAt && now - confirmedAt < 24 * 60 * 60 * 1000) {
        alert(
          "אין באפשרותך לשנות את שם המשתמש במשך 24 שעות לאחר האישור האחרון."
        );
        return;
      }

      if (lastAttemptAt && now - lastAttemptAt < 7 * 24 * 60 * 60 * 1000) {
        alert(
          "ניתן לשנות שם משתמש רק פעם אחת בכל שבוע אחרי ניסיון השינוי האחרון."
        );
        return;
      }

      await supabase
        .from("wallets")
        .update({
          amount: amt,
          roblox_username: robloxName,
          roblox_user_id: robloxId,
          roblox_thumb: robloxThumb,
          has_commission_free_gamepass: hasPassDraft,
          in_blooming: inBlooming,
          blooming_role: bloomRole,
          in_merkaz: inMerkaz,
          merkaz_role: merkazRole,
          roblox_confirmed_at: nowISO,
          roblox_change_attempt_at: nowISO,
        })
        .eq("id", wallet.id);
      await fetchWallet();
      setFormOpen(false);
      return;
    }

    /* --------------- insert NEW wallet --------------- */
    await supabase.from("wallets").insert({
      amount: amt,
      roblox_username: robloxName,
      roblox_user_id: robloxId,
      roblox_thumb: robloxThumb,
      has_commission_free_gamepass: hasPassDraft,
      in_blooming: inBlooming,
      blooming_role: bloomRole,
      in_merkaz: inMerkaz,
      merkaz_role: merkazRole,
      roblox_confirmed_at: nowISO,
      roblox_change_attempt_at: nowISO,
      user_id: user.id,
      user_name: profileName,
    });
    await fetchWallet();
    setFormOpen(false);
  };

  /* ───────── DELETE ───────── */
  const deleteWallet = async () => {
    if (!wallet) return;
    if (!confirm("למחוק את הארנק?")) return;
    await supabase.from("wallets").delete().eq("id", wallet.id);
    await fetchWallet();
  };

  /* ── End 3-F ──────────────────────────────────────────── */

  /* ── 3-G: JSX Return ──────────────────────────────────── */
  return (
    <section className={styles.container}>
      {!wallet ? (
        formOpen ? (
          <div className={`${clientStyles.card} ${styles.cardSmall}`}>
            {/* disclaimer omitted for brevity */}
            <input
              type="number"
              className={clientStyles.select}
              min={0}
              value={amountDraft}
              onChange={(e) => setAmountDraft(e.target.value)}
              placeholder="סכום במשחק"
            />
            <input
              type="text"
              className={`${clientStyles.select} ${styles.mtSmall}`}
              value={robloxDraft}
              onChange={(e) => setRobloxDraft(e.target.value)}
              placeholder='שם Roblox ("MyUser" או "@MyUser")'
            />
            <label className={styles.baseLabel}>
              <input
                type="checkbox"
                checked={hasPassDraft}
                onChange={(e) => setHasPassDraft(e.target.checked)}
              />{" "}
              האם ברשותך גיים-פאס ללא עמלות?
            </label>

            {robloxStatus === "found" && robloxThumb && (
              <>
                <Image
                  src={robloxThumb}
                  alt="Avatar"
                  className={styles.avatar}
                  width={120}
                  height={120}
                  unoptimized
                />
                <label className={styles.confirmLabel}>
                  <input
                    type="checkbox"
                    checked={confirmSelf}
                    onChange={(e) => setConfirmSelf(e.target.checked)}
                  />{" "}
                  מאשר/ת שזה הפרופיל שלי
                </label>
                <GroupsBadge />
              </>
            )}

            {robloxDraft && (
              <p className={styles.helperText}>{robloxHelper()}</p>
            )}

            <button
              className={`${clientStyles.saveBtn} ${
                robloxOK
                  ? clientStyles.saveBtnEnabled
                  : clientStyles.saveBtnDisabled
              }`}
              disabled={!robloxOK}
              onClick={saveWallet}
            >
              שמור
            </button>
            <button
              className={`${clientStyles.saveBtn} ${clientStyles.saveBtnEnabled}`}
              onClick={() => setFormOpen(false)}
            >
              ביטול
            </button>
          </div>
        ) : null
      ) : (
        <div className={`${clientStyles.card} ${styles.cardLarge}`}>
          <h3 className={styles.headingNoMargin}>💳 הארנק שלי</h3>
          {!formOpen ? (
            <>
              <p className={styles.amount}>
                {wallet.amount.toLocaleString()} ₪
              </p>
              <p className={styles.gamepass}>
                גיים-פאס ללא עמלות:{" "}
                {wallet.has_commission_free_gamepass ? "✅" : "❌"}
              </p>
              <GroupsBadge />

              {wallet.roblox_username && (
                <>
                  <Image
                    src={wallet.roblox_thumb ?? avatarSrc(wallet.roblox_user_id!)}
                    alt="Avatar"
                    className={`${styles.avatar} ${styles.avatarView}`}
                    width={120}
                    height={120}
                    unoptimized
                  />
                  <p className={styles.username}>
                    <a
                      href={`https://www.roblox.com/users/${wallet.roblox_user_id}/profile`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {wallet.roblox_username}
                    </a>
                  </p>
                  <p className={styles.helperText}>
                    Roblox ID: {wallet.roblox_user_id}
                  </p>
                </>
              )}

              <p className={styles.timestamps}>
                {`נוצר: ${fmtDate(wallet.inserted_at)}\nעודכן: ${fmtDate(
                  wallet.updated_at
                )}`}
              </p>

              <div className={styles.buttonGroup}>
                <button
                  className={`${clientStyles.saveBtn} ${clientStyles.saveBtnEnabled} ${styles.btnMinWidth}`}
                  onClick={() => {
                    setConfirmSelf(Boolean(wallet.roblox_username));
                    setFormOpen(true);
                  }}
                >
                  עדכן
                </button>
                <button
                  className={`${clientStyles.saveBtn} ${clientStyles.saveBtnDisabled} ${styles.btnMinWidth} ${styles.errorBtn}`}
                  onClick={deleteWallet}
                >
                  מחיקה
                </button>
              </div>
            </>
          ) : (
            <>
              <input
                type="number"
                className={clientStyles.select}
                min={0}
                value={amountDraft}
                onChange={(e) => setAmountDraft(e.target.value)}
                placeholder="סכום חדש"
              />
              <input
                type="text"
                className={`${clientStyles.select} ${styles.mtSmall}`}
                value={robloxDraft}
                onChange={(e) => setRobloxDraft(e.target.value)}
                placeholder="שם Roblox"
              />
              <label className={styles.baseLabel}>
                <input
                  type="checkbox"
                  checked={hasPassDraft}
                  onChange={(e) => setHasPassDraft(e.target.checked)}
                />{" "}
                גיים-פאס ללא עמלות?
              </label>

              {robloxStatus === "found" && robloxThumb && (
                <>
                  <Image
                    src={robloxThumb}
                    alt="Avatar"
                    className={styles.avatar}
                    width={120}
                    height={120}
                    unoptimized
                  />
                  <label className={styles.confirmLabel}>
                    <input
                      type="checkbox"
                      checked={confirmSelf}
                      onChange={(e) => setConfirmSelf(e.target.checked)}
                      disabled={wallet.roblox_username === robloxDraft.trim()}
                    />{" "}
                    מאשר/ת שזה הפרופיל שלי
                  </label>
                  {wallet.roblox_username !== robloxDraft.trim() && (
                    <p className={styles.lockMessage}>
                      * לאחר אישור אין באפשרותך לשנות המשתמש למשך 24 שעות, ואחר
                      כך – פעם בשבוע בלבד.
                    </p>
                  )}
                  <GroupsBadge />
                </>
              )}

              {robloxDraft && (
                <p className={styles.helperText}>{robloxHelper()}</p>
              )}

              <button
                className={`${clientStyles.saveBtn} ${
                  robloxOK
                    ? clientStyles.saveBtnEnabled
                    : clientStyles.saveBtnDisabled
                }`}
                disabled={!robloxOK}
                onClick={saveWallet}
              >
                שמור
              </button>
              <button
                className={`${clientStyles.saveBtn} ${clientStyles.saveBtnEnabled}`}
                onClick={() => {
                  setFormOpen(false);
                  fetchWallet();
                }}
              >
                ביטול
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
  /* ── End 3-G ──────────────────────────────────────────── */
}
/* ─── End Section 3 ───────────────────────────────────────── */
