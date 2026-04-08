const GemmaClientTool = require("../tools/llm/gemma_client.tool.cjs");
const GeminiClientTool = require("../tools/llm/gemini_client.tool.cjs");
const ChatPromptBuilderTool = require("../tools/chat/chat_prompt_builder.tool.cjs");
const CitationAssemblerTool = require("../tools/chat/citation_assembler.tool.cjs");
const DrugFactExtractorTool = require("../tools/chat/drug_fact_extractor.tool.cjs");

class AnswerComposerAgent {
  constructor(config = {}) {
    this.name = "Answer Composer Agent";
    this.version = "1.0.0";
    this.gemmaClient = new GemmaClientTool(config.gemma || {});
    this.geminiClient = new GeminiClientTool(config.gemini || {});
    this.promptBuilder = new ChatPromptBuilderTool(config);
    this.citationAssembler = new CitationAssemblerTool(config);
    this.drugFactExtractor = new DrugFactExtractorTool(config);
  }

  buildFactAnswer(classification, internalEvidence = []) {
    const field = classification?.factField;
    if (!field || !internalEvidence.length) return null;

    const matchesField = (item) => {
      const label = String(item?.label || "").toLowerCase();
      const section = String(item?.section || "").toLowerCase();
      const sourceSection = String(item?.source_section || "").toLowerCase();

      if (field === "patient_name") return label.includes("patient name") || section === "patient";
      if (field === "mrn") return label.includes("medical record number") || label.includes("mrn");
      if (field === "age") return label.includes("age");
      if (field === "gender") return label.includes("gender");
      if (field === "admission_date") return label.includes("admission date");
      if (field === "discharge_date") return label.includes("discharge date");
      if (field === "principal_diagnosis") return section === "diagnosis" || sourceSection.includes("diagnosis");
      return false;
    };

    const evidence = internalEvidence.find(matchesField) || internalEvidence[0];
    const value = String(evidence?.value || "").trim();
    if (!value) return null;

    const answerByField = {
      patient_name: value,
      mrn: value,
      age: value,
      gender: value,
      admission_date: value,
      discharge_date: value,
      principal_diagnosis: value,
    };

    const answer = answerByField[field] || value;
    return {
      answer,
      citations: this.citationAssembler.assemble([evidence], { max: 1 }),
      source_class: "internal",
    };
  }

  firstSentence(text = "", maxLength = 220) {
    const cleaned = String(text || "").replace(/\s+/g, " ").trim();
    if (!cleaned) return "";
    const sentence = cleaned.match(/.+?[.!?](?:\s|$)/)?.[0]?.trim() || cleaned;
    return sentence.length > maxLength ? `${sentence.slice(0, maxLength - 1).trim()}…` : sentence;
  }

  compactSentences(text = "", maxSentences = 2, maxLength = 320) {
    const cleaned = String(text || "").replace(/\s+/g, " ").trim();
    if (!cleaned) return "";
    const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [cleaned];
    const compact = sentences.slice(0, maxSentences).map((item) => item.trim()).join(" ");
    return compact.length > maxLength ? `${compact.slice(0, maxLength - 1).trim()}…` : compact;
  }

  bestExternalSummary(item = {}) {
    const preferred = [item.value, item.source_excerpt].map((value) => String(value || "").trim()).filter(Boolean);
    for (const candidate of preferred) {
      const sentence = this.firstSentence(candidate);
      if (sentence) return sentence;
    }
    return "";
  }

  extractIcdCode(externalEvidence = []) {
    const pattern = /\b[A-TV-Z][0-9][0-9AB](?:\.[0-9A-Z]{1,4})?\b/;
    for (const item of externalEvidence) {
      const match = `${item.label || ""} ${item.value || ""} ${item.source_excerpt || ""}`.match(pattern);
      if (match) return match[0];
    }
    return "";
  }

  buildClinicalExplanationAnswer(message, internalEvidence = [], externalEvidence = []) {
    const lower = String(message || "").toLowerCase();
    const topInternal = internalEvidence[0];
    const topExternal = externalEvidence[0];
    const internalLine = topInternal?.value ? `Patient Record: ${topInternal.value}.` : "";

    if (!topExternal) {
      return null;
    }

    if ((lower.includes("low") || lower.includes("less than") || lower.includes("below")) && /\b1[4-9]\d\b|\b160\b|\b170\b|\b180\b/.test(String(topInternal?.value || ""))) {
      return {
        answer: `${internalLine} The chart does not show low blood pressure in this record. External Reference: Common causes of hypotension in adults include dehydration, sepsis, blood loss, medication effects, and endocrine or cardiac causes.`,
        citations: this.citationAssembler.assemble([topInternal, ...externalEvidence], { max: 4 }),
        source_class: "mixed",
      };
    }

    const externalLine = this.bestExternalSummary(topExternal);
    if (!externalLine) return null;

    return {
      answer: internalLine ? `${internalLine}\n\nExternal Reference: ${externalLine}` : `External Reference: ${externalLine}`,
      citations: this.citationAssembler.assemble([topInternal, ...externalEvidence].filter(Boolean), { max: 4 }),
      source_class: topInternal ? "mixed" : "external",
    };
  }

  buildDrugKnowledgeAnswer(message, internalEvidence = [], externalEvidence = [], resolution = null) {
    if (!externalEvidence.length) return null;

    const topInternal = internalEvidence[0];
    const extracted = this.drugFactExtractor.extract({ message, externalEvidence, resolution });
    let externalLine = extracted?.answer || "";
    const combinedExternal = externalEvidence.map((item) => `${item.value || ""} ${item.source_excerpt || ""}`).join(" ").toLowerCase();
    const generic = resolution?.generic_name || resolution?.normalized_display || "";

    if (!externalLine && /\b(what does|used for|purpose|why do we need|role)\b/i.test(String(message || "")) && generic) {
      if (/inhibits gastric acid secretion|proton pump inhibitor|ppi/.test(combinedExternal)) {
        externalLine = `${generic} reduces gastric acid secretion and is used for acid-related disorders.`;
      } else if (/thyroxine|thyroid gland|synthetic t4|tetraiodothyronine/.test(combinedExternal)) {
        externalLine = `${generic} is synthetic thyroid hormone replacement.`;
      } else if (/amoxicillin|clavulanate|antibiotic|antibacterial/.test(combinedExternal)) {
        externalLine = `${generic} is an antibiotic used for bacterial infections.`;
      } else if (/loop diuretic/.test(combinedExternal)) {
        externalLine = `${generic} is a loop diuretic used to remove excess fluid.`;
      } else if (/osmotic/.test(combinedExternal) && /diuretic|pressure/.test(combinedExternal)) {
        externalLine = `${generic} is used to reduce intracranial or intraocular pressure and promote diuresis.`;
      }
    }

    if (!externalLine) {
      externalLine = this.bestExternalSummary(externalEvidence[0]);
    }

    if (!externalLine) return null;

    return {
      answer: `External Reference: ${externalLine}`,
      citations: this.citationAssembler.assemble(extracted?.citations || externalEvidence, { max: 4 }),
      source_class: "external",
    };
  }

  buildCodingAnswer(message, externalEvidence = []) {
    if (!externalEvidence.length) return null;

    const code = this.extractIcdCode(externalEvidence);
    const top = externalEvidence[0];
    if (!code) return null;

    const title = this.firstSentence(top.value || top.source_excerpt || "").replace(/^[A-TV-Z][0-9][0-9AB](?:\.[0-9A-Z]{1,4})?\s*/, "").trim();
    const answer = title
      ? `External Reference: The ICD-10-CM code for ${title} is ${code}.`
      : `External Reference: The ICD-10-CM code is ${code}.`;

    return {
      answer,
      citations: this.citationAssembler.assemble(externalEvidence, { max: 3 }),
      source_class: "external",
    };
  }

  buildExternalOnlyFallback(message, externalEvidence = [], resolution = null) {
    if (!externalEvidence.length) return null;

    const extracted = this.drugFactExtractor.extract({ message, externalEvidence, resolution });
    const answer = extracted?.answer || this.bestExternalSummary(externalEvidence[0]);
    if (!answer) return null;

    return {
      answer: answer.replace(/^External Reference:\s*/i, "").trim(),
      citations: this.citationAssembler.assemble(extracted?.citations || externalEvidence, { max: 4 }),
      source_class: "external",
      llm_provider: "external_fallback",
    };
  }

  async execute({
    message,
    classification,
    internalEvidence = [],
    externalEvidence = [],
    chatHistory = [],
    externalMeta = null,
    externalComposer = "gemma",
    geminiApiKey = "",
  }) {
    if (classification?.responseStyle === "factoid" && internalEvidence.length && !externalEvidence.length) {
      const factAnswer = this.buildFactAnswer(classification, internalEvidence);
      if (factAnswer) {
        return {
          success: true,
          step: "answer_composer",
          data: factAnswer,
        };
      }
    }

    if (externalComposer === "gemini_web") {
      const groundedPrompt = this.promptBuilder.buildGeminiExternal({
        message,
        classification,
        externalEvidence,
        chatHistory,
      });
      const geminiResult = await this.geminiClient.executeGroundedSearch(message, {
        apiKey: geminiApiKey,
        systemInstruction: groundedPrompt.systemInstruction,
        temperature: 0.1,
        maxTokens: 500,
      });

      if (geminiResult.success && geminiResult.content.trim()) {
        return {
          success: true,
          step: "answer_composer",
          data: {
            answer: this.compactSentences(geminiResult.content, 2, 360),
            citations: this.citationAssembler.assemble(geminiResult.citations || [], { max: 4 }),
            source_class: "external",
            llm_provider: "gemini_web",
          },
        };
      }

      if (classification?.intent === "diagnosis_code" && externalEvidence.length) {
        const codingAnswer = this.buildCodingAnswer(message, externalEvidence);
        if (codingAnswer) {
          return {
            success: true,
            step: "answer_composer",
            data: {
              ...codingAnswer,
              llm_provider: "external_fallback",
              confidence_override: 60,
              confidence_label_override: "low",
            },
          };
        }
      }

      if (classification?.intent === "clinical_explanation" && externalEvidence.length) {
        const explanationAnswer = this.buildClinicalExplanationAnswer(message, internalEvidence, externalEvidence);
        if (explanationAnswer) {
          return {
            success: true,
            step: "answer_composer",
            data: {
              ...explanationAnswer,
              llm_provider: "external_fallback",
              confidence_override: 60,
              confidence_label_override: "low",
            },
          };
        }
      }

      if ((classification?.intent === "drug_safety" || externalMeta?.resolution?.generic_name || externalMeta?.resolution?.normalized_display) && externalEvidence.length) {
        const drugAnswer = this.buildDrugKnowledgeAnswer(message, internalEvidence, externalEvidence, externalMeta?.resolution || null);
        if (drugAnswer) {
          return {
            success: true,
            step: "answer_composer",
            data: {
              ...drugAnswer,
              llm_provider: "external_fallback",
              confidence_override: 60,
              confidence_label_override: "low",
            },
          };
        }
      }

      const fallback = this.buildExternalOnlyFallback(message, externalEvidence, externalMeta?.resolution || null);
      if (fallback) {
        return {
          success: true,
          step: "answer_composer",
          data: {
            ...fallback,
            confidence_override: 60,
            confidence_label_override: "low",
          },
        };
      }

      return {
        success: true,
        step: "answer_composer",
        data: {
          answer: "I tried Gemini web grounding for this external question, but the grounded web search did not return a usable answer right now.",
          citations: [],
          source_class: "external",
          llm_provider: "gemini_web_failed",
          confidence_override: 60,
          confidence_label_override: "low",
          refused_override: false,
        },
      };
    }

    if (externalComposer === "gemini" && externalEvidence.length) {
      const groundedPrompt = this.promptBuilder.buildGeminiExternal({
        message,
        classification,
        externalEvidence,
        chatHistory,
      });
      const geminiResult = await this.geminiClient.execute(groundedPrompt.prompt, {
        apiKey: geminiApiKey,
        systemInstruction: groundedPrompt.systemInstruction,
        temperature: 0.1,
        maxTokens: 500,
      });

      if (geminiResult.success && geminiResult.content.trim()) {
        const sourceClass =
          internalEvidence.length && externalEvidence.length
            ? "mixed"
            : externalEvidence.length
            ? "external"
            : "internal";
        const citationItems =
          sourceClass === "mixed"
            ? [internalEvidence[0]].filter(Boolean).concat(externalEvidence, internalEvidence.slice(1))
            : [...internalEvidence, ...externalEvidence];

        return {
          success: true,
          step: "answer_composer",
          data: {
            answer: geminiResult.content.trim(),
            citations: this.citationAssembler.assemble(externalEvidence, {
              max: classification?.responseStyle === "factoid" ? 1 : 4,
            }),
            source_class: "external",
            llm_provider: "gemini",
          },
        };
      }

      const fallback = this.buildExternalOnlyFallback(message, externalEvidence, externalMeta?.resolution || null);
      if (fallback) {
        return {
          success: true,
          step: "answer_composer",
          data: fallback,
        };
      }
    }

    if (classification?.intent === "diagnosis_code" && externalEvidence.length) {
      const codingAnswer = this.buildCodingAnswer(message, externalEvidence);
      if (codingAnswer) {
        return {
          success: true,
          step: "answer_composer",
          data: codingAnswer,
        };
      }
    }

    if (classification?.intent === "clinical_explanation" && externalEvidence.length) {
      const explanationAnswer = this.buildClinicalExplanationAnswer(message, internalEvidence, externalEvidence);
      if (explanationAnswer) {
        return {
          success: true,
          step: "answer_composer",
          data: explanationAnswer,
        };
      }
    }

    if ((classification?.intent === "drug_safety" || externalMeta?.resolution?.generic_name || externalMeta?.resolution?.normalized_display) && externalEvidence.length) {
      const drugAnswer = this.buildDrugKnowledgeAnswer(message, internalEvidence, externalEvidence, externalMeta?.resolution || null);
      if (drugAnswer) {
        return {
          success: true,
          step: "answer_composer",
          data: drugAnswer,
        };
      }
    }

    const prompt = this.promptBuilder.build({
      message,
      classification,
      internalEvidence,
      externalEvidence,
      chatHistory,
    });

    const result = await this.gemmaClient.execute(prompt, { temperature: 0.1, maxTokens: 600 });
    const sourceClass =
      internalEvidence.length && externalEvidence.length
        ? "mixed"
        : externalEvidence.length
        ? "external"
        : "internal";
    const citationItems =
      sourceClass === "mixed"
        ? [internalEvidence[0]].filter(Boolean).concat(externalEvidence, internalEvidence.slice(1))
        : [...internalEvidence, ...externalEvidence];

    return {
      success: true,
      step: "answer_composer",
      data: {
        answer: result.success
          ? result.content.trim()
          : internalEvidence.length
          ? `Based on the available patient record, the most relevant findings are: ${internalEvidence
              .slice(0, 3)
              .map((item) => item.value)
              .join("; ")}.`
          : "I could not compose a safe answer from the available evidence.",
        citations: this.citationAssembler.assemble(citationItems, {
          max: classification?.responseStyle === "factoid" ? 1 : 4,
        }),
        source_class: sourceClass,
      },
    };
  }
}

module.exports = AnswerComposerAgent;
