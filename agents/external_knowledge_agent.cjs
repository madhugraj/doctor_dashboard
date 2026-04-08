const MedicalWebSearchTool = require("../tools/chat/medical_web_search.tool.cjs");
const SourcePolicyTool = require("../tools/chat/source_policy.tool.cjs");
const ExternalSourceRankerTool = require("../tools/chat/external_source_ranker.tool.cjs");
const ExternalCitationNormalizerTool = require("../tools/chat/external_citation_normalizer.tool.cjs");
const ExternalQueryPlannerTool = require("../tools/chat/external_query_planner.tool.cjs");
const SourceRouterTool = require("../tools/chat/source_router.tool.cjs");
const DrugEntityResolverTool = require("../tools/chat/drug_entity_resolver.tool.cjs");

class ExternalKnowledgeAgent {
  constructor(config = {}) {
    this.name = "External Knowledge Agent";
    this.version = "1.0.0";
    this.searchTool = new MedicalWebSearchTool(config);
    this.sourcePolicy = new SourcePolicyTool(config);
    this.ranker = new ExternalSourceRankerTool(config);
    this.normalizer = new ExternalCitationNormalizerTool(config);
    this.queryPlanner = new ExternalQueryPlannerTool(config);
    this.sourceRouter = new SourceRouterTool(config);
    this.drugResolver = new DrugEntityResolverTool(config);
  }

  extractTerms(text = "") {
    const stopwords = new Set([
      "what",
      "why",
      "how",
      "does",
      "do",
      "is",
      "the",
      "for",
      "with",
      "and",
      "or",
      "of",
      "to",
      "in",
      "patient",
      "patients",
      "code",
      "icd",
      "cm",
      "mg",
      "ml",
      "tab",
      "inj",
    ]);

    return String(text || "")
      .toLowerCase()
      .replace(/[^\w\s.-]/g, " ")
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 2 && !stopwords.has(item));
  }

  filterRelevantResults(results = [], plan = {}) {
    const knowledgeType = String(plan.knowledge_type || "").toLowerCase();
    if (knowledgeType === "coding_reference") return results;
    if (knowledgeType === "drug_knowledge" || knowledgeType === "drug_comparison") return results;

    const resolvedTerms = [
      plan.resolved_entity?.generic_name,
      plan.resolved_entity?.normalized_display,
      ...(plan.resolved_entity?.ingredient_list || []),
    ].filter(Boolean);
    const terms = this.extractTerms([plan.entity, plan.search_queries?.[0], ...resolvedTerms].filter(Boolean).join(" "));
    if (!terms.length) return results;

    return results.filter((item) => {
      const source = `${item.source_section || ""} ${item.url || ""}`.toLowerCase();
      if (/fda|dailymed|clinicaltables|rxnorm|medlineplus/.test(source)) return true;

      const haystack = `${item.title || ""} ${item.value || ""} ${item.snippet || ""}`.toLowerCase();
      return terms.some((term) => haystack.includes(term));
    });
  }

  emptyResolvedEntity() {
    return {
      primary_mention: "",
      normalized_display: "",
      generic_name: "",
      ingredient_list: [],
      dosage_form: "",
      strength: "",
      matched_internal_value: "",
      confidence: 0,
    };
  }

  async execute({ query, classification, internalEvidence = [] }) {
    try {
      const plan = await this.queryPlanner.plan(query, classification);
      if (plan.knowledge_type === "drug_knowledge" || plan.knowledge_type === "drug_comparison") {
        plan.resolved_entity = (await this.drugResolver.resolve(query, internalEvidence)) || this.emptyResolvedEntity();
        const resolvedTerms = [
          plan.resolved_entity?.generic_name,
          plan.resolved_entity?.normalized_display,
          plan.resolved_entity?.primary_mention,
        ].filter(Boolean);
        if (resolvedTerms.length) {
          plan.entity = resolvedTerms[0];
          plan.search_queries = Array.from(new Set([...resolvedTerms, ...plan.search_queries].filter(Boolean))).slice(0, 5);
        }
      }
      if (plan.needs_clarification) {
        return {
          success: true,
          step: "external_knowledge",
          data: {
            evidence: [],
            source_class: "external",
            error: plan.clarification_prompt || "External clarification needed.",
            error_type: "clarification_needed",
            plan,
            sources: [],
          },
        };
      }

      const sources = this.sourceRouter.route({ plan, classification, query });
      const rawResults = [];

      for (const searchQuery of plan.search_queries) {
        const chunk = await this.searchTool.search({
          query: searchQuery,
          intent: classification?.intent,
          sources,
        });
        rawResults.push(...chunk);
        if (rawResults.length >= 18) break;
      }

      const allowed = this.sourcePolicy.filter(rawResults);
      const relevant = this.filterRelevantResults(allowed, plan);
      let ranked = this.ranker.rank(relevant, plan.search_queries[0] || query, 8, {
        knowledgeType: plan.knowledge_type,
        intent: classification?.intent,
        entity: plan.entity,
      });

      const sourceText = (item = {}) => `${item.source_section || ""} ${item.url || ""}`.toLowerCase();
      const hasDrugInfoIntent =
        plan.knowledge_type === "drug_knowledge" &&
        /\b(what does|used for|purpose|why do we need|what is .* for|indication|alternative|substitute|replace)\b/i.test(
          String(query || "")
        );

      if (
        plan.knowledge_type === "drug_knowledge" &&
        /\b(composition|ingredient|formulation|strength|dose|dosage|syrup|tablet|injection|come with|come in|availability|market)\b/i.test(String(query || ""))
      ) {
        const structural = ranked.filter((item) => /rxnorm|medlineplus|fda|dailymed/i.test(sourceText(item)));
        ranked = structural.length ? structural : [];
      }

      if (hasDrugInfoIntent) {
        const informative = ranked.filter((item) => /rxnorm|medlineplus|fda|dailymed/i.test(sourceText(item)));
        ranked = informative.length ? informative : ranked;
      }

      return {
        success: true,
        step: "external_knowledge",
        data: {
          evidence: this.normalizer.normalizeMany(ranked),
          source_class: "external",
          error: ranked.length ? null : "No reliable external results found.",
          error_type: ranked.length ? null : "no_results",
          plan,
          resolution: plan.resolved_entity || null,
          sources,
        },
      };
    } catch (error) {
      return {
        success: true,
        step: "external_knowledge",
        data: {
          evidence: [],
          source_class: "external",
          error: error.message,
          error_type: "search_failed",
          plan: null,
          resolution: null,
          sources: [],
        },
      };
    }
  }
}

module.exports = ExternalKnowledgeAgent;
