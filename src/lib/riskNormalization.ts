type RiskEntryInput = {
  score?: number | null;
  level?: string | null;
  verified?: boolean | null;
} | null | undefined;

const INFERENTIAL_LEVEL_PATTERNS = [
  /not explicitly stated/i,
  /typically/i,
  /score is/i,
  /based on/i,
  /inferred/i,
  /implied/i,
  /estimated/i,
];

const normalizeWhitespace = (value?: string | null) => String(value || "").replace(/\s+/g, " ").trim();

export const normalizeRiskLevel = (value?: string | null) => {
  const raw = normalizeWhitespace(value).replace(/[.:;,\s]+$/, "");
  if (!raw) return "";
  if (INFERENTIAL_LEVEL_PATTERNS.some((pattern) => pattern.test(raw))) return "";

  const normalized = raw.toLowerCase();

  if (/^(unknown|not assessed|not documented|n\/a|null)$/i.test(raw)) return "";
  if (/^(no|none|negative|absent|no risk)$/i.test(normalized)) return "No Risk";
  if (/^(low|low risk)$/i.test(normalized)) return "Low";
  if (/^(moderate|moderate risk|medium|medium risk)$/i.test(normalized)) return "Moderate";
  if (/^(high|high risk|highest|highest risk|very high|very high risk)$/i.test(normalized)) return "High";

  return "";
};

export const normalizeRiskEntry = <T extends RiskEntryInput>(risk: T) => {
  if (!risk || typeof risk !== "object") {
    return {
      score: null,
      level: "",
      verified: false,
    };
  }

  return {
    ...risk,
    score: typeof risk.score === "number" && Number.isFinite(risk.score) ? risk.score : null,
    level: normalizeRiskLevel(risk.level),
    verified: risk.verified === true,
  };
};
