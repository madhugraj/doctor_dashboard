const GemmaClientTool = require("../llm/gemma_client.tool.cjs");

class QueryClassifierTool {
  constructor(config = {}) {
    this.name = "Query Classifier";
    this.version = "2.0.0";
    this.config = config;
    this.gemmaClient = new GemmaClientTool(config.gemma || {});
  }

  buildMessages(message, sectionContext = "") {
    const schema = `{
  "intent": "patient_fact" | "patient_trend" | "drug_safety" | "diagnosis_code" | "guideline_query" | "literature_query" | "mixed_context" | "clinical_explanation" | "vital_normality" | "medication_comparison" | "medication_substitution" | "action_request" | "out_of_scope",
  "needsInternal": boolean,
  "needsExternal": boolean,
  "isActionRequest": boolean,
  "sectionHints": string[],
  "outOfScope": boolean,
  "factField": "patient_name" | "mrn" | "age" | "gender" | "admission_date" | "discharge_date" | "principal_diagnosis" | null,
  "responseStyle": "default" | "factoid" | "mixed_explanatory" | "comparison",
  "needsClarification": boolean,
  "clarificationPrompt": string,
  "requiresExternalConsent": boolean
}`;

    const system = `You are a clinical chat routing planner for a doctor dashboard.

Return JSON only. No prose. No markdown fences.

Use this exact schema:
${schema}

Routing policy:
- Patient-specific facts from the chart: internal only.
- General medical knowledge beyond the chart: external search allowed.
- In this dashboard, questions like "what is the treatment plan?", "what lab tests were done?", "what investigations were ordered?", and "what medications are prescribed?" should default to the active patient record and should not ask which patient.
- Drug composition, ingredients, formulation, pack size, market availability: usually external search.
- Questions like "is the BP normal?" or "is pulse normal?" are vital_normality and should stay internal if the chart has the measurement.
- Questions like "is X an alternative to Y?" or "can I replace X with Y?" are medication_comparison or medication_substitution.
- If the drug/question is ambiguous, ask clarification first.
- If the user wants general explanation of a patient-specific issue with a concrete concern, use clinical_explanation + mixed_explanatory.
- If the explanatory question is vague and lacks the concrete concern, ask clarification.
- Direct fact lookups like patient name, age, MRN, admission date, discharge date, principal diagnosis must use responseStyle "factoid" and set factField.
- If the user asks to suggest, flag, update, document, or export, mark action_request.
- sectionHints may include only: patient, vitals, diagnosis, medications, labs, radiology, treatment, notes, discharge, followup.
- If the question is not about patient care or medicine, mark out_of_scope.

Examples:
User: "Age of the patient?"
Context: none
Output: {"intent":"patient_fact","needsInternal":true,"needsExternal":false,"isActionRequest":false,"sectionHints":["patient"],"outOfScope":false,"factField":"age","responseStyle":"factoid","needsClarification":false,"clarificationPrompt":"","requiresExternalConsent":false}

User: "What is the composition for: T.CILACAR M?"
Context: medications
Output: {"intent":"drug_safety","needsInternal":true,"needsExternal":true,"isActionRequest":false,"sectionHints":["medications"],"outOfScope":false,"factField":null,"responseStyle":"default","needsClarification":false,"clarificationPrompt":"","requiresExternalConsent":true}

User: "Does it come in 100ML as well in market?"
Context: medications
Output: {"intent":"drug_safety","needsInternal":true,"needsExternal":false,"isActionRequest":false,"sectionHints":["medications"],"outOfScope":false,"factField":null,"responseStyle":"default","needsClarification":true,"clarificationPrompt":"Which medication are you asking about? I can look up formulation or pack-size information from approved references once you name the drug.","requiresExternalConsent":false}

User: "The patient's bp is less than reference, why?"
Context: vitals
Output: {"intent":"clinical_explanation","needsInternal":true,"needsExternal":true,"isActionRequest":false,"sectionHints":["vitals"],"outOfScope":false,"factField":null,"responseStyle":"mixed_explanatory","needsClarification":false,"clarificationPrompt":"","requiresExternalConsent":false}

User: "Is the BP normal for the patient?"
Context: vitals
Output: {"intent":"vital_normality","needsInternal":true,"needsExternal":false,"isActionRequest":false,"sectionHints":["vitals"],"outOfScope":false,"factField":null,"responseStyle":"default","needsClarification":false,"clarificationPrompt":"","requiresExternalConsent":false}

User: "What is the treatment plan?"
Context: none
Output: {"intent":"patient_fact","needsInternal":true,"needsExternal":false,"isActionRequest":false,"sectionHints":["treatment"],"outOfScope":false,"factField":null,"responseStyle":"default","needsClarification":false,"clarificationPrompt":"","requiresExternalConsent":false}

User: "What lab tests were done?"
Context: none
Output: {"intent":"patient_fact","needsInternal":true,"needsExternal":false,"isActionRequest":false,"sectionHints":["labs"],"outOfScope":false,"factField":null,"responseStyle":"default","needsClarification":false,"clarificationPrompt":"","requiresExternalConsent":false}

User: "Is PAN D an alternative to PAN 40?"
Context: medications
Output: {"intent":"medication_comparison","needsInternal":true,"needsExternal":true,"isActionRequest":false,"sectionHints":["medications"],"outOfScope":false,"factField":null,"responseStyle":"comparison","needsClarification":false,"clarificationPrompt":"","requiresExternalConsent":true}

User: "Will PAN D be an alternative?"
Context: medications
Output: {"intent":"medication_comparison","needsInternal":true,"needsExternal":false,"isActionRequest":false,"sectionHints":["medications"],"outOfScope":false,"factField":null,"responseStyle":"comparison","needsClarification":true,"clarificationPrompt":"Which current medication are you comparing it with? Please name both medicines, for example: Is PAN D an alternative to PAN 40?","requiresExternalConsent":false}

User: "Why is this happening?"
Context: none
Output: {"intent":"clinical_explanation","needsInternal":true,"needsExternal":false,"isActionRequest":false,"sectionHints":[],"outOfScope":false,"factField":null,"responseStyle":"mixed_explanatory","needsClarification":true,"clarificationPrompt":"Do you want a general medical explanation from approved references? If yes, tell me the specific concern, for example low BP, high pulse, fever, or abnormal creatinine.","requiresExternalConsent":false}`;

    const user = `Current dashboard section context: ${sectionContext || "none"}
User message: ${message}

Return JSON only.`;

    return [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
  }

  defaultResult() {
    return {
      intent: "patient_fact",
      needsInternal: true,
      needsExternal: false,
      isActionRequest: false,
      sectionHints: [],
      outOfScope: false,
      factField: null,
      responseStyle: "default",
      needsClarification: false,
      clarificationPrompt: "",
      requiresExternalConsent: false,
    };
  }

  sanitize(raw = {}) {
    const validIntents = new Set([
      "patient_fact",
      "patient_trend",
      "drug_safety",
      "diagnosis_code",
      "guideline_query",
      "literature_query",
      "mixed_context",
      "clinical_explanation",
      "vital_normality",
      "medication_comparison",
      "medication_substitution",
      "action_request",
      "out_of_scope",
    ]);
    const validFactFields = new Set([
      "patient_name",
      "mrn",
      "age",
      "gender",
      "admission_date",
      "discharge_date",
      "principal_diagnosis",
      null,
    ]);
    const validStyles = new Set(["default", "factoid", "mixed_explanatory", "comparison"]);

    const result = this.defaultResult();
    result.intent = validIntents.has(raw.intent) ? raw.intent : result.intent;
    result.needsInternal = Boolean(raw.needsInternal);
    result.needsExternal = Boolean(raw.needsExternal);
    result.isActionRequest = Boolean(raw.isActionRequest);
    result.sectionHints = Array.isArray(raw.sectionHints)
      ? raw.sectionHints.map((item) => String(item || "").toLowerCase()).filter(Boolean)
      : [];
    result.outOfScope = Boolean(raw.outOfScope);
    result.factField = validFactFields.has(raw.factField) ? raw.factField : null;
    result.responseStyle = validStyles.has(raw.responseStyle) ? raw.responseStyle : "default";
    result.needsClarification = Boolean(raw.needsClarification);
    result.clarificationPrompt = raw.needsClarification ? String(raw.clarificationPrompt || "").trim() : "";
    result.requiresExternalConsent = Boolean(raw.requiresExternalConsent);

    if (result.intent === "out_of_scope") {
      result.outOfScope = true;
      result.needsInternal = false;
      result.needsExternal = false;
    }

    if (result.factField) {
      result.intent = result.intent === "out_of_scope" ? "patient_fact" : result.intent;
      result.responseStyle = "factoid";
      result.needsInternal = true;
    }

    if (result.intent === "action_request") {
      result.isActionRequest = true;
    }

    if (result.needsExternal && !result.needsClarification && !result.outOfScope) {
      result.requiresExternalConsent = true;
    }

    return result;
  }

  extractJson(content = "") {
    const text = String(content || "").trim();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {}

    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch?.[1]) {
      try {
        return JSON.parse(fenceMatch[1].trim());
      } catch {}
    }

    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = text.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(candidate);
      } catch {}
    }

    return null;
  }

  async repairJson(rawContent) {
    const repairMessages = [
      {
        role: "system",
        content:
          'Convert the following planner output into valid JSON only. Preserve the original intent. Return one valid JSON object only with keys: intent, needsInternal, needsExternal, isActionRequest, sectionHints, outOfScope, factField, responseStyle, needsClarification, clarificationPrompt, requiresExternalConsent.',
      },
      {
        role: "user",
        content: String(rawContent || ""),
      },
    ];

    const repaired = await this.gemmaClient.executeChat(repairMessages, {
      temperature: 0.0,
      maxTokens: 300,
    });

    if (!repaired.success) return null;
    return this.extractJson(repaired.content);
  }

  async classify(message, sectionContext = "") {
    const messages = this.buildMessages(message, sectionContext);
    const result = await this.gemmaClient.executeChat(messages, {
      temperature: 0.0,
      maxTokens: 400,
    });

    if (!result.success) {
      return this.defaultResult();
    }

    let parsed = this.extractJson(result.content);
    if (!parsed) {
      parsed = await this.repairJson(result.content);
    }

    return parsed ? this.sanitize(parsed) : this.defaultResult();
  }
}

module.exports = QueryClassifierTool;
