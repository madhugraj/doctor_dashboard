class MedicalWebSearchTool {
  constructor(config = {}) {
    this.name = "Medical Web Search";
    this.version = "1.0.0";
    this.config = { timeout: 20000, cacheTtlMs: 24 * 60 * 60 * 1000, ...config };
    this.readSearchCache = config.readSearchCache;
    this.writeSearchCache = config.writeSearchCache;
  }

  cacheKey(source = "", query = "", intent = "") {
    return `${String(source || "").toLowerCase()}::${String(intent || "").toLowerCase()}::${String(query || "").trim().toLowerCase()}`;
  }

  async readCached(source = "", query = "", intent = "") {
    if (typeof this.readSearchCache !== "function") return null;
    try {
      const entries = await this.readSearchCache();
      const key = this.cacheKey(source, query, intent);
      const item = (Array.isArray(entries) ? entries : []).find((entry) => entry.key === key);
      if (!item?.payload || !item.cached_at) return null;
      if (Date.now() - new Date(item.cached_at).getTime() > this.config.cacheTtlMs) return null;
      return item.payload;
    } catch {
      return null;
    }
  }

  async writeCached(source = "", query = "", intent = "", payload = []) {
    if (typeof this.readSearchCache !== "function" || typeof this.writeSearchCache !== "function") return;
    try {
      const entries = await this.readSearchCache();
      const key = this.cacheKey(source, query, intent);
      const next = Array.isArray(entries) ? entries.filter((entry) => entry.key !== key) : [];
      next.unshift({
        key,
        source,
        intent,
        query,
        cached_at: new Date().toISOString(),
        payload,
      });
      await this.writeSearchCache(next.slice(0, 500));
    } catch {}
  }

  async fetchJson(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) {
        throw new Error(`External search failed (${response.status})`);
      }
      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  encode(query) {
    return encodeURIComponent(String(query || "").trim());
  }

  extractMedicationSearchTerm(query = "") {
    const cleaned = String(query || "")
      .replace(/[^\w\s/%.-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const stopwords = new Set([
      "does",
      "it",
      "this",
      "come",
      "in",
      "well",
      "as",
      "the",
      "market",
      "available",
      "availability",
      "what",
      "is",
      "are",
      "for",
      "of",
      "a",
      "an",
      "also",
      "ml",
      "mg",
      "vial",
      "tablet",
      "tablets",
      "syrup",
      "injection",
      "formulation",
      "strength",
      "pack",
      "size",
      "does",
      "drug",
      "medicine",
      "medication",
      "marketed",
      "with",
      "inj",
      "iv",
      "im",
      "po",
      "od",
      "bd",
      "tds",
      "sos",
      "amp",
      "ampoule",
      "capsule",
      "capsules",
      "tab",
      "tabs",
      "cap",
      "caps",
    ]);

    const tokens = cleaned
      .split(/\s+/)
      .filter(Boolean)
      .filter((token) => !/^\d+(\.\d+)?\s*(mg|ml|mcg|g)?$/i.test(token))
      .filter((token) => !/^\d+(\.\d+)?(mg|ml|mcg|g)$/i.test(token))
      .filter((token) => !stopwords.has(token.toLowerCase()))
      .slice(0, 4);

    return tokens.join(" ").trim() || cleaned;
  }

  buildDrugQueries(query = "") {
    const term = this.extractMedicationSearchTerm(query);
    if (!term) return [];

    const base = term.replace(/\bwith\b/gi, "").replace(/\s+/g, " ").trim();
    const variants = new Set([base]);

    const strengthMatch = String(query || "").match(/(\d+(?:\.\d+)?)\s*(mg|ml|mcg|g)\b/i);
    if (strengthMatch) {
      variants.add(`${base} ${strengthMatch[1]} ${strengthMatch[2]}`);
      variants.add(`${base} ${strengthMatch[1]}${strengthMatch[2]}`);
    }

    return Array.from(variants).filter(Boolean);
  }

  extractText(value) {
    if (typeof value === "string") return value.trim();
    if (typeof value === "number") return String(value);
    if (Array.isArray(value)) {
      return value.map((item) => this.extractText(item)).filter(Boolean).join(" ").trim();
    }
    if (value && typeof value === "object") {
      return (
        this.extractText(value.$t) ||
        this.extractText(value._) ||
        this.extractText(value.value) ||
        this.extractText(value.content) ||
        ""
      ).trim();
    }
    return "";
  }

  buildRxNormSearchUrl(name = "") {
    return `https://rxnav.nlm.nih.gov/REST/drugs.json?name=${this.encode(name)}`;
  }

  buildRxNormDisplayUrl(name = "", rxcui = "") {
    if (rxcui) {
      return `https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=${this.encode(rxcui)}`;
    }
    return `https://mor.nlm.nih.gov/RxNav/search?searchBy=RXNAME&searchTerm=${this.encode(name)}`;
  }

  async searchRxNorm(query) {
    const queries = this.buildDrugQueries(query);
    const seen = new Set();
    const preferredResults = [];
    const deferredPackResults = [];
    const lower = String(query || "").toLowerCase();
    const wantsDosage = /\b(dose|dosage|dose range|how much|units?)\b/.test(lower);
    const wantsInjection = /\b(inj|injection|iv|im|sc|subcutaneous)\b/.test(lower);
    const wantsPack = /\b(pack|kit|bundle)\b/.test(lower);

    for (const drug of queries) {
      const payload = await this.fetchJson(this.buildRxNormSearchUrl(drug));
      const groups = Array.isArray(payload?.drugGroup?.conceptGroup) ? payload.drugGroup.conceptGroup : [];

      for (const group of groups) {
        const concepts = Array.isArray(group?.conceptProperties) ? group.conceptProperties : [];
        for (const item of concepts) {
          const tty = String(item?.tty || "");
          const candidateText = `${item?.name || ""} ${item?.synonym || ""}`.toLowerCase();
          const isPackLike = /PCK$/i.test(tty) || /pack|kit|bundle/i.test(candidateText);
          if (!wantsPack && isPackLike) continue;
          if (wantsDosage && /PCK$/i.test(tty)) continue;
          if (wantsDosage && /pack|inhalation/i.test(candidateText)) continue;
          if (wantsInjection && /inhalation|tablet|capsule|oral|powder/i.test(candidateText)) continue;
          const key = `${item?.rxcui || ""}:${item?.name || ""}`;
          if (!item?.name || seen.has(key)) continue;
          seen.add(key);
          const normalized = {
            value: item.name,
            title: item.name,
            snippet: `${item.synonym ? `${item.synonym}. ` : ""}${item.tty ? `Term type: ${item.tty}. ` : ""}${item.rxcui ? `RxCUI: ${item.rxcui}.` : ""}`.trim(),
            source_section: "RxNorm",
            url: this.buildRxNormSearchUrl(drug),
            display_url: this.buildRxNormDisplayUrl(item.name, item.rxcui),
            retrieved_at: new Date().toISOString(),
            confidence: 0.82,
            label: `[RxNorm: ${item.name}]`,
            tty,
          };
          if (isPackLike) deferredPackResults.push(normalized);
          else preferredResults.push(normalized);
          if (preferredResults.length >= 5) return preferredResults;
        }
      }
    }

    return preferredResults.length ? preferredResults : deferredPackResults.slice(0, 5);
  }

  async searchMedlinePlus(query) {
    const results = [];
    const seen = new Set();
    const names = this.buildDrugQueries(query);
    let rxnormCandidates = [];

    try {
      rxnormCandidates = await this.searchRxNorm(query);
    } catch {}

    const candidates = [];
    for (const item of rxnormCandidates.slice(0, 2)) {
      const match = String(item.snippet || "").match(/RxCUI:\s*(\d+)/i);
      candidates.push({
        rxcui: match?.[1] || "",
        name: item.title || item.value || "",
      });
    }

    if (!candidates.length) {
      for (const name of names.slice(0, 2)) {
        candidates.push({ rxcui: "", name });
      }
    }

    for (const candidate of candidates) {
      const params = new URLSearchParams({
        "mainSearchCriteria.v.cs": "2.16.840.1.113883.6.88",
        knowledgeResponseType: "application/json",
        "informationRecipient.languageCode.c": "en",
      });
      if (candidate.rxcui) params.set("mainSearchCriteria.v.c", candidate.rxcui);
      if (candidate.name) params.set("mainSearchCriteria.v.dn", candidate.name);

      const url = `https://connect.medlineplus.gov/service?${params.toString()}`;
      const payload = await this.fetchJson(url);
      const feed = payload?.feed || payload;
      const entries = Array.isArray(feed?.entry) ? feed.entry : feed?.entry ? [feed.entry] : [];

      for (const entry of entries) {
        const title = this.extractText(entry?.title);
        const snippet =
          this.extractText(entry?.summary) ||
          this.extractText(entry?.content) ||
          this.extractText(entry?.subtitle) ||
          "MedlinePlus information retrieved.";
        const links = Array.isArray(entry?.link) ? entry.link : entry?.link ? [entry.link] : [];
        const displayUrl =
          links.find((link) => typeof link?.href === "string" && /medlineplus\.gov/i.test(link.href))?.href ||
          "https://medlineplus.gov/druginformation.html";
        const key = `${title}|${displayUrl}`;
        if (!title || seen.has(key)) continue;
        seen.add(key);
        results.push({
          value: title,
          title,
          snippet,
          source_section: "MedlinePlus",
          url,
          display_url: displayUrl,
          retrieved_at: new Date().toISOString(),
          confidence: 0.8,
          label: `[MedlinePlus: ${title}]`,
        });
        if (results.length >= 5) return results;
      }
    }

    return results;
  }

  async searchIcd(query) {
    const url = `https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search?sf=code,name&terms=${this.encode(query)}&maxList=3`;
    const payload = await this.fetchJson(url);
    const codes = Array.isArray(payload?.[1]) ? payload[1] : [];
    const displays = Array.isArray(payload?.[3]) ? payload[3] : [];

    const rows = displays.length
      ? displays.map((row, index) => {
          if (Array.isArray(row)) return row;
          return [codes[index] || "", row];
        })
      : codes.map((code, index) => [code, Array.isArray(payload?.[2]) ? payload[2][index] || "" : ""]);

    return rows
      .filter((row) => row && row[0] && row[1])
      .map((row) => ({
      value: `${row[0]} ${row[1]}`.trim(),
      title: row[1],
      snippet: `ICD-10-CM code ${row[0]}: ${row[1]}`,
      source_section: "NLM ICD-10-CM",
      url: `https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search?terms=${this.encode(query)}`,
      retrieved_at: new Date().toISOString(),
      confidence: 0.9,
      label: `[NLM ICD-10-CM: ${row[0]}]`,
    }));
  }

  async searchOpenFda(query) {
    const queries = this.buildDrugQueries(query);
    const results = [];
    const lower = String(query || "").toLowerCase();
    const wantsPurpose = /\b(what does|used for|purpose|why do we need|role|indication)\b/.test(lower);
    const wantsComposition = /\b(composition|ingredient|contains|active ingredient)\b/.test(lower);
    const wantsDosage = /\b(dose|dosage|dose range|how much|units?)\b/.test(lower);

    for (const drug of queries) {
      const searchExpr = [
        `openfda.brand_name:"${drug}"`,
        `openfda.generic_name:"${drug}"`,
        `openfda.substance_name:"${drug}"`,
      ].join("+OR+");
      const url = `https://api.fda.gov/drug/label.json?search=${searchExpr}&limit=2`;

      try {
        const payload = await this.fetchJson(url);
        results.push(
          ...(payload.results || []).map((item) => ({
            value: item.openfda?.generic_name?.[0] || drug,
            title: item.openfda?.brand_name?.[0] || item.openfda?.generic_name?.[0] || drug,
            snippet:
              (wantsDosage
                ? item.dosage_and_administration?.[0] || item.indications_and_usage?.[0] || item.description?.[0]
                : wantsPurpose
                ? item.indications_and_usage?.[0] || item.dosage_and_administration?.[0] || item.description?.[0]
                : wantsComposition
                ? item.description?.[0] || item.indications_and_usage?.[0]
                : item.description?.[0] || item.dosage_and_administration?.[0] || item.indications_and_usage?.[0]) ||
              item.warnings?.[0] ||
              "FDA label data retrieved.",
            source_section: "FDA Drug Label",
            url:
              item.openfda?.spl_set_id?.[0]
                ? `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${item.openfda.spl_set_id[0]}`
                : url,
            raw_url: url,
            retrieved_at: new Date().toISOString(),
            confidence: 0.8,
            label: `[FDA: ${item.openfda?.brand_name?.[0] || drug}]`,
          }))
        );
        if (results.length) break;
      } catch (error) {
        if (queries.length === 1) throw error;
      }
    }

    return results;
  }

  async searchPubMed(query) {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=3&term=${this.encode(query)}`;
    const searchPayload = await this.fetchJson(searchUrl);
    const ids = searchPayload?.esearchresult?.idlist || [];
    if (!ids.length) return [];

    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`;
    const summaryPayload = await this.fetchJson(summaryUrl);

    return ids
      .map((id) => {
        const item = summaryPayload?.result?.[id];
        if (!item) return null;
        return {
          value: item.title || `PMID ${id}`,
          title: item.title || `PMID ${id}`,
          snippet: `${item.fulljournalname || "PubMed"}${item.pubdate ? `, ${item.pubdate}` : ""}`,
          source_section: "PubMed",
          url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
          retrieved_at: new Date().toISOString(),
          confidence: 0.78,
          label: `[PubMed: ${id}]`,
        };
      })
      .filter(Boolean);
  }

  async searchClinicalTrials(query) {
    const url = `https://clinicaltrials.gov/api/v2/studies?query.term=${this.encode(query)}&pageSize=3`;
    const payload = await this.fetchJson(url);
    const studies = payload?.studies || [];
    return studies.map((item) => ({
      value:
        item.protocolSection?.identificationModule?.briefTitle ||
        item.protocolSection?.identificationModule?.nctId ||
        "Clinical trial",
      title:
        item.protocolSection?.identificationModule?.briefTitle ||
        item.protocolSection?.identificationModule?.nctId ||
        "Clinical trial",
      snippet: `${item.protocolSection?.conditionsModule?.conditions?.[0] || ""}`.trim(),
      source_section: "ClinicalTrials.gov",
      url: item.protocolSection?.identificationModule?.nctId
        ? `https://clinicaltrials.gov/study/${item.protocolSection.identificationModule.nctId}`
        : "https://clinicaltrials.gov/",
      retrieved_at: new Date().toISOString(),
      confidence: 0.72,
      label: `[ClinicalTrials: ${item.protocolSection?.identificationModule?.nctId || "Study"}]`,
    }));
  }

  async searchBySource(source, query, intent) {
    if (!query) return [];
    const cached = await this.readCached(source, query, intent);
    if (cached) return cached;

    let result = [];
    if (source === "icd") result = await this.searchIcd(query);
    else if (source === "rxnorm") result = await this.searchRxNorm(query);
    else if (source === "medlineplus") result = await this.searchMedlinePlus(query);
    else if (source === "openfda") result = await this.searchOpenFda(query);
    else if (source === "pubmed") result = await this.searchPubMed(query);
    else if (source === "clinicaltrials") result = await this.searchClinicalTrials(query);

    await this.writeCached(source, query, intent, result);
    return result;
  }

  async search({ query, intent, sources = [] }) {
    if (!query) return [];

    if (Array.isArray(sources) && sources.length) {
      const settled = await Promise.allSettled(sources.map((source) => this.searchBySource(source, query, intent)));
      return settled.flatMap((item) => (item.status === "fulfilled" ? item.value : []));
    }

    if (intent === "diagnosis_code") return this.searchIcd(query);
    if (intent === "drug_safety") {
      const [rxnorm, medlineplus, fda, pubmed] = await Promise.allSettled([
        this.searchRxNorm(query),
        this.searchMedlinePlus(query),
        this.searchOpenFda(query),
        this.searchPubMed(query),
      ]);
      return [
        ...(rxnorm.status === "fulfilled" ? rxnorm.value : []),
        ...(medlineplus.status === "fulfilled" ? medlineplus.value : []),
        ...(fda.status === "fulfilled" ? fda.value : []),
        ...(pubmed.status === "fulfilled" ? pubmed.value : []),
      ];
    }
    if (intent === "literature_query" || intent === "guideline_query") return this.searchPubMed(query);
    if (/trial/i.test(query)) return this.searchClinicalTrials(query);

    const [medlineplus, pubmed, fda] = await Promise.allSettled([
      this.searchMedlinePlus(query),
      this.searchPubMed(query),
      this.searchOpenFda(query),
    ]);
    return [
      ...(medlineplus.status === "fulfilled" ? medlineplus.value : []),
      ...(pubmed.status === "fulfilled" ? pubmed.value : []),
      ...(fda.status === "fulfilled" ? fda.value : []),
    ];
  }
}

module.exports = MedicalWebSearchTool;
