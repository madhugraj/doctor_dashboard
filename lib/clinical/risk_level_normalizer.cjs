const INFERENTIAL_LEVEL_PATTERNS = [
  /not explicitly stated/i,
  /typically/i,
  /score is/i,
  /based on/i,
  /inferred/i,
  /implied/i,
  /estimated/i,
];

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeRiskLevel(value) {
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
}

function normalizeRiskEntry(risk) {
  if (!risk || typeof risk !== "object") {
    return {
      score: null,
      level: "",
      verified: false,
    };
  }

  const score = typeof risk.score === "number" && Number.isFinite(risk.score) ? risk.score : null;

  return {
    ...risk,
    score,
    level: normalizeRiskLevel(risk.level),
    verified: risk.verified === true,
  };
}

module.exports = {
  normalizeRiskEntry,
  normalizeRiskLevel,
};
