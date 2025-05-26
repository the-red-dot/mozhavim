// ────────────────────────────────────────────
// src/app/utils/pricing.ts
// ────────────────────────────────────────────
/*
  ➊ representativePrice – מחיר “גולמי” מדיסקורד (EWMA + Winsor)
  ➋ consensusStats      – ממוצע קהילה + CV + גודל-מדגם
  ➌ blendPrices         – שקלול דיסקורד-קהילה
*/

export interface QuotePoint {
    /** Price in “regular” currency */
    price: number;
    date: Date | string;
  }
  
  /* ╭──────────────────────┐
     │ 1. דיסקורד : EWMA   │
     ╰──────────────────────┘ */
  const HALF_LIFE_MO = 1;
  const ALPHA = 0.6;
  const CLIP_SIGMA = 2.5;
  
  const ageInMonths = (then: Date, now = new Date()) =>
    (now.getFullYear() - then.getFullYear()) * 12 +
    (now.getMonth() - then.getMonth()) +
    (now.getDate() - then.getDate()) / 30.44;
  
  const weight = (ageMo: number) => Math.pow(0.5, (ALPHA * ageMo) / HALF_LIFE_MO);
  
  /** מחיר מנוכה-רעש, או null אם < 3 נקודות */
  export function representativePrice(points: QuotePoint[]): number | null {
    const pts: { p: number; d: Date }[] = [];
  
    for (const q of points ?? []) {
      const p = +q.price;
      if (!Number.isFinite(p) || p <= 0) continue;
      const d = q.date instanceof Date ? q.date : new Date(q.date);
      if (Number.isNaN(+d)) continue;
      pts.push({ p, d });
    }
    if (pts.length < 3) return null;
  
    const w = pts.map(({ d }) => weight(ageInMonths(d)));
    const W = w.reduce((a, b) => a + b, 0);
  
    const μ0 = pts.reduce((s, { p }, i) => s + p * w[i], 0) / W;
    const σ0 =
      Math.sqrt(pts.reduce((s, { p }, i) => s + (p - μ0) ** 2 * w[i], 0) / W) ||
      1;
  
    const lo = μ0 - CLIP_SIGMA * σ0;
    const hi = μ0 + CLIP_SIGMA * σ0;
  
    const μ =
      pts.reduce((s, { p }, i) => {
        const c = Math.min(hi, Math.max(lo, p)); // winsorise
        return s + c * w[i];
      }, 0) / W;
  
    return Math.round(μ);
  }
  
  /* ╭──────────────────────────────┐
     │ 2. קהילה : μ , σ , CV , n   │
     ╰──────────────────────────────┘ */
  export interface ConsensusStats {
    price: number | null;
    cv: number | null;
    n: number;
  }
  
  /** ממוצע + CV + גודל-מדגם */
  export function consensusStats(values: number[]): ConsensusStats {
    const nums = values.filter((v) => Number.isFinite(v) && v > 0);
    const n = nums.length;
  
    if (n < 3) return { price: null, cv: null, n };
  
    const μ = nums.reduce((a, b) => a + b, 0) / n;
    const σ = Math.sqrt(nums.reduce((s, x) => s + (x - μ) ** 2, 0) / n);
    const cv = σ / μ;
  
    return { price: Math.round(μ), cv, n };
  }
  
  /* ╭───────────────────────────────────────────┐
     │ 3. בלנד דיסקורד-קהילה → מחיר סופי        │
     ╰───────────────────────────────────────────┘ */
  export interface BlendedPrice {
    final: number | null;
    weightD: number;
    weightC: number;
    discord: ConsensusStats;
    community: ConsensusStats;
  }
  
  export const BLEND_CFG = {
    baseDiscord: 1.0, // b_D
    baseCommunity: 0.8, // b_C
    saturationK: 5, // k – גודל מדגם “רוויה”
  };
  
  /** משקל ∝ b · n/(n+k) · 1/(1+CV) */
  function calcWeight({ n, cv }: ConsensusStats, base: number, k: number) {
    if (!n || n < 3 || cv === null) return 0;
    return base * (n / (n + k)) * (1 / (1 + cv));
  }
  
  /** שקול דיסקורד-קהילה והחזר מחיר סופי + משקלים */
  export function blendPrices(
    discord: ConsensusStats,
    community: ConsensusStats
  ): BlendedPrice {
    const wD = calcWeight(discord, BLEND_CFG.baseDiscord, BLEND_CFG.saturationK);
    const wC = calcWeight(
      community,
      BLEND_CFG.baseCommunity,
      BLEND_CFG.saturationK
    );
  
    const Z = wD + wC;
    const nD = Z ? wD / Z : 0;
    const nC = Z ? wC / Z : 0;
  
    const final =
      discord.price !== null && community.price !== null && Z
        ? Math.round(discord.price * nD + community.price * nC)
        : discord.price ?? community.price ?? null;
  
    return { final, weightD: nD, weightC: nC, discord, community };
  }
  