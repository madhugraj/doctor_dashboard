// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const DoctorAssistantAgent = require("../../agents/doctor_assistant_agent.cjs");
const AnswerComposerAgent = require("../../agents/answer_composer_agent.cjs");
const ExternalKnowledgeAgent = require("../../agents/external_knowledge_agent.cjs");
const MedicalWebSearchTool = require("../../tools/chat/medical_web_search.tool.cjs");
const DrugFactExtractorTool = require("../../tools/chat/drug_fact_extractor.tool.cjs");
const QueryClassifierTool = require("../../tools/chat/query_classifier.tool.cjs");

const baseClassification = {
  intent: "clinical_explanation",
  needsInternal: true,
  needsExternal: true,
  isActionRequest: false,
  sectionHints: ["diagnosis"],
  outOfScope: false,
  factField: null,
  responseStyle: "mixed_explanatory",
  needsClarification: false,
  clarificationPrompt: "",
  requiresExternalConsent: false,
};

const baseDocument = {
  id: "doc-1",
  name: "report.pdf",
  status: "processed",
  result: {
    sample_patient_data: {
      name: "Amit kumar DUTTA",
    },
  },
};

describe("DoctorAssistantAgent chat fallbacks", () => {
  it("always asks for approval before external-only medical search", async () => {
    const agent = new DoctorAssistantAgent({
      gemini: { enabled: false },
      readSessions: async () => [],
      writeSessions: async () => undefined,
    });

    agent.sessionAgent.load = vi.fn().mockResolvedValue(null);
    agent.sessionAgent.save = vi.fn().mockResolvedValue(undefined);
    agent.intentAgent.execute = vi.fn().mockResolvedValue({
      data: {
        intent: "literature_query",
        needsInternal: false,
        needsExternal: true,
        isActionRequest: false,
        sectionHints: [],
        outOfScope: false,
        factField: null,
        responseStyle: "default",
        needsClarification: false,
        clarificationPrompt: "",
        requiresExternalConsent: false,
      },
    });

    const result = await agent.execute({
      document: baseDocument,
      documentId: "doc-1",
      message: "What are the common reasons for seizures?",
      sectionContext: null,
      chatId: "chat-consent-1",
    });

    expect(result.data.decision_prompt?.type).toBe("external_search_consent");
    expect(result.data.answer).toContain("I can search approved medical sources");
  });

  it("returns a low-confidence external fallback instead of refusing when external search has no result", async () => {
    const agent = new DoctorAssistantAgent({
      gemini: { enabled: false },
      readSessions: async () => [],
      writeSessions: async () => undefined,
    });

    agent.sessionAgent.load = vi.fn().mockResolvedValue({
      chatId: "chat-1",
      documentId: "doc-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      confirmedActions: [],
      pendingExternalConsent: {
        message: "What can be the cause for thalamo capsular bleed?",
        sectionContext: "diagnosis",
        classification: {
          ...baseClassification,
          requiresExternalConsent: false,
        },
        createdAt: new Date().toISOString(),
      },
      pendingClarification: null,
      pendingGeminiKeyPrompt: null,
    });
    agent.sessionAgent.save = vi.fn().mockResolvedValue(undefined);
    agent.intentAgent.execute = vi.fn().mockResolvedValue({ data: baseClassification });
    agent.recordAgent.execute = vi.fn().mockResolvedValue({
      data: {
        evidence: [
          {
            value: "(R) thalamo capsular bleed",
            label: "(R) thalamo capsular bleed",
            source_section: "Provisional Diagnosis",
            section: "diagnosis",
            source_excerpt: "(R) thalamo capsular bleed",
            source_page: 1,
          },
        ],
      },
    });
    agent.externalAgent.execute = vi.fn().mockResolvedValue({
      data: {
        evidence: [],
        error: "No reliable external results found.",
        error_type: "no_results",
        resolution: null,
      },
    });
    agent.safetyAgent.execute = vi.fn().mockResolvedValue({
      data: {
        confidence: { score: 0, label: "refuse" },
        refusal: {
          refused: true,
          reason: "I don't have sufficient information to answer this safely from the patient record or approved medical sources.",
        },
      },
    });
    agent.actionAgent.execute = vi.fn().mockResolvedValue({ data: { proposals: [] } });

    const result = await agent.execute({
      document: baseDocument,
      documentId: "doc-1",
      message: "yes",
      sectionContext: "diagnosis",
      chatId: "chat-1",
    });

    expect(agent.recordAgent.execute).toHaveBeenCalled();
    expect(agent.externalAgent.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "What can be the cause for thalamo capsular bleed?",
      }),
    );
    expect(result.data.answer).toContain("I searched approved external medical sources but did not find a reliable answer for that question.");
    expect(result.data.answer).not.toContain("The uploaded record documents:");
    expect(result.data.source_class).toBe("external");
    expect(result.data.refused).toBe(false);
    expect(result.data.confidence_label).toBe("low");
    expect(result.data.citations).toHaveLength(0);
    expect(result.data.trace?.provider).toBe("policy_fallback");
    expect(result.data.trace?.final_state).toBe("answered");
    expect(result.data.trace?.steps.map((step: { key: string }) => step.key)).toEqual(
      expect.arrayContaining(["routing", "record_context", "external_search", "safety", "answer"]),
    );
  });

  it("still collects external evidence when Gemini web search is enabled", async () => {
    const agent = new DoctorAssistantAgent({
      gemini: { enabled: true, apiKey: "test-key" },
      readSessions: async () => [],
      writeSessions: async () => undefined,
    });

    agent.sessionAgent.load = vi.fn().mockResolvedValue({
      chatId: "chat-2",
      documentId: "doc-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      confirmedActions: [],
      pendingExternalConsent: {
        message: "any alternative for INJ MANNITOL ?",
        sectionContext: "medications",
        classification: {
          ...baseClassification,
          intent: "drug_safety",
          sectionHints: ["medications"],
          requiresExternalConsent: false,
        },
        createdAt: new Date().toISOString(),
      },
      pendingClarification: null,
      pendingGeminiKeyPrompt: null,
    });
    agent.sessionAgent.save = vi.fn().mockResolvedValue(undefined);
    agent.intentAgent.execute = vi.fn().mockResolvedValue({
      data: {
        ...baseClassification,
        intent: "drug_safety",
        sectionHints: ["medications"],
      },
    });
    agent.recordAgent.execute = vi.fn().mockResolvedValue({
      data: {
        evidence: [
          {
            value: "INJ MANNITOL (20%) - 100 ML IV TDS",
            label: "INJ MANNITOL (20%)",
            source_section: "Medication Orders",
            section: "medications",
            source_excerpt: "INJ MANNITOL (20%) - 100 ML IV TDS",
          },
        ],
      },
    });
    agent.externalAgent.execute = vi.fn().mockResolvedValue({
      data: {
        evidence: [
          {
            value: "Mannitol is an osmotic diuretic.",
            label: "[MedlinePlus: Mannitol]",
            source_class: "external",
            source_section: "MedlinePlus",
            source_excerpt: "Mannitol is an osmotic diuretic.",
            url: "https://example.test/mannitol",
          },
        ],
        error: null,
        error_type: null,
        resolution: { generic_name: "mannitol" },
      },
    });
    agent.safetyAgent.execute = vi.fn().mockResolvedValue({
      data: {
        confidence: { score: 80, label: "medium" },
        refusal: { refused: false, reason: "" },
      },
    });
    agent.answerAgent.execute = vi.fn().mockResolvedValue({
      data: {
        answer: "External Reference: Mannitol is an osmotic diuretic.",
        citations: [],
        source_class: "external",
        llm_provider: "external_fallback",
        confidence_override: 60,
        confidence_label_override: "low",
      },
    });
    agent.actionAgent.execute = vi.fn().mockResolvedValue({ data: { proposals: [] } });

    await agent.execute({
      document: baseDocument,
      documentId: "doc-1",
      message: "yes",
      sectionContext: "medications",
      chatId: "chat-2",
    });

    expect(agent.externalAgent.execute).toHaveBeenCalled();
    expect(agent.answerAgent.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        internalEvidence: [],
        externalEvidence: expect.arrayContaining([
          expect.objectContaining({ value: "Mannitol is an osmotic diuretic." }),
        ]),
        externalComposer: "gemini_web",
      }),
    );
  });

  it("attaches trace data to external consent prompts", async () => {
    const agent = new DoctorAssistantAgent({
      gemini: { enabled: true },
      readSessions: async () => [],
      writeSessions: async () => undefined,
    });

    agent.sessionAgent.load = vi.fn().mockResolvedValue(null);
    agent.sessionAgent.save = vi.fn().mockResolvedValue(undefined);
    agent.intentAgent.execute = vi.fn().mockResolvedValue({
      data: {
        intent: "drug_safety",
        needsInternal: true,
        needsExternal: true,
        isActionRequest: false,
        sectionHints: ["medications"],
        outOfScope: false,
        factField: null,
        responseStyle: "default",
        needsClarification: false,
        clarificationPrompt: "",
        requiresExternalConsent: true,
      },
    });

    const result = await agent.execute({
      document: baseDocument,
      documentId: "doc-1",
      message: "dosage for INJ HUMAN ACTRAPID?",
      sectionContext: "medications",
      chatId: "chat-3",
    });

    expect(result.data.decision_prompt?.type).toBe("external_search_consent");
    expect(result.data.trace?.final_state).toBe("external_consent_requested");
    expect(result.data.trace?.steps.map((step: { key: string }) => step.key)).toEqual(
      expect.arrayContaining(["routing", "consent"]),
    );
  });
});

describe("QueryClassifierTool consent normalization", () => {
  it("forces consent for external medical questions", () => {
    const tool = new QueryClassifierTool({});
    const result = tool.sanitize({
      intent: "literature_query",
      needsInternal: false,
      needsExternal: true,
      isActionRequest: false,
      sectionHints: [],
      outOfScope: false,
      factField: null,
      responseStyle: "default",
      needsClarification: false,
      clarificationPrompt: "",
      requiresExternalConsent: false,
    });

    expect(result.requiresExternalConsent).toBe(true);
  });
});

describe("ExternalKnowledgeAgent null-safe drug resolution", () => {
  it("does not crash when a drug plan receives a null resolved entity", async () => {
    const agent = new ExternalKnowledgeAgent({});
    agent.queryPlanner.plan = vi.fn().mockResolvedValue({
      knowledge_type: "drug_knowledge",
      entity: "TB meningo-encephalitis with seizures",
      search_queries: ["TB meningo-encephalitis with seizures"],
      source_preferences: ["rxnorm", "medlineplus", "openfda"],
      needs_clarification: false,
      clarification_prompt: "",
    });
    agent.drugResolver.resolve = vi.fn().mockResolvedValue(null);
    agent.sourceRouter.route = vi.fn().mockReturnValue(["medlineplus"]);
    agent.searchTool.search = vi.fn().mockResolvedValue([]);
    agent.sourcePolicy.filter = vi.fn().mockImplementation((items) => items);
    agent.ranker.rank = vi.fn().mockReturnValue([]);
    agent.normalizer.normalizeMany = vi.fn().mockReturnValue([]);

    const result = await agent.execute({
      query: "what are the cause for TB meningo-encephalitis with seizures?",
      classification: {
        intent: "drug_safety",
      },
      internalEvidence: [],
    });

    expect(result.success).toBe(true);
    expect(result.data.error_type).toBe("no_results");
    expect(result.data.resolution).toEqual(
      expect.objectContaining({
        generic_name: "",
        normalized_display: "",
      }),
    );
  });
});

describe("AnswerComposerAgent Gemini fallback", () => {
  it("falls back to structured external evidence when Gemini grounded search returns no usable text", async () => {
    const agent = new AnswerComposerAgent({});
    agent.promptBuilder.buildGeminiExternal = vi.fn().mockReturnValue({
      systemInstruction: "system",
      prompt: "prompt",
    });
    agent.geminiClient.executeGroundedSearch = vi.fn().mockResolvedValue({
      success: false,
      content: "",
      citations: [],
    });

    const result = await agent.execute({
      message: "any alternative for INJ MANNITOL ?",
      classification: {
        intent: "drug_safety",
        responseStyle: "default",
      },
      internalEvidence: [
        {
          value: "INJ MANNITOL (20%) - 100 ML IV TDS",
          label: "INJ MANNITOL (20%)",
          source_section: "Medication Orders",
          source_excerpt: "INJ MANNITOL (20%) - 100 ML IV TDS",
          source_class: "internal",
        },
      ],
      externalEvidence: [
        {
          value: "Mannitol is an osmotic diuretic used to reduce intracranial pressure.",
          label: "[MedlinePlus: Mannitol]",
          source_section: "MedlinePlus",
          source_excerpt: "Mannitol is an osmotic diuretic used to reduce intracranial pressure.",
          source_class: "external",
          url: "https://example.test/mannitol",
        },
      ],
      externalMeta: {
        resolution: { generic_name: "mannitol" },
      },
      externalComposer: "gemini_web",
      geminiApiKey: "test-key",
      chatHistory: [],
    });

    expect(result.data.answer).toContain("External Reference:");
    expect(result.data.answer).not.toContain("did not return a usable answer");
    expect(result.data.source_class).toBe("external");
    expect(result.data.llm_provider).toBe("external_fallback");
    expect(result.data.confidence_label_override).toBe("low");
  });

  it("does not manufacture dosage guidance from rxnorm pack results", () => {
    const extractor = new DrugFactExtractorTool({});
    const result = extractor.extract({
      message: "dosage for INJ HUMAN ACTRAPID?",
      externalEvidence: [
        {
          value: "Afrezza Titration Pack- 90 (4 UNT), 90 (8 UNT).",
          source_section: "RxNorm",
          source_excerpt: "Afrezza Titration Pack- 90 (4 UNT), 90 (8 UNT). Term type: BPCK. RxCUI: 1798388.",
        },
      ],
      resolution: { generic_name: "insulin regular human" },
    });

    expect(result).toBeNull();
  });

  it("handles a null resolution object without throwing during external fallback extraction", () => {
    const extractor = new DrugFactExtractorTool({});

    expect(() =>
      extractor.extract({
        message: "what are the cause for TB meningo-encephalitis with seizures?",
        externalEvidence: [
          {
            value: "Tuberculous meningitis can present with seizures due to cortical irritation.",
            source_section: "PubMed",
            source_excerpt: "Tuberculous meningitis can present with seizures due to cortical irritation.",
          },
        ],
        resolution: null,
      }),
    ).not.toThrow();
  });

  it("builds human-readable rxnorm display links instead of raw json endpoints", () => {
    const tool = new MedicalWebSearchTool({});
    const url = tool.buildRxNormDisplayUrl("insulin regular human", "1798388");

    expect(url).toContain("mor.nlm.nih.gov/RxNav/search");
    expect(url).toContain("searchBy=RXCUI");
    expect(url).toContain("1798388");
  });
});
