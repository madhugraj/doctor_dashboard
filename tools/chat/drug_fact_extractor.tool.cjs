class DrugFactExtractorTool {
  constructor(config = {}) {
    this.name = "Drug Fact Extractor";
    this.version = "1.0.0";
    this.config = config;
  }

  firstSentence(text = "", maxLength = 260) {
    const cleaned = String(text || "").replace(/\s+/g, " ").trim();
    if (!cleaned) return "";
    const sentence = cleaned.match(/.+?[.!?](?:\s|$)/)?.[0]?.trim() || cleaned;
    return sentence.length > maxLength ? `${sentence.slice(0, maxLength - 1).trim()}…` : sentence;
  }

  pick(items = [], matcher) {
    return (Array.isArray(items) ? items : []).find((item) => matcher(String(item.source_section || ""), String(item.source_excerpt || ""), String(item.value || "")));
  }

  extract({ message = "", externalEvidence = [], resolution = {} } = {}) {
    const lower = String(message || "").toLowerCase();
    const evidence = Array.isArray(externalEvidence) ? externalEvidence : [];
    const resolved = resolution && typeof resolution === "object" ? resolution : {};
    const generic = resolved.generic_name || resolved.normalized_display || resolved.primary_mention || "";

    if (!evidence.length) return null;

    const medline = this.pick(evidence, (section) => /medlineplus/i.test(section));
    const fda = this.pick(evidence, (section, excerpt) => /fda drug label/i.test(section) && /(indications|usage|used|active ingredient|contains)/i.test(excerpt));
    const fdaDosage = this.pick(evidence, (section, excerpt) => /fda drug label/i.test(section) && /(dosage|dose|administration|units?)/i.test(excerpt));
    const rxnorm = this.pick(evidence, (section) => /rxnorm/i.test(section));
    const fdaText = String(fda?.source_excerpt || "").toLowerCase();

    if (/\b(composition|ingredient)\b/.test(lower)) {
      if (fda) {
        let sentence = this.firstSentence(fda.source_excerpt || fda.value);
        const eachContains = String(fda.source_excerpt || "").match(/Each [^.]* contains ([^.]+)\./i);
        if (eachContains?.[1]) sentence = `Contains ${eachContains[1].trim()}.`;
        return { answer: generic ? `${generic}: ${sentence}` : sentence, citations: [fda] };
      }
      if (rxnorm) {
        const sentence = this.firstSentence(rxnorm.source_excerpt || rxnorm.value);
        return { answer: generic ? `${generic}: ${sentence}` : sentence, citations: [rxnorm] };
      }
    }

    if (/\b(what does|used for|purpose|why do we need|role)\b/.test(lower)) {
      if (medline) {
        const sentence = this.firstSentence(medline.source_excerpt || medline.value);
        return {
          answer: generic ? `${generic} is used for ${sentence.replace(/^[Tt]his medicine is used for\s*/i, "").replace(/\.$/, "")}.` : sentence,
          citations: [medline],
        };
      }
      if (fda) {
        let sentence = this.firstSentence(fda.source_excerpt || fda.value);
        if (/proton pump inhibitor|ppi|inhibits gastric acid secretion/.test(fdaText)) {
          sentence = `${generic || "This medicine"} reduces gastric acid secretion and is used for acid-related disorders.`;
        } else if (/thyroxine|t4|thyroid gland/.test(fdaText)) {
          sentence = `${generic || "This medicine"} is synthetic thyroid hormone replacement.`;
        } else if (/antibiotic|antibacterial/.test(fdaText)) {
          sentence = `${generic || "This medicine"} is an antibiotic used for bacterial infections.`;
        } else if (/loop diuretic/.test(fdaText)) {
          sentence = `${generic || "This medicine"} is a loop diuretic used to remove excess fluid.`;
        } else if (/osmotic diuretic/.test(fdaText)) {
          sentence = `${generic || "This medicine"} is an osmotic agent used to reduce intracranial or intraocular pressure and promote diuresis.`;
        }
        return { answer: generic ? `${generic}: ${sentence}` : sentence, citations: [fda] };
      }
    }

    if (/\b(dose|dosage|dose range|how much|units?)\b/.test(lower)) {
      if (fdaDosage) {
        return {
          answer: this.firstSentence(fdaDosage.source_excerpt || fdaDosage.value),
          citations: [fdaDosage],
        };
      }
      if (medline && /\b(dose|dosage|units?)\b/i.test(`${medline.source_excerpt || ""} ${medline.value || ""}`)) {
        return {
          answer: this.firstSentence(medline.source_excerpt || medline.value),
          citations: [medline],
        };
      }
      return null;
    }

    if (/\b(alternative|substitute|replace|comparison)\b/.test(lower)) {
      const preferred = medline || rxnorm || fda;
      if (preferred) {
        return { answer: this.firstSentence(preferred.source_excerpt || preferred.value), citations: [preferred] };
      }
    }

    const top = medline || fda || rxnorm || evidence[0];
    if (!top) return null;
    return { answer: this.firstSentence(top.source_excerpt || top.value), citations: [top] };
  }
}

module.exports = DrugFactExtractorTool;
