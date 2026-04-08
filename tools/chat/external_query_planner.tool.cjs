const GemmaClientTool = require("../llm/gemma_client.tool.cjs");

class ExternalQueryPlannerTool {
  constructor(config = {}) {
    this.name = "External Query Planner";
    this.version = "1.0.0";
    this.config = config;
    this.gemmaClient = new GemmaClientTool(config.gemma || {});
  }

  buildDeterministicDrugQueries(entity = "", query = "") {
    const base = String(entity || "").trim();
    const lower = String(query || "").toLowerCase();
    const variants = [];
    if (!base) return variants;

    if (/\b(composition|ingredient|contains|active ingredient)\b/.test(lower)) {
      variants.push(`${base} composition`, `${base} active ingredient`, `${base} generic name`);
    } else if (/\b(dose|dosage|dose range|how much|units?)\b/.test(lower)) {
      variants.push(`${base} dosage and administration`, `${base} dosing`, `${base} injection dosage`);
    } else if (/\b(what does|used for|purpose|why do we need|role|indication)\b/.test(lower)) {
      variants.push(`${base} indication`, `${base} uses`, `${base} drug label`);
    } else if (/\b(come with|come in|strength|dose|dosage|syrup|tablet|injection|availability|market|formulation)\b/.test(lower)) {
      variants.push(`${base} available strengths`, `${base} dosage form`, `${base} formulation`);
    } else if (/\b(alternative|substitute|replace|equivalent)\b/.test(lower)) {
      variants.push(`${base} therapeutic alternative`, `${base} substitute`, `${base} equivalent`);
    } else {
      variants.push(base, `${base} drug information`);
    }

    return Array.from(new Set(variants.filter(Boolean)));
  }

  stripQuestionLead(query = "") {
    return String(query || "")
      .replace(/^(?:what is|what are|explain|define|meaning of)\s+/i, "")
      .replace(/\?+$/g, "")
      .trim();
  }

  defaultPlan(query = "", classification = {}) {
    const intent = classification?.intent || "mixed_context";
    const trimmed = String(query || "").trim();
    const lower = trimmed.toLowerCase();

    const strippedDiagnosisEntity = trimmed
      .replace(/what\s+is\s+the\s+icd(?:-10)?\s+code\s+for[:\s]*/i, "")
      .replace(/icd(?:-10)?\s+code\s+for[:\s]*/i, "")
      .replace(/\?+$/g, "")
      .trim();

    if (intent === "diagnosis_code") {
      return {
        knowledge_type: "coding_reference",
        entity: strippedDiagnosisEntity || trimmed,
        search_queries: [strippedDiagnosisEntity || trimmed, `${strippedDiagnosisEntity || trimmed} ICD-10-CM`],
        source_preferences: ["icd"],
        needs_clarification: false,
        clarification_prompt: "",
      };
    }

    if (intent === "literature_query" || intent === "guideline_query") {
      return {
        knowledge_type: intent === "guideline_query" ? "guideline_reference" : "literature_reference",
        entity: trimmed,
        search_queries: [trimmed],
        source_preferences: ["pubmed"],
        needs_clarification: false,
        clarification_prompt: "",
      };
    }

    if (intent === "drug_safety") {
      const entity = trimmed.replace(/\?+$/g, "").trim();
      return {
        knowledge_type: "drug_knowledge",
        entity,
        search_queries: this.buildDeterministicDrugQueries(entity, trimmed),
        source_preferences: ["rxnorm", "medlineplus", "openfda"],
        needs_clarification: false,
        clarification_prompt: "",
      };
    }

    if (intent === "medication_comparison" || intent === "medication_substitution") {
      return {
        knowledge_type: "drug_comparison",
        entity: trimmed.replace(/\?+$/g, "").trim(),
        search_queries: [trimmed.replace(/\?+$/g, "").trim(), `${trimmed.replace(/\?+$/g, "").trim()} generic composition`],
        source_preferences: ["rxnorm", "medlineplus", "openfda"],
        needs_clarification: false,
        clarification_prompt: "",
      };
    }

    if (intent === "clinical_explanation") {
      if (/^(what is|what are|explain|define|meaning of)\b/i.test(lower)) {
        const entity = this.stripQuestionLead(trimmed);
        return {
          knowledge_type: "general_medical_reference",
          entity: entity || trimmed,
          search_queries: [entity || trimmed, `${entity || trimmed} overview`, `${entity || trimmed} symptoms causes`],
          source_preferences: ["medlineplus", "pubmed"],
          needs_clarification: false,
          clarification_prompt: "",
        };
      }
      if ((lower.includes("bp") || lower.includes("blood pressure")) && (lower.includes("low") || lower.includes("less than") || lower.includes("below"))) {
        return {
          knowledge_type: "clinical_explanation",
          entity: "low blood pressure",
          search_queries: ["hypotension causes adults review", "low blood pressure causes adults"],
          source_preferences: ["pubmed", "medlineplus"],
          needs_clarification: false,
          clarification_prompt: "",
        };
      }
      if ((lower.includes("bp") || lower.includes("blood pressure")) && (lower.includes("high") || lower.includes("above") || lower.includes("elevated"))) {
        return {
          knowledge_type: "clinical_explanation",
          entity: "high blood pressure",
          search_queries: ["hypertension causes adults review", "high blood pressure causes adults"],
          source_preferences: ["pubmed", "medlineplus"],
          needs_clarification: false,
          clarification_prompt: "",
        };
      }
      return {
        knowledge_type: "clinical_explanation",
        entity: trimmed,
        search_queries: [trimmed, `general medical explanation for ${trimmed}`],
        source_preferences: ["pubmed", "medlineplus"],
        needs_clarification: false,
        clarification_prompt: "",
      };
    }

    return {
      knowledge_type: "general_medical_reference",
      entity: trimmed,
      search_queries: [trimmed],
      source_preferences: ["medlineplus", "pubmed", "openfda"],
      needs_clarification: false,
      clarification_prompt: "",
    };
  }

  buildMessages(query, classification = {}) {
const schema = `{
  "knowledge_type": "drug_knowledge" | "drug_comparison" | "coding_reference" | "literature_reference" | "guideline_reference" | "clinical_explanation" | "trial_reference" | "general_medical_reference",
  "entity": string,
  "search_queries": string[],
  "source_preferences": ("rxnorm" | "medlineplus" | "openfda" | "pubmed" | "icd" | "clinicaltrials")[],
  "needs_clarification": boolean,
  "clarification_prompt": string
}`;

    const system = `You are an external medical search planner for a doctor dashboard.

Return JSON only. No prose. No markdown fences.

Use this exact schema:
${schema}

Rules:
- Plan search only for general medical knowledge beyond the uploaded record.
- Prefer short, high-signal search queries.
- For drug composition, formulation, purpose, and adverse effects:
  - knowledge_type = "drug_knowledge"
  - prefer sources ["rxnorm","medlineplus","openfda"]
- For medication comparison or substitution:
  - knowledge_type = "drug_comparison"
  - prefer sources ["rxnorm","medlineplus","openfda"]
- For ICD or diagnosis code lookups:
  - knowledge_type = "coding_reference"
  - prefer ["icd"]
- For general clinical explanations:
  - knowledge_type = "clinical_explanation"
  - prefer ["pubmed","medlineplus"]
- For research / trials:
  - knowledge_type = "trial_reference"
  - prefer ["clinicaltrials","pubmed"]
- If the question is too vague to search safely, set needs_clarification=true.
- Never include internal chart data in the search plan.

Examples:
Question: "What is the composition for T.CILACAR M?"
Output: {"knowledge_type":"drug_knowledge","entity":"T.CILACAR M","search_queries":["T.CILACAR M composition","T.CILACAR M active ingredient","T.CILACAR M generic name"],"source_preferences":["rxnorm","medlineplus","openfda"],"needs_clarification":false,"clarification_prompt":""}

Question: "What does mannitol do?"
Output: {"knowledge_type":"drug_knowledge","entity":"mannitol","search_queries":["mannitol indication","mannitol uses","mannitol drug label"],"source_preferences":["rxnorm","medlineplus","openfda"],"needs_clarification":false,"clarification_prompt":""}

Question: "What is the ICD code for multiple myeloma?"
Output: {"knowledge_type":"coding_reference","entity":"multiple myeloma","search_queries":["multiple myeloma ICD 10"],"source_preferences":["icd"],"needs_clarification":false,"clarification_prompt":""}

Question: "Is PAN D an alternative to PAN 40?"
Output: {"knowledge_type":"drug_comparison","entity":"PAN D vs PAN 40","search_queries":["PAN D alternative to PAN 40","pantoprazole domperidone versus pantoprazole 40 mg"],"source_preferences":["rxnorm","medlineplus","openfda"],"needs_clarification":false,"clarification_prompt":""}

Question: "Why is low blood pressure seen in adults?"
Output: {"knowledge_type":"clinical_explanation","entity":"low blood pressure","search_queries":["common causes of low blood pressure adults","hypotension causes adults"],"source_preferences":["pubmed","medlineplus"],"needs_clarification":false,"clarification_prompt":""}`;

    const user = `Question: ${String(query || "").trim()}
Intent hint: ${classification?.intent || "unknown"}

Return JSON only.`;

    return [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
  }

  extractJson(content = "") {
    const text = String(content || "").trim();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {}

    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1));
      } catch {}
    }

    return null;
  }

  sanitize(raw = {}, query = "", classification = {}) {
    const validTypes = new Set([
      "drug_knowledge",
      "drug_comparison",
      "coding_reference",
      "literature_reference",
      "guideline_reference",
      "clinical_explanation",
      "trial_reference",
      "general_medical_reference",
    ]);
    const validSources = new Set(["rxnorm", "medlineplus", "openfda", "pubmed", "icd", "clinicaltrials"]);
    const fallback = this.defaultPlan(query, classification);

    const plan = {
      knowledge_type: validTypes.has(raw.knowledge_type) ? raw.knowledge_type : fallback.knowledge_type,
      entity: String(raw.entity || fallback.entity || "").trim(),
      search_queries: Array.isArray(raw.search_queries)
        ? raw.search_queries.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6)
        : [],
      source_preferences: Array.isArray(raw.source_preferences)
        ? raw.source_preferences.map((item) => String(item || "").trim().toLowerCase()).filter((item) => validSources.has(item))
        : [],
      needs_clarification: Boolean(raw.needs_clarification),
      clarification_prompt: raw.needs_clarification ? String(raw.clarification_prompt || "").trim() : "",
    };

    if (!plan.search_queries.length) plan.search_queries = fallback.search_queries;
    if (plan.knowledge_type === "drug_knowledge" || plan.knowledge_type === "drug_comparison") {
      plan.search_queries = Array.from(
        new Set([
          ...this.buildDeterministicDrugQueries(plan.entity || fallback.entity, query),
          ...plan.search_queries,
        ].filter(Boolean))
      ).slice(0, 6);
    }
    if (!plan.source_preferences.length) plan.source_preferences = fallback.source_preferences;
    if (!plan.entity) plan.entity = fallback.entity;
    if (!plan.clarification_prompt && plan.needs_clarification) {
      plan.clarification_prompt = "Please clarify the exact medical topic you want me to search externally.";
    }

    if (plan.knowledge_type === "coding_reference") {
      const entity = plan.entity || fallback.entity || String(query || "").trim();
      plan.search_queries = Array.from(
        new Set([
          entity,
          `${entity} ICD-10-CM`,
          ...plan.search_queries,
        ].filter(Boolean))
      ).slice(0, 4);
    }

    return plan;
  }

  async repairJson(rawContent) {
    const repairMessages = [
      {
        role: "system",
        content:
          'Convert the following external search plan into valid JSON only. Return one JSON object with keys: knowledge_type, entity, search_queries, source_preferences, needs_clarification, clarification_prompt.',
      },
      {
        role: "user",
        content: String(rawContent || ""),
      },
    ];

    const repaired = await this.gemmaClient.executeChat(repairMessages, {
      temperature: 0.0,
      maxTokens: 250,
    });

    if (!repaired.success) return null;
    return this.extractJson(repaired.content);
  }

  async plan(query, classification = {}) {
    const fallback = this.defaultPlan(query, classification);
    const result = await this.gemmaClient.executeChat(this.buildMessages(query, classification), {
      temperature: 0.0,
      maxTokens: 350,
    });

    if (!result.success) {
      return fallback;
    }

    let parsed = this.extractJson(result.content);
    if (!parsed) {
      parsed = await this.repairJson(result.content);
    }

    return parsed ? this.sanitize(parsed, query, classification) : fallback;
  }
}

module.exports = ExternalQueryPlannerTool;
