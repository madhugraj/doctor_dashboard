class ExternalSourceRankerTool {
  constructor(config = {}) {
    this.name = "External Source Ranker";
    this.version = "1.0.0";
    this.config = config;
  }

  score(item, query = "", context = {}) {
    const text = `${item.title || ""} ${item.snippet || ""}`.toLowerCase();
    const terms = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
    let score = item.confidence || 0.6;
    const knowledgeType = String(context.knowledgeType || "").toLowerCase();
    const section = String(item.source_section || item.title || "").toLowerCase();
    const loweredQuery = String(query || "").toLowerCase();
    const needsStructuredDrugFact = /\b(what does|used for|purpose|why do we need|composition|ingredient|contains|active ingredient|strength|dose|dosage|availability|market|alternative|substitute|replace)\b/.test(loweredQuery);
    const wantsDefinition = /^(what is|what are|explain|define|meaning of)\b/.test(loweredQuery);
    const wantsDosage = /\b(dose|dosage|dose range|how much|units?)\b/.test(loweredQuery);

    for (const term of terms) {
      if (text.includes(term)) score += 0.08;
    }

    if (/pubmed|fda|clinicaltrials|icd|nlm|rxnorm|medlineplus/i.test(section)) score += 0.1;
    if (knowledgeType === "coding_reference" && /icd|nlm/.test(section)) score += 0.3;
    if (knowledgeType === "drug_knowledge" && /fda|dailymed/.test(`${section} ${item.url || ""}`.toLowerCase())) score += 0.25;
    if (knowledgeType === "drug_knowledge" && /rxnorm|medlineplus/.test(`${section} ${item.url || ""}`.toLowerCase())) score += 0.22;
    if (knowledgeType === "drug_comparison" && /rxnorm|medlineplus|fda|dailymed/.test(`${section} ${item.url || ""}`.toLowerCase())) score += 0.24;
    if (knowledgeType === "clinical_explanation" && /pubmed/.test(section)) score += 0.22;
    if (knowledgeType === "clinical_explanation" && /medlineplus/.test(section)) score += 0.12;
    if (knowledgeType === "general_medical_reference" && /medlineplus/.test(section)) score += 0.26;
    if (knowledgeType === "general_medical_reference" && /pubmed/.test(section)) score += 0.06;
    if (knowledgeType === "clinical_explanation" && /fda|dailymed/.test(`${section} ${item.url || ""}`.toLowerCase())) score -= 0.1;
    if (needsStructuredDrugFact && /pubmed/.test(section)) score -= 0.35;
    if (needsStructuredDrugFact && /rxnorm|medlineplus|fda|dailymed/.test(`${section} ${item.url || ""}`.toLowerCase())) score += 0.18;
    if (wantsDefinition && /medlineplus/.test(section)) score += 0.22;
    if (wantsDefinition && /pubmed/.test(section) && !(item.snippet || "").trim()) score -= 0.18;
    if (wantsDosage && /fda|dailymed|medlineplus/.test(`${section} ${item.url || ""}`.toLowerCase())) score += 0.24;
    if (wantsDosage && /rxnorm/.test(`${section} ${item.url || ""}`.toLowerCase())) score -= 0.18;
    if (wantsDosage && /pack|inhalation/i.test(`${item.title || ""} ${item.snippet || ""}`)) score -= 0.45;
    return score;
  }

  rank(results = [], query = "", limit = 8, context = {}) {
    return (Array.isArray(results) ? results : [])
      .map((item) => ({ ...item, confidence: this.score(item, query, context) }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
  }
}

module.exports = ExternalSourceRankerTool;
