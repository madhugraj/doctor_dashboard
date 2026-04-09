/**
 * Risk Scores Extractor Skill
 * Extracts and validates risk scores with cross-verification
 */
const { normalizeRiskEntry } = require("../../lib/clinical/risk_level_normalizer.cjs");

class RiskScoresExtractorSkill {
  constructor(config = {}) {
    this.name = "Risk Scores Extractor";
    this.version = "1.0.0";
    this.config = config;
  }

  /**
   * Execute the skill
   * @param {object} context - { pdfText, gemmaClient, promptBuilder }
   * @returns {Promise<object>}
   */
  async execute(context) {
    const { pdfText, gemmaClient, promptBuilder } = context;

    const prompt = promptBuilder.build("risk_scores_extractor", {
      pdfText: pdfText.slice(0, 8000)
    });

    const result = await gemmaClient.execute(prompt, {
      temperature: 0.1,
      maxTokens: 1000
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        step: "risk_scores_extractor",
        data: null
      };
    }

    // Parse the response
    let data;
    try {
      data = JSON.parse(result.content);
    } catch (e) {
      return {
        success: false,
        error: `Failed to parse JSON: ${e.message}`,
        rawContent: result.content,
        step: "risk_scores_extractor"
      };
    }

    const normalizedData = this.normalize(data);
    const validation = this.validate(normalizedData);

    return {
      success: true,
      step: "risk_scores_extractor",
      data: normalizedData,
      validation: validation,
      usage: result.usage
    };
  }

  normalize(data) {
    return {
      ...data,
      fall_risk: normalizeRiskEntry(data.fall_risk),
      dvt_risk: normalizeRiskEntry(data.dvt_risk),
      pressure_ulcer_risk: normalizeRiskEntry(data.pressure_ulcer_risk),
      aspiration_risk: normalizeRiskEntry(data.aspiration_risk),
    };
  }

  /**
   * Validate extracted risk scores
   */
  validate(data) {
    const issues = [];

    // Check required structures
    if (!data.fall_risk) issues.push("Fall risk not found");
    if (!data.dvt_risk) issues.push("DVT risk not found");

    // Validate score ranges
    if (data.fall_risk?.score !== undefined) {
      if (data.fall_risk.score < 0 || data.fall_risk.score > 30) {
        issues.push(`Fall risk score out of range: ${data.fall_risk.score}`);
      }
    }

    if (data.dvt_risk?.score !== undefined) {
      if (data.dvt_risk.score < 0 || data.dvt_risk.score > 10) {
        issues.push(`DVT risk score out of range: ${data.dvt_risk.score}`);
      }
    }

    if (data.pressure_ulcer_risk?.score !== undefined && data.pressure_ulcer_risk?.score !== null) {
      if (data.pressure_ulcer_risk.score < 0 || data.pressure_ulcer_risk.score > 23) {
        issues.push(`Pressure ulcer score out of range: ${data.pressure_ulcer_risk.score}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues: issues,
      confidence: issues.length === 0 ? "high" : "medium"
    };
  }
}

module.exports = RiskScoresExtractorSkill;
