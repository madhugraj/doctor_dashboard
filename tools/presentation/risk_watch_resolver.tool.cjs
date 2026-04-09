class RiskWatchResolverTool {
  constructor(config = {}) {
    this.name = "Risk Watch Resolver";
    this.version = "1.0.0";
    this.config = config;
  }

  normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  titleCase(value) {
    return this.normalizeWhitespace(value)
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  buildRisk(label, risk = {}) {
    const level = this.titleCase(risk.level || "Unknown");
    const score = typeof risk.score === "number" ? risk.score : null;
    return {
      label,
      level,
      score,
      summary: `${label}: ${level}${score != null ? ` (${score})` : ""}`,
    };
  }

  resolve(data = {}) {
    const riskScores = data.riskWatch || {};
    const items = [
      this.buildRisk("Fall", riskScores.fallRisk),
      this.buildRisk("Aspiration", riskScores.aspirationRisk),
      this.buildRisk("Pressure Ulcer", riskScores.pressureUlcerRisk),
      this.buildRisk("DVT", riskScores.dvtRisk),
    ];

    const highItems = items.filter((item) => item.level === "High");
    const mediumItems = items.filter((item) => item.level === "Medium");
    const ewsScore = typeof riskScores.ewsScore === "number" ? riskScores.ewsScore : null;

    let status = "normal";
    if (ewsScore != null && ewsScore >= 5) status = "critical";
    else if (highItems.length > 0) status = "critical";
    else if (mediumItems.length > 0 || (ewsScore != null && ewsScore > 0)) status = "warning";

    const headlineMetric =
      highItems.length > 0
        ? `${highItems.length}`
        : ewsScore != null && ewsScore > 0
          ? `${ewsScore}`
          : "0";
    const secondaryLine =
      highItems.length > 0
        ? highItems.length === 1
          ? "high-risk signal"
          : "high-risk signals"
        : ewsScore != null && ewsScore > 0
          ? "ews score"
          : "stable watch";

    const supportingPoints = [];
    if (highItems.length > 0) {
      supportingPoints.push(highItems.slice(0, 2).map((item) => item.summary).join(" · "));
    } else {
      const active = items.filter((item) => !/unknown/i.test(item.level));
      if (active.length > 0) {
        supportingPoints.push(active.slice(0, 2).map((item) => item.summary).join(" · "));
      }
    }
    if (ewsScore != null) {
      supportingPoints.push(`EWS ${ewsScore}`);
    }

    return {
      items,
      ewsScore,
      highCount: highItems.length,
      status,
      headlineMetric,
      secondaryLine,
      supportingPoints: supportingPoints.filter(Boolean).slice(0, 2),
    };
  }
}

module.exports = RiskWatchResolverTool;
