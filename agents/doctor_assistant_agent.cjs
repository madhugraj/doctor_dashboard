const QueryIntentAgent = require("./query_intent_agent.cjs");
const RecordContextAgent = require("./record_context_agent.cjs");
const ExternalKnowledgeAgent = require("./external_knowledge_agent.cjs");
const AnswerComposerAgent = require("./answer_composer_agent.cjs");
const SafetyGuardAgent = require("./safety_guard_agent.cjs");
const ActionRouterAgent = require("./action_router_agent.cjs");
const SessionMemoryAgent = require("./session_memory_agent.cjs");
const VitalNormalityTool = require("../tools/chat/vital_normality.tool.cjs");
const MedicationComparisonTool = require("../tools/chat/medication_comparison.tool.cjs");

class DoctorAssistantAgent {
  constructor(config = {}) {
    this.name = "Doctor Assistant Agent";
    this.version = "1.0.0";
    this.intentAgent = new QueryIntentAgent(config);
    this.recordAgent = new RecordContextAgent(config);
    this.externalAgent = new ExternalKnowledgeAgent(config);
    this.answerAgent = new AnswerComposerAgent(config);
    this.safetyAgent = new SafetyGuardAgent(config);
    this.actionAgent = new ActionRouterAgent(config);
    this.sessionAgent = new SessionMemoryAgent({
      readSessions: config.readSessions,
      writeSessions: config.writeSessions,
    });
    this.vitalNormalityTool = new VitalNormalityTool(config);
    this.medicationComparisonTool = new MedicationComparisonTool(config);
    this.useGeminiForExternal = config.gemini?.enabled !== false;
    this.defaultGeminiApiKey = String(config.gemini?.apiKey || "").trim();
  }

  isAffirmative(message = "") {
    return /\b(yes|yeah|yep|ok|okay|sure|go ahead|please do|do it|search|look it up)\b/i.test(String(message || ""));
  }

  isNegative(message = "") {
    return /\b(no|nope|don't|do not|stop|cancel|leave it)\b/i.test(String(message || ""));
  }

  createConsentPrompt(answer) {
    return {
      type: "external_search_consent",
      question: answer,
      options: [
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" },
      ],
    };
  }

  createGeminiKeyPrompt(answer) {
    return {
      type: "gemini_api_key",
      question: answer,
      submit_label: "Use Gemini",
      placeholder: "Paste Gemini API key for this session",
    };
  }

  shouldTreatPendingClarificationAsNewQuestion(message = "", pendingClassification = null, nextClassification = null) {
    const text = String(message || "").trim();
    if (!text || !nextClassification) return false;
    if (this.isAffirmative(text) || this.isNegative(text)) return false;

    const looksStandalone =
      text.includes("?") ||
      /^(what|which|who|when|where|why|how|is|are|can|does|do|will|tell|show|list)\b/i.test(text);

    const intentChanged = nextClassification.intent && nextClassification.intent !== pendingClassification?.intent;
    const hasConcreteTarget =
      Boolean(nextClassification.factField) ||
      (Array.isArray(nextClassification.sectionHints) && nextClassification.sectionHints.length > 0) ||
      Boolean(nextClassification.needsExternal);

    return !nextClassification.needsClarification && (looksStandalone || intentChanged || hasConcreteTarget);
  }

  sanitizeTraceMeta(meta = {}) {
    return Object.fromEntries(
      Object.entries(meta)
        .map(([key, value]) => {
          if (Array.isArray(value)) {
            const compact = value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4);
            return [key, compact.length ? compact.join(", ") : undefined];
          }
          if (value === null || value === undefined || value === "") return [key, undefined];
          if (typeof value === "boolean") return [key, value ? "yes" : "no"];
          return [key, String(value)];
        })
        .filter(([, value]) => value !== undefined)
    );
  }

  pushTrace(trace, key, label, status, summary, meta = {}) {
    trace.steps.push({
      key,
      label,
      status,
      summary: String(summary || "").trim(),
      meta: this.sanitizeTraceMeta(meta),
    });
  }

  logClassification(trace, classification = {}) {
    this.pushTrace(trace, "routing", "Routing", "ok", `Intent ${classification.intent || "unknown"} via ${classification.responseStyle || "default"} response.`, {
      internal: classification.needsInternal,
      external: classification.needsExternal,
      consent: classification.requiresExternalConsent,
      sections: classification.sectionHints || [],
      fact_field: classification.factField || undefined,
    });
  }

  logInternalEvidence(trace, classification = {}, internalEvidence = []) {
    this.pushTrace(
      trace,
      "record_context",
      "Record Context",
      classification.needsInternal ? "ok" : "skipped",
      classification.needsInternal
        ? `Matched ${internalEvidence.length} chart evidence item${internalEvidence.length === 1 ? "" : "s"}.`
        : "Internal chart lookup skipped for this turn.",
      {
        top_section: internalEvidence[0]?.section || internalEvidence[0]?.source_section || undefined,
        top_label: internalEvidence[0]?.label || undefined,
      }
    );
  }

  logExternalEvidence(trace, classification = {}, externalEvidence = [], externalResult = {}) {
    if (!classification.needsExternal) {
      this.pushTrace(trace, "external_search", "External Search", "skipped", "External search not required for this turn.");
      return;
    }

    const plan = externalResult.plan || {};
    const errorType = externalResult.error_type || null;
    const status = externalEvidence.length ? "ok" : errorType ? "warning" : "info";
    const summary = externalEvidence.length
      ? `Retrieved ${externalEvidence.length} external evidence item${externalEvidence.length === 1 ? "" : "s"}.`
      : errorType === "no_results"
      ? "Approved external sources returned no reliable result."
      : errorType === "clarification_needed"
      ? "External planner requested clarification before search."
      : externalResult.error
      ? "External retrieval did not complete cleanly."
      : "External retrieval returned no evidence.";

    this.pushTrace(trace, "external_search", "External Search", status, summary, {
      knowledge_type: plan.knowledge_type || undefined,
      entity: plan.entity || plan.resolved_entity?.generic_name || undefined,
      queries: plan.search_queries || [],
      sources: externalResult.sources || [],
      resolution: externalResult.resolution?.generic_name || externalResult.resolution?.normalized_display || undefined,
      error_type: errorType || undefined,
    });
  }

  logSafety(trace, safety = {}) {
    this.pushTrace(
      trace,
      "safety",
      "Safety Gate",
      safety?.refusal?.refused ? "warning" : "ok",
      safety?.refusal?.refused ? "Safety policy flagged this answer for refusal." : "Safety policy allowed an answer.",
      {
        confidence: safety?.confidence?.label || undefined,
        reason: safety?.refusal?.refused ? safety?.refusal?.reason : undefined,
      }
    );
  }

  createAssistantMessage({
    answer,
    citations = [],
    confidence,
    confidence_label,
    source_class,
    proposed_actions = [],
    decision_prompt = null,
    llm_provider,
    trace = null,
  }) {
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      answer,
      citations,
      confidence,
      confidence_label,
      source_class,
      proposed_actions,
      decision_prompt,
      llm_provider: llm_provider || undefined,
      trace: trace || undefined,
      createdAt: new Date().toISOString(),
    };
  }

  buildTrace(trace, extras = {}) {
    return {
      steps: trace.steps,
      ...extras,
    };
  }

  buildResponse({ session, documentId, assistantMessage, refused = false, refusal_reason }) {
    return {
      success: true,
      data: {
        chatId: session.chatId,
        documentId,
        answer: assistantMessage.answer,
        source_class: assistantMessage.source_class,
        confidence: assistantMessage.confidence,
        confidence_label: assistantMessage.confidence_label,
        citations: assistantMessage.citations || [],
        refused,
        refusal_reason: refusal_reason || undefined,
        llm_provider: assistantMessage.llm_provider || undefined,
        proposed_actions: assistantMessage.proposed_actions || [],
        decision_prompt: assistantMessage.decision_prompt || null,
        trace: assistantMessage.trace || undefined,
      },
      session,
    };
  }

  async execute({ document, documentId, message, sectionContext, chatId, geminiApiKey = "" }) {
    const session =
      (await this.sessionAgent.load(documentId, chatId)) || {
        chatId: chatId || crypto.randomUUID(),
        documentId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        confirmedActions: [],
        pendingExternalConsent: null,
        pendingClarification: null,
        pendingGeminiKeyPrompt: null,
      };

    const userMessage = String(message || "");
    const trace = { steps: [] };
    const providedGeminiApiKey = String(geminiApiKey || "").trim();
    let executionMessage = userMessage;
    let externalConsentGranted = false;
    let classification = null;
    let transientGeminiApiKey = providedGeminiApiKey;
    let userContentForHistory = userMessage;

    if (session.pendingGeminiKeyPrompt) {
      const pending = session.pendingGeminiKeyPrompt;
      if (!providedGeminiApiKey) {
        if (pending.classification) {
          this.logClassification(trace, pending.classification);
        }
        this.pushTrace(trace, "consent", "External Consent", "ok", "External search was already approved for this pending turn.");
        this.pushTrace(trace, "provider_gate", "Provider Gate", "blocked", "Gemini-backed external synthesis is waiting for an API key.", {
          provider: "gemini_web",
        });
        const promptMessage = this.createAssistantMessage({
          answer: "A Gemini API key is required to continue with Gemini-backed external synthesis for this turn.",
          citations: [],
          confidence: 60,
          confidence_label: "low",
          source_class: "external",
          proposed_actions: [],
          decision_prompt: this.createGeminiKeyPrompt("Enter a Gemini API key to continue. It will be used only for this session and will not be stored in chat history."),
          trace: this.buildTrace(trace, { final_state: "gemini_key_prompt" }),
        });
        session.messages.push(promptMessage);
        session.updatedAt = new Date().toISOString();
        await this.sessionAgent.save(session);

        return this.buildResponse({ session, documentId, assistantMessage: promptMessage, refused: false });
      }

      executionMessage = pending.message;
      sectionContext = pending.sectionContext;
      classification = pending.classification || null;
      session.pendingGeminiKeyPrompt = null;
      externalConsentGranted = true;
      userContentForHistory = "Gemini API key provided";
      this.pushTrace(trace, "consent", "External Consent", "ok", "Continuing the pending external turn after Gemini key submission.", {
        provider: "gemini_web",
      });
    }

    if (session.pendingExternalConsent) {
      const pending = session.pendingExternalConsent;

      if (this.isAffirmative(userMessage)) {
        executionMessage = pending.message;
        sectionContext = pending.sectionContext;
        classification = pending.classification || null;
        session.pendingExternalConsent = null;
        externalConsentGranted = true;
        this.pushTrace(trace, "consent", "External Consent", "ok", "User approved external medical search.");
        if (this.useGeminiForExternal && !transientGeminiApiKey && !this.defaultGeminiApiKey) {
          const keyPrompt =
            "External search is approved. Enter a Gemini API key to use Gemini for grounded external synthesis. The key will not be stored in chat history.";

          session.pendingGeminiKeyPrompt = {
            message: executionMessage,
            sectionContext,
            classification,
            createdAt: new Date().toISOString(),
          };
          session.messages.push({
            id: crypto.randomUUID(),
            role: "user",
            content: "Yes",
            createdAt: new Date().toISOString(),
          });
          if (classification) {
            this.logClassification(trace, classification);
          }
          this.pushTrace(trace, "provider_gate", "Provider Gate", "blocked", "Gemini-backed external synthesis cannot start until an API key is provided.", {
            provider: "gemini_web",
          });
          const promptMessage = this.createAssistantMessage({
            answer: keyPrompt,
            citations: [],
            confidence: 60,
            confidence_label: "low",
            source_class: "external",
            proposed_actions: [],
            decision_prompt: this.createGeminiKeyPrompt(keyPrompt),
            trace: this.buildTrace(trace, { final_state: "gemini_key_prompt" }),
          });
          session.messages.push(promptMessage);
          session.updatedAt = new Date().toISOString();
          await this.sessionAgent.save(session);

          return this.buildResponse({ session, documentId, assistantMessage: promptMessage, refused: false });
        }
      } else if (this.isNegative(userMessage)) {
        if (pending.classification) {
          this.logClassification(trace, pending.classification);
        }
        this.pushTrace(trace, "consent", "External Consent", "warning", "User declined external medical search.");
        const declineMessage = this.createAssistantMessage({
          answer: "Okay. I will not search external medical sources for that question.",
          citations: [],
          confidence: 60,
          confidence_label: "low",
          source_class: "internal",
          proposed_actions: [],
          decision_prompt: null,
          trace: this.buildTrace(trace, { final_state: "external_search_declined" }),
        });

        session.messages.push({
          id: crypto.randomUUID(),
          role: "user",
          content: userContentForHistory,
          createdAt: new Date().toISOString(),
        });
        session.messages.push(declineMessage);
        session.updatedAt = new Date().toISOString();
        await this.sessionAgent.save(session);

        return this.buildResponse({ session, documentId, assistantMessage: declineMessage, refused: false });
      }
    }

    if (session.pendingClarification) {
      const pending = session.pendingClarification;
      const standaloneIntent = await this.intentAgent.execute({ message: userMessage, sectionContext });

      if (this.shouldTreatPendingClarificationAsNewQuestion(userMessage, pending.classification, standaloneIntent.data)) {
        session.pendingClarification = null;
        classification = standaloneIntent.data;
        this.pushTrace(trace, "clarification", "Clarification", "info", "Previous clarification was ignored because the latest message was classified as a new standalone question.");
      } else {
        executionMessage = `${pending.message}\nClarification: ${userMessage}`;
        sectionContext = pending.sectionContext;
        classification = {
          ...pending.classification,
          needsClarification: false,
          clarificationPrompt: "",
        };
        session.pendingClarification = null;
        this.pushTrace(trace, "clarification", "Clarification", "ok", "Merged the user's clarification into the pending question.");
      }
    }

    if (!classification) {
      const intentResult = await this.intentAgent.execute({ message: executionMessage, sectionContext });
      classification = intentResult.data;
    }
    if (classification?.needsExternal && !classification?.needsClarification && !classification?.outOfScope) {
      classification = {
        ...classification,
        requiresExternalConsent: true,
      };
    }
    this.logClassification(trace, classification);

    const preRecordResults = classification.intent === "vital_normality"
      ? this.vitalNormalityTool.interpret(executionMessage, document)
      : null;

    if (classification.needsClarification) {
      session.pendingClarification = {
        message: executionMessage,
        sectionContext,
        classification,
        createdAt: new Date().toISOString(),
      };
      this.pushTrace(trace, "clarification", "Clarification", "blocked", "The router needs more detail before it can answer safely.");
      const clarificationMessage = this.createAssistantMessage({
        answer: classification.clarificationPrompt,
        citations: [],
        confidence: 60,
        confidence_label: "low",
        source_class: "internal",
        proposed_actions: [],
        decision_prompt: null,
        trace: this.buildTrace(trace, { final_state: "clarification_requested" }),
      });

      session.messages.push({
        id: crypto.randomUUID(),
        role: "user",
        content: userMessage,
        createdAt: new Date().toISOString(),
      });
      session.messages.push(clarificationMessage);
      session.updatedAt = new Date().toISOString();
      await this.sessionAgent.save(session);

      return this.buildResponse({ session, documentId, assistantMessage: clarificationMessage, refused: false });
    }

    if (!externalConsentGranted && classification.requiresExternalConsent && classification.needsExternal) {
      const consentPrompt =
        "This answer is not available in the uploaded record. I can search approved medical sources to answer it. Do you want me to do that?";

      session.pendingExternalConsent = {
        message: executionMessage,
        sectionContext,
        classification: {
          ...classification,
          requiresExternalConsent: false,
          needsExternal: true,
        },
        createdAt: new Date().toISOString(),
      };
      this.pushTrace(trace, "consent", "External Consent", "blocked", "This question requires approval before external medical search can run.");
      session.messages.push({
        id: crypto.randomUUID(),
        role: "user",
        content: userMessage,
        createdAt: new Date().toISOString(),
      });
      const consentMessage = this.createAssistantMessage({
        answer: consentPrompt,
        citations: [],
        confidence: 60,
        confidence_label: "low",
        source_class: "internal",
        proposed_actions: [],
        decision_prompt: this.createConsentPrompt(consentPrompt),
        trace: this.buildTrace(trace, { final_state: "external_consent_requested" }),
      });
      session.messages.push(consentMessage);
      session.updatedAt = new Date().toISOString();
      await this.sessionAgent.save(session);

      return this.buildResponse({ session, documentId, assistantMessage: consentMessage, refused: false });
    }

    const internalEvidence = classification.needsInternal
      ? (
          await this.recordAgent.execute({
            document,
            message: executionMessage,
            sectionHints: classification.sectionHints,
            classification,
          })
        ).data.evidence || []
      : [];
    this.logInternalEvidence(trace, classification, internalEvidence);

    const comparisonResolution =
      !classification.needsExternal &&
      (classification.intent === "medication_comparison" || classification.intent === "medication_substitution")
        ? this.medicationComparisonTool.resolve(executionMessage, internalEvidence)
        : null;

    const useGeminiWebSearch =
      classification.needsExternal &&
      this.useGeminiForExternal &&
      Boolean(transientGeminiApiKey || this.defaultGeminiApiKey);

    if (comparisonResolution?.needsClarification) {
      session.pendingClarification = {
        message: executionMessage,
        sectionContext,
        classification,
        createdAt: new Date().toISOString(),
      };
      this.pushTrace(trace, "comparison", "Medication Comparison", "blocked", "Medication comparison needs a clearer target before it can proceed.");
      const clarificationMessage = this.createAssistantMessage({
        answer: comparisonResolution.clarificationPrompt,
        citations: [],
        confidence: 60,
        confidence_label: "low",
        source_class: "internal",
        proposed_actions: [],
        decision_prompt: null,
        trace: this.buildTrace(trace, { final_state: "clarification_requested" }),
      });

      session.messages.push({
        id: crypto.randomUUID(),
        role: "user",
        content: userMessage,
        createdAt: new Date().toISOString(),
      });
      session.messages.push(clarificationMessage);
      session.updatedAt = new Date().toISOString();
      await this.sessionAgent.save(session);

      return this.buildResponse({ session, documentId, assistantMessage: clarificationMessage, refused: false });
    }

    if (preRecordResults) {
      const safety = await this.safetyAgent.execute({
        classification,
        internalEvidence: preRecordResults.citations || internalEvidence,
        externalEvidence: [],
      });
      this.pushTrace(trace, "rule", "Rule Engine", "ok", "Answered directly from the vital normality interpreter.");
      this.logSafety(trace, safety.data);

      const assistantMessage = this.createAssistantMessage({
        answer: preRecordResults.answer,
        citations: preRecordResults.citations || [],
        confidence: safety.data.confidence.score,
        confidence_label: safety.data.confidence.label,
        source_class: preRecordResults.source_class || "internal",
        proposed_actions: [],
        decision_prompt: null,
        trace: this.buildTrace(trace, { final_state: "answered", provider: "rule_engine" }),
      });

      session.messages.push({
        id: crypto.randomUUID(),
        role: "user",
        content: userMessage,
        createdAt: new Date().toISOString(),
      });
      session.messages.push(assistantMessage);
      session.updatedAt = new Date().toISOString();
      await this.sessionAgent.save(session);

      return this.buildResponse({ session, documentId, assistantMessage, refused: false });
    }

    if (comparisonResolution?.answer && classification.needsExternal && !externalConsentGranted && classification.requiresExternalConsent) {
      // consent path continues below; comparisonResolution only provides local fallback context
    } else if (comparisonResolution?.answer && !classification.needsExternal) {
      const safety = await this.safetyAgent.execute({
        classification,
        internalEvidence: comparisonResolution.citations || internalEvidence,
        externalEvidence: [],
      });
      this.pushTrace(trace, "comparison", "Medication Comparison", "ok", "Resolved medication comparison from chart evidence without external search.");
      this.logSafety(trace, safety.data);

      const assistantMessage = this.createAssistantMessage({
        answer: comparisonResolution.answer,
        citations: comparisonResolution.citations || [],
        confidence: safety.data.confidence.score,
        confidence_label: safety.data.confidence.label,
        source_class: comparisonResolution.source_class || "internal",
        proposed_actions: [],
        decision_prompt: null,
        trace: this.buildTrace(trace, { final_state: "answered", provider: "rule_engine" }),
      });

      session.messages.push({
        id: crypto.randomUUID(),
        role: "user",
        content: userMessage,
        createdAt: new Date().toISOString(),
      });
      session.messages.push(assistantMessage);
      session.updatedAt = new Date().toISOString();
      await this.sessionAgent.save(session);

      return this.buildResponse({ session, documentId, assistantMessage, refused: false });
    }

    const externalResult = classification.needsExternal
      ? await this.externalAgent.execute({ query: executionMessage, classification, internalEvidence })
      : { success: true, data: { evidence: [], source_class: "internal" } };
    const externalEvidence = externalResult.data.evidence || [];
    const externalErrorType = externalResult.data.error_type || null;
    const externalResolution = externalResult.data.resolution || null;
    this.logExternalEvidence(trace, classification, externalEvidence, externalResult.data);

    const safety = await this.safetyAgent.execute({
      classification,
      internalEvidence,
      externalEvidence,
    });
    this.logSafety(trace, safety.data);
    const allowResolvedDrugFallback =
      classification.intent === "drug_safety" &&
      !externalEvidence.length &&
      Boolean(externalResolution?.generic_name || externalResolution?.normalized_display);
    const allowExternalAnswerDespiteLowSafety = classification.needsExternal && (externalEvidence.length || useGeminiWebSearch);

    let answerPayload;
    let traceProvider = "rule_engine";
    if ((classification.intent === "medication_comparison" || classification.intent === "medication_substitution") && !externalEvidence.length && comparisonResolution?.answer) {
      answerPayload = {
        answer: comparisonResolution.answer,
        citations: comparisonResolution.citations || [],
        source_class: comparisonResolution.source_class || "mixed",
      };
      traceProvider = "rule_engine";
      this.pushTrace(trace, "comparison", "Medication Comparison", "ok", "Returned the local medication comparison fallback because external evidence was unavailable.");
    } else if (classification.needsExternal && !externalEvidence.length && !useGeminiWebSearch) {
      const resolvedSummary =
        externalResolution?.generic_name || externalResolution?.normalized_display
          ? ` I identified the medication as ${externalResolution.generic_name || externalResolution.normalized_display}, but I could not retrieve a reliable external fact for this question right now.`
          : "";
      const failureReason =
        externalErrorType === "no_results"
          ? "I searched approved external medical sources but did not find a reliable answer for that question."
          : "I tried approved external medical sources, but the external search is unavailable right now.";

      answerPayload = {
        answer: `${failureReason}${resolvedSummary}`,
        citations: [],
        source_class: "external",
        refused_override: false,
        confidence_override: 60,
        confidence_label_override: "low",
      };
      traceProvider = "policy_fallback";
    } else if (safety.data.refusal.refused && !allowResolvedDrugFallback && !allowExternalAnswerDespiteLowSafety) {
      answerPayload = {
        answer: safety.data.refusal.reason,
        citations: [],
        source_class: externalEvidence.length ? "external" : "internal",
      };
      traceProvider = "safety_refusal";
    } else {
      answerPayload = (
        await this.answerAgent.execute({
          message: executionMessage,
          classification,
          internalEvidence: classification.needsExternal ? [] : internalEvidence,
          externalEvidence,
          externalMeta: { resolution: externalResolution },
          chatHistory: session.messages,
          externalComposer: useGeminiWebSearch
            ? "gemini_web"
            : classification.needsExternal && externalEvidence.length && this.useGeminiForExternal && (transientGeminiApiKey || this.defaultGeminiApiKey)
            ? "gemini"
            : "gemma",
          geminiApiKey: transientGeminiApiKey || this.defaultGeminiApiKey,
        })
      ).data;
      traceProvider = answerPayload.llm_provider || "gemma";
    }

    const actionResult = await this.actionAgent.execute({
      classification,
      message: executionMessage,
      evidence: [...internalEvidence, ...externalEvidence],
      documentId,
    });

    const effectiveConfidence =
      typeof answerPayload.confidence_override === "number" && answerPayload.confidence_label_override
        ? { score: answerPayload.confidence_override, label: answerPayload.confidence_label_override }
        : answerPayload.llm_provider === "gemini_web" && answerPayload.citations?.length
        ? { score: 88, label: "high" }
        : safety.data.confidence;

    this.pushTrace(
      trace,
      "answer",
      "Answer Composer",
      traceProvider === "safety_refusal" ? "warning" : "ok",
      traceProvider === "safety_refusal"
        ? "Returned the safety refusal instead of a composed answer."
        : `Final answer prepared via ${traceProvider}.`,
      {
        provider: traceProvider,
        source_class: answerPayload.source_class,
        citations: Array.isArray(answerPayload.citations) ? answerPayload.citations.length : 0,
        confidence: effectiveConfidence.label,
      }
    );

    const refused =
      typeof answerPayload.refused_override === "boolean"
        ? answerPayload.refused_override
        : answerPayload.llm_provider === "gemini_web"
        ? false
        : allowExternalAnswerDespiteLowSafety
        ? false
        : safety.data.refusal.refused;
    const refusalReason =
      typeof answerPayload.refused_override === "boolean"
        ? undefined
        : answerPayload.llm_provider === "gemini_web"
        ? undefined
        : allowExternalAnswerDespiteLowSafety
        ? undefined
        : safety.data.refusal.reason || undefined;

    const assistantMessage = this.createAssistantMessage({
      answer: answerPayload.answer,
      citations: answerPayload.citations,
      confidence: effectiveConfidence.score,
      confidence_label: effectiveConfidence.label,
      source_class: answerPayload.source_class,
      llm_provider: answerPayload.llm_provider || undefined,
      proposed_actions: actionResult.data.proposals,
      decision_prompt: null,
      trace: this.buildTrace(trace, {
        final_state: refused ? "refused" : "answered",
        provider: traceProvider,
      }),
    });

    session.messages.push({
      id: crypto.randomUUID(),
      role: "user",
      content: externalConsentGranted && userContentForHistory === userMessage ? "Yes" : userContentForHistory,
      createdAt: new Date().toISOString(),
    });
    session.messages.push(assistantMessage);
    session.updatedAt = new Date().toISOString();

    await this.sessionAgent.save(session);

    return this.buildResponse({
      session,
      documentId,
      assistantMessage,
      refused,
      refusal_reason: refusalReason,
    });
  }
}

module.exports = DoctorAssistantAgent;
