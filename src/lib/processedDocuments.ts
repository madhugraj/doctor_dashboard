import { normalizeRiskEntry, normalizeRiskLevel } from "@/lib/riskNormalization";
import type { DashboardPatientData } from "@/data/patientData";

const API_ROOT = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export const API_BASE = `${API_ROOT}/api`;

export type QueueStatus = "queued" | "processing" | "processed" | "failed";

export type GemmaDashboardResult = {
  meta?: {
    pdf_file?: string;
    report_complexity?: string;
    estimated_pages?: number;
    department_type?: string;
    drg?: string;
  };
  extracted_data?: {
    patient?: {
      name?: string;
      mrn?: string;
      age?: number;
      gender?: string;
      admission_date?: string;
      discharge_date?: string;
    };
    diagnosis?: {
      principal?: string;
      icd_code?: string;
      secondary?: string[];
      comorbidities?: string[];
      drg?: string;
    };
    risk_scores?: {
      fall_risk?: { score?: number; level?: string | null };
      dvt_risk?: { score?: number; level?: string | null };
      pressure_ulcer_risk?: { score?: number; level?: string | null };
      aspiration_risk?: { score?: number; level?: string | null };
      ews_score?: number | null;
      gcs?: { total?: number | null };
    };
    functional_status?: {
      overall_assistance_needs?: string;
      mobility_notes?: string;
    };
    medications?: Array<{ name?: string; dose?: string; frequency?: string }>;
    allergies?: string[];
    investigations?: string[];
    treatment?: {
      current_approach?: string;
      management_items?: string[];
      procedures?: string[];
      response?: string;
      complications?: string[];
    };
    nursing_needs?: string[];
    clinical_notes?: Array<{
      type?: string;
      author?: string;
      date?: string;
      summary?: string;
      situation?: string;
      background?: string;
      assessment?: string;
      recommendations?: string;
      pending_items?: string[];
      risk_flags?: string[];
      handed_over_by?: string;
      handed_over_to?: string;
      source_excerpt?: string[];
    }>;
    pending_items?: {
      pending_labs?: Array<{
        test_name?: string;
        expected_date?: string;
        reason?: string;
        priority?: "high" | "medium" | "low";
        source_section?: string;
        source_excerpt?: string;
      }>;
      pending_radiology?: Array<{
        type?: string;
        body_part?: string;
        scheduled_date?: string;
        reason?: string;
        priority?: "high" | "medium" | "low";
        source_section?: string;
        source_excerpt?: string;
      }>;
      pending_followups?: Array<{
        department?: string;
        provider?: string;
        date?: string;
        time?: string;
        purpose?: string;
        priority?: "high" | "medium" | "low";
        source_section?: string;
        source_excerpt?: string;
      }>;
      medication_reconciliation?: {
        status?: "complete" | "attention_needed";
        medication_count?: number;
        allergy_count?: number;
        concerns?: string;
        source_section?: string;
        source_excerpt?: string;
      };
      pending_discharge_items?: Array<{
        item?: string;
        reason?: string;
        priority?: "high" | "medium" | "low";
        source_section?: string;
        source_excerpt?: string;
      }>;
      summary?: {
        total_pending?: number;
        needs_attention?: number;
        scheduled?: number;
        complete?: number;
      };
    };
    lab_results?: Array<{ test_name?: string; test?: string; value?: string; reference?: string; ref?: string; flag?: string; status?: string }>;
    provenance?: {
      vitals?: {
        systolic?: {
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        } | null;
        diastolic?: {
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        } | null;
        pulse?: {
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        } | null;
        spo2?: {
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        } | null;
        temperature?: {
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        } | null;
        respiratory_rate?: {
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        } | null;
      };
      diagnosis?: {
        principal?: {
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        } | null;
        secondary?: Array<{
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        }>;
      };
      medications?: Array<{
        value?: string;
        source_section?: string;
        source_excerpt?: string;
        source_page?: number | null;
        confidence?: number;
        provenance_type?: "quoted" | "normalized" | "derived";
      }>;
      discharge?: {
        dietary?: Array<{
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        }>;
        instructions?: Array<{
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        }>;
        red_flags?: Array<{
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        }>;
      };
      labs?: {
        results?: Array<{
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        }>;
        investigations?: Array<{
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        }>;
      };
      radiology?: {
        findings?: Array<{
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        }>;
        pending?: Array<{
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        }>;
      };
      treatment?: {
        current_approach?: {
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        } | null;
        management_items?: Array<{
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        }>;
        procedures?: Array<{
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        }>;
        response?: {
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        } | null;
        complications?: Array<{
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        }>;
      };
      handover?: {
        overview?: {
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        } | null;
        notes?: Array<{
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        }>;
      };
      follow_up?: {
        items?: Array<{
          value?: string;
          source_section?: string;
          source_excerpt?: string;
          source_page?: number | null;
          confidence?: number;
          provenance_type?: "quoted" | "normalized" | "derived";
        }>;
      };
    };
    latest?: {
      bp?: { systolic?: number; diastolic?: number; status?: string };
      pulse?: { value?: number; status?: string };
      temperature?: { value?: number; unit?: string };
      resp_rate?: number;
      spo2?: { value?: number; status?: string };
      grbs?: { value?: number; interpretation?: string };
    };
  };
  dashboard_cards?: {
    vitals_card?: {
      status?: string;
      summary?: { latest_bp?: string; pulse?: string; temp?: string; spo2?: string };
      trend?: string;
      data_points?: number;
      has_alerts?: boolean;
    };
    diagnosis_card?: {
      principal_diagnosis?: string;
      icd_code?: string;
      secondary_count?: number;
      secondary_diagnoses?: string[];
      procedures_count?: number;
    };
    medications_card?: {
      active_count?: number;
      allergy_count?: number;
      allergies?: string[];
      categories?: Array<string | { name?: string; count?: number }>;
      medication_list?: Array<{ name?: string; dose?: string; frequency?: string }>;
    };
    labs_card?: {
      total_tests?: number;
      abnormal_count?: number;
      critical_count?: number;
      pending_count?: number;
      top_abnormal?: string;
      lab_results?: Array<{ test?: string; value?: string; reference?: string; flag?: string }>;
      investigations_list?: string[];
      has_results?: boolean;
      note?: string;
    };
    radiology_card?: {
      studies_completed?: number;
      critical_findings?: number;
      key_finding?: string;
    };
    treatment_card?: {
      procedures_performed?: number;
      surgeries?: number;
      response?: string;
      current_approach?: string;
      management_items?: string[];
      complications_count?: number;
    };
    clinical_notes_card?: {
      total_notes?: number;
      last_update?: string;
      notes?: Array<{
        type?: string;
        author?: string;
        date?: string;
        summary?: string;
        situation?: string;
        background?: string;
        assessment?: string;
        recommendations?: string;
        pending_items?: string[];
        risk_flags?: string[];
        handed_over_by?: string;
        handed_over_to?: string;
        source_excerpt?: string[];
      }>;
    };
    discharge_plan_card?: {
      condition?: string;
      instruction_count?: number;
      red_flags?: number;
    };
    follow_up_card?: {
      next_appointment?: string;
      appointment_count?: number;
    };
  };
  sample_patient_data?: {
    name?: string;
    age?: number;
    mrn?: string;
    admission_date?: string;
    discharge_date?: string;
    los_days?: number;
    summary?: string;
  };
  presentation?: {
    summary_cards?: Record<
      string,
      {
        section?: string;
        title?: string;
        headline_metric?: string;
        secondary_line?: string;
        supporting_points?: string[];
        status?: string;
        provenance_status?: "source_backed" | "mixed" | "derived_only" | "insufficient_evidence";
      }
    >;
    notes_rail?: Array<{
      title?: string;
      author?: string;
      timestamp?: string;
      body?: string;
      priority?: "normal" | "warning" | "critical";
      category?: "doctor" | "nurse" | "handover" | "result" | "treatment";
      provenance?: Array<{
        value?: string;
        source_section?: string;
        source_excerpt?: string;
        source_page?: number | null;
        confidence?: number;
        provenance_type?: "quoted" | "normalized" | "derived";
      }>;
    }>;
  };
};

export type ProcessedDocument = {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
  status: QueueStatus;
  department: string;
  result?: GemmaDashboardResult | null;
  error?: string | null;
  processedAt?: string;
  agentInfo?: {
    name: string;
    version: string;
    latency: number;
    tokensUsed: number;
    steps: Array<{
      success: boolean;
      tokens: number;
      latency: number;
      dataKeys: string[];
      validationIssues: number;
    }>;
    validation: {
      confidence_level: string;
      inconsistencies_found: string[];
      missing_critical_fields: string[];
    };
  };
};

export const extractProcessedDocumentResponse = (payload: unknown): ProcessedDocument | null => {
  if (!payload || typeof payload !== "object") return null;

  const candidate =
    "document" in payload
      ? (payload as { document?: unknown }).document
      : payload;

  if (!candidate || typeof candidate !== "object") return null;
  if (!("id" in candidate) || !("status" in candidate)) return null;

  return candidate as ProcessedDocument;
};

type PresentationCard = {
  section: string;
  title: string;
  headlineMetric: string;
  secondaryLine: string;
  supportingPoints: string[];
  status: string;
  provenanceStatus: ProvenanceStatus;
};

type PresentationRailItem = {
  title: string;
  author: string;
  timestamp: string;
  body: string;
  priority: "normal" | "warning" | "critical";
  category: "doctor" | "nurse" | "handover" | "result" | "treatment";
  provenance: ProvenanceItem[];
};

const isLowValuePresentationNote = (item: { title?: string; body?: string }) => {
  const title = String(item.title || "").trim().toLowerCase();
  const body = String(item.body || "").trim().toLowerCase();
  const combined = `${title} ${body}`.trim();

  if (!combined) return true;
  if (/diet:\s*(npo|nbm|nil per mouth)\b/.test(combined)) return true;
  if (/discharge planning/.test(title) && body.length < 60) return true;
  if (/medication orders?|nursing care plan status|patient measurable goal/.test(combined)) return true;

  return false;
};

const mapPresentationStatus = (value?: string) => {
  switch (String(value || "").toLowerCase()) {
    case "source_backed":
      return "source_backed" as const;
    case "mixed":
      return "mixed" as const;
    case "derived_only":
      return "derived_only" as const;
    default:
      return "insufficient_evidence" as const;
  }
};

const mapCardStatus = (value?: string) => {
  switch (String(value || "").toLowerCase()) {
    case "stable":
      return "normal";
    case "review":
    case "elevated":
      return "warning";
    default:
      return String(value || "neutral").toLowerCase() || "neutral";
  }
};

const parseClinicalNoteTimestamp = (value?: string, fallbackYear?: number) => {
  const normalized = String(value || "").trim();
  if (!normalized) return Number.NEGATIVE_INFINITY;

  const slashMatch = normalized.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (slashMatch) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] = slashMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    const timestamp = Date.UTC(
      Number(fullYear),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
    if (!Number.isNaN(timestamp)) return timestamp;
  }

  const direct = Date.parse(normalized);
  if (!Number.isNaN(direct)) return direct;

  if (fallbackYear) {
    const withCommaYear = Date.parse(`${normalized}, ${fallbackYear}`);
    if (!Number.isNaN(withCommaYear)) return withCommaYear;

    const withYear = Date.parse(`${normalized} ${fallbackYear}`);
    if (!Number.isNaN(withYear)) return withYear;
  }

  return Number.NEGATIVE_INFINITY;
};

export const getProcessedDocumentPatientName = (document: ProcessedDocument) =>
  document.result?.sample_patient_data?.name?.trim() || "";

export const getProcessedDocumentMrn = (document: ProcessedDocument) =>
  document.result?.sample_patient_data?.mrn?.trim() || "";

export const matchesProcessedDocumentQuery = (document: ProcessedDocument, query: string) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return [
    document.name,
    document.department,
    getProcessedDocumentPatientName(document),
    getProcessedDocumentMrn(document),
  ]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(normalized));
};

const parseBp = (bp?: string | { systolic: number; diastolic: number }) => {
  // If already an object with systolic/diastolic, return it
  if (typeof bp === 'object' && bp !== null) {
    return {
      systolic: bp.systolic || 120,
      diastolic: bp.diastolic || 80,
    };
  }
  // Otherwise parse from string
  const match = String(bp || '').match(/(\d+)\s*\/\s*(\d+)/);
  return {
    systolic: match ? Number(match[1]) : 120,
    diastolic: match ? Number(match[2]) : 80,
  };
};

const parseNumeric = (value?: string | number, fallback = 0) => {
  // If already a number, return it
  if (typeof value === 'number') {
    return value;
  }
  // Otherwise parse from string
  const match = String(value || '').match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : fallback;
};

const createRange = (count: number, mapper: (index: number) => string) =>
  Array.from({ length: Math.max(count, 0) }, (_, index) => mapper(index));

const dedupeStrings = (items: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const item of items) {
    const normalized = item?.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }

  return output;
};

const dedupeBy = <T,>(items: T[], getKey: (item: T) => string) => {
  const seen = new Set<string>();
  const output: T[] = [];

  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  return output;
};

const dedupeMedicationEntries = <
  T extends {
    name?: string;
    dose?: string;
    frequency?: string;
    route?: string;
    category?: string;
    start?: string;
    instructions?: string;
  },
>(
  items: T[]
) => {
  const seen = new Set<string>();
  const output: T[] = [];

  for (const item of items) {
    const key = [
      item?.name,
      item?.dose,
      item?.frequency,
      item?.route,
      item?.category,
      item?.start,
      item?.instructions,
    ]
      .map((value) => String(value || "").trim().toLowerCase())
      .join("|");

    if (!String(item?.name || "").trim() || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  return output;
};

const isNoisyClinicalItem = (value: string) =>
  /^(?:\d+\s+of\s+\d+|--\s*\d+\s+of\s+\d+\s*--|Hospital No:|Visit No:|Name:|Doctor Name:|MEDICINES-:|Diet -:)/i.test(
    value.trim()
  );

const cleanClinicalItem = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .replace(/PHYSIOTHERAY/gi, "PHYSIOTHERAPY")
    .replace(/\s+&\s+/g, " & ")
    .trim();

const splitDelimitedItems = (value?: string) =>
  String(value || "")
    .split(/[;,]/)
    .map(cleanClinicalItem)
    .filter(Boolean);

const splitInstructionList = (value?: string) => {
  const input = cleanClinicalItem(value || "");
  if (!input) return [];

  const items: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of input) {
    if (char === "(") depth += 1;
    if (char === ")" && depth > 0) depth -= 1;

    if (char === "," && depth === 0) {
      const normalized = cleanClinicalItem(current);
      if (normalized) items.push(normalized);
      current = "";
      continue;
    }

    current += char;
  }

  const finalItem = cleanClinicalItem(current);
  if (finalItem) items.push(finalItem);

  return items
    .map((item) => item.replace(/^\d+[\).]?\s*/, ""))
    .filter(Boolean);
};

const isMedicationLikeItem = (value: string) =>
  /^(?:INJ|TAB|CAP|SYR|SYP|IV FLUID|NEB|DROP|OINT|CREAM|LOTION)\b/i.test(value.trim());

const isInvestigationLikeItem = (value: string) =>
  /(CBC|CRP|SODIUM|POTASSIUM|UREA|CREAT|PT|APTT|INR|SEROLOG|LFT|LIPID|TSH|GROUPING|RH|URINE|XRAY|ECHOCARDIOGRAM|CT SCAN|USG|ECG|pending reports?)/i.test(
    value
  );

const isDietInstruction = (value: string) =>
  /(?:^|\b)(NPM|NBM|diet|oral feed|liquid diet|soft diet|regular diet|tube feed|nil per mouth)\b/i.test(value);

const isGenericPlanBucket = (value: string) =>
  /^(?:IV Fluids|Miscellaneous|Medications|Radiology|Planned procedure)$/i.test(value.trim());

const formatDietInstruction = (value: string) => {
  const cleaned = cleanClinicalItem(value);
  if (/^NPM$/i.test(cleaned)) return "Nil per mouth (NPM)";
  return cleaned;
};

const isPatientInstruction = (value: string) =>
  /^(?:maintain|avoid|drink|take|continue|do|use|keep|follow|review|report back|return|mobili[sz]e|walk|rest)/i.test(
    value.trim()
  );

const isNonInstructionCareItem = (value: string) =>
  /(risk\b|high risk|low risk|due for|came to daycare|admitted to|multiple myeloma|chemotherapy|nursing diagnosis|goal to|patient is|report back if)/i.test(
    value.trim()
  );

const normalizePendingReviewItems = (items: string[]) => {
  const output: string[] = [];

  for (const rawItem of items) {
    const cleaned = cleanClinicalItem(rawItem)
      .replace(/^BLOOD FOR\s*-:\s*/i, "")
      .replace(/^URINE FOR\s*-:\s*/i, "URINE ")
      .replace(/\s+,/g, ",")
      .replace(/,\s*$/, "")
      .replace(/\.\s*$/, "")
      .trim();

    if (
      !cleaned ||
      isNoisyClinicalItem(cleaned) ||
      isMedicationLikeItem(cleaned) ||
      isDietInstruction(cleaned) ||
      isGenericPlanBucket(cleaned) ||
      /^MEDICINES-:?$/i.test(cleaned)
    ) {
      continue;
    }

    const lastIndex = output.length - 1;
    const previous = lastIndex >= 0 ? output[lastIndex] : "";

    if (/^TYPING$/i.test(cleaned) && /GROUPING\s*&\s*RH$/i.test(previous)) {
      output[lastIndex] = `${previous} TYPING`;
      continue;
    }

    if (/^(?:R\/E,?\s*C\/S|R\/E|C\/S)$/i.test(cleaned) && /^URINE$/i.test(previous)) {
      output[lastIndex] = `URINE ${cleaned.replace(/\s*,\s*/g, ", ")}`;
      continue;
    }

    if (
      !isInvestigationLikeItem(cleaned) &&
      !/pending reports?|approved follow-up|transfer \/ handover required/i.test(cleaned)
    ) {
      continue;
    }

    output.push(cleaned);
  }

  return dedupeStrings(output.filter((item) => !/^URINE$/i.test(item)));
};

const splitEscalationInstructions = (value?: string) => {
  const cleaned = cleanClinicalItem(value || "");
  if (!cleaned) return [];

  const reportBackMatch = cleaned.match(/report back(?:\s+if)?\s+(.+)/i);
  if (!reportBackMatch) {
    return /(pain|weight|appetite|distension|fever|loose stools|bleeding|tiredness|breathing difficulty|altered sensorium|undue symptoms)/i.test(
      cleaned
    )
      && !/(add nursing care plan|medication orders|drug \/ generic item|dosage qty|frequency instructions|aqua pulse|lyophilized|autofusion set)/i.test(
        cleaned
      )
      ? [toSentence(cleaned.replace(/^(?:for|or)\s+/i, ""))]
      : [];
  }

  const normalizedTail = reportBackMatch[1]
    .replace(/Add Nursing Care Plan[\s\S]*$/i, "")
    .replace(/MEDICATION ORDERS[\s\S]*$/i, "")
    .replace(/Reports supplied to patients[\s\S]*$/i, "")
    .replace(/\bSOS in case of any undue symptoms\b/i, "any undue symptoms")
    .replace(/\s+or\s+SOS\b/gi, ", ")
    .replace(/\s+or\s+/gi, ", ");

  return normalizedTail
    .split(/\s*,\s*/)
    .map((item) => cleanClinicalItem(item))
    .filter(Boolean)
    .map((item) => item.replace(/^(?:if|for|or)\s+/i, ""))
    .filter(
      (item) =>
        !/(add nursing care plan|medication orders|drug \/ generic item|dosage qty|frequency instructions|aqua pulse|lyophilized|autofusion set)/i.test(
          item
        )
    )
    .map((item) => item.replace(/\s*\.\s*$/, ""))
    .map((item) => toSentence(item.charAt(0).toUpperCase() + item.slice(1)));
};

const isUnknownAllergyMarker = (value: string) =>
  /(?:^|\b)(?:unknown|nkda|nkfa|nkf&da|not known|no known allergy|no known drug allergy|nil known allergy)(?:\b|$)/i.test(
    value.trim()
  );

const looksLikeRealDrg = (value?: string) =>
  Boolean(value && (/\bdrg\b/i.test(value) || /\b\d{3}\b/.test(value)) && !/complexity/i.test(value));

const isComorbidityLikeDiagnosis = (value: string) =>
  /\b(htn|hypertension|t2dm|dm|diabetes|copd|post cabg|cabg|cad|ihd|hfp?ef|ckd|cva|stroke|af|cad|hypothyroid|dyslipidemia)\b/i.test(
    value
  );

const isGenericPrincipalDiagnosis = (value?: string) =>
  /^(?:newborn|neonate|baby|infant|patient)$/i.test(String(value || "").trim());

const isRadiologyInvestigation = (value: string) =>
  /\b(?:xray|x-ray|ct|mri|usg|ultrasound|echo|echocardiogram|scan|doppler)\b/i.test(value);

const isCriticalImagingFinding = (value: string) =>
  /\b(?:bleed|hemorrhage|haemorrhage|stroke|infarct|mass effect|pneumothorax|fracture|embol|malign|lesion)\b/i.test(
    value
  );

const parseNumericReference = (value?: string) => {
  const matches = String(value || "").match(/\d+(\.\d+)?/g);
  return matches ? matches.map(Number) : [];
};

const matchesProvenanceValue = (value: string, items: ProvenanceItem[]) => {
  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) return false;

  return items.some((item) => {
    const normalizedItem = item.value.trim().toLowerCase();
    return (
      normalizedItem === normalizedValue ||
      normalizedItem.includes(normalizedValue) ||
      normalizedValue.includes(normalizedItem)
    );
  });
};

type ProvenanceItem = {
  value: string;
  sourceSection: string;
  sourceExcerpt: string;
  sourcePage: number | null;
  confidence: number;
  provenanceType: "quoted" | "normalized" | "derived";
};

type ProvenanceStatus = "source_backed" | "mixed" | "derived_only" | "insufficient_evidence";

const normalizeProvenanceItem = (item?: {
  value?: string;
  source_section?: string;
  source_excerpt?: string;
  source_page?: number | null;
  confidence?: number;
  provenance_type?: "quoted" | "normalized" | "derived";
} | null): ProvenanceItem | null => {
  if (!item) return null;
  const value = String(item.value || "").trim();
  const sourceExcerpt = String(item.source_excerpt || "").trim();
  if (!value) return null;

  return {
    value,
    sourceSection: String(item.source_section || "").trim(),
    sourceExcerpt,
    sourcePage: typeof item.source_page === "number" ? item.source_page : null,
    confidence: typeof item.confidence === "number" ? item.confidence : 0,
    provenanceType: item.provenance_type || "normalized",
  };
};

const isFallbackLikeValue = (value: string) =>
  /(generated|derived from|validate against|source document|not documented|unknown)$/i.test(value.trim());

const isSafeProvenanceItem = (item: ProvenanceItem, allowedTypes: Array<"quoted" | "normalized" | "derived">) =>
  Boolean(
    item.value &&
      item.sourceExcerpt &&
      allowedTypes.includes(item.provenanceType) &&
      !isFallbackLikeValue(item.value) &&
      !isFallbackLikeValue(item.sourceExcerpt)
  );

const buildSectionProvenance = (
  rawItems: Array<{
    value?: string;
    source_section?: string;
    source_excerpt?: string;
    source_page?: number | null;
    confidence?: number;
    provenance_type?: "quoted" | "normalized" | "derived";
  } | null | undefined>,
  allowedTypes: Array<"quoted" | "normalized" | "derived">
) => {
  const normalized = rawItems.map((item) => normalizeProvenanceItem(item)).filter(Boolean) as ProvenanceItem[];
  const safeItems = normalized.filter((item) => isSafeProvenanceItem(item, allowedTypes));

  let status: ProvenanceStatus = "insufficient_evidence";
  if (safeItems.length > 0 && safeItems.length === normalized.length) status = "source_backed";
  else if (safeItems.length > 0) status = "mixed";
  else if (normalized.some((item) => item.provenanceType === "derived")) status = "derived_only";

  return {
    status,
    items: safeItems,
    hasRaw: normalized.length > 0,
  };
};

const getSafeProvenanceItems = (
  rawItems: Array<{
    value?: string;
    source_section?: string;
    source_excerpt?: string;
    source_page?: number | null;
    confidence?: number;
    provenance_type?: "quoted" | "normalized" | "derived";
  } | null | undefined>,
  allowedTypes: Array<"quoted" | "normalized" | "derived">
) =>
  rawItems
    .map((item) => normalizeProvenanceItem(item))
    .filter(Boolean)
    .filter((item) => isSafeProvenanceItem(item as ProvenanceItem, allowedTypes)) as ProvenanceItem[];

const toSentence = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

const riskWatchAliases: Record<string, string[]> = {
  Fall: ["fall", "falls", "fall risk"],
  Aspiration: ["aspiration", "aspiration risk"],
  "Pressure Ulcer": ["pressure", "pressure ulcer", "pressure sore", "braden"],
  DVT: ["dvt", "deep vein thrombosis", "dvt risk"],
  EWS: ["ews", "early warning score"],
};

export const transformProcessedDocument = (document: ProcessedDocument): DashboardPatientData => {
  const result = document.result || {};
  const cards = result.dashboard_cards || {};
  const sample = result.sample_patient_data || {};
  const extracted = result.extracted_data || {};
  const extractedProvenance = extracted.provenance || {};
  const extractedDiagnosis = extracted.diagnosis || {};
  const extractedTreatment = extracted.treatment || {};
  const vitalsSectionProvenance = buildSectionProvenance(
    [
      extractedProvenance.vitals?.systolic,
      extractedProvenance.vitals?.diastolic,
      extractedProvenance.vitals?.pulse,
      extractedProvenance.vitals?.spo2,
      extractedProvenance.vitals?.temperature,
      extractedProvenance.vitals?.respiratory_rate,
    ],
    ["quoted", "normalized"]
  );
  const diagnosisSectionProvenance = buildSectionProvenance(
    [extractedProvenance.diagnosis?.principal, ...(extractedProvenance.diagnosis?.secondary || [])],
    ["quoted", "normalized"]
  );
  const medicationsSectionProvenance = buildSectionProvenance(extractedProvenance.medications || [], ["quoted", "normalized"]);
  const labsSectionProvenance = buildSectionProvenance(
    [
      ...(extractedProvenance.labs?.results || []),
      ...(extractedProvenance.labs?.investigations || []),
    ],
    ["quoted", "normalized"]
  );
  const radiologySectionProvenance = buildSectionProvenance(
    [
      ...(extractedProvenance.radiology?.findings || []),
      ...(extractedProvenance.radiology?.pending || []),
    ],
    ["quoted", "normalized"]
  );
  const treatmentSectionProvenance = buildSectionProvenance(
    [
      extractedProvenance.treatment?.current_approach,
      ...(extractedProvenance.treatment?.management_items || []),
      ...(extractedProvenance.treatment?.procedures || []),
      extractedProvenance.treatment?.response,
      ...(extractedProvenance.treatment?.complications || []),
    ],
    ["quoted", "normalized", "derived"]
  );
  const handoverSectionProvenance = buildSectionProvenance(
    [
      extractedProvenance.handover?.overview,
      ...(extractedProvenance.handover?.notes || []),
    ],
    ["quoted", "normalized", "derived"]
  );
  const followUpSectionProvenance = buildSectionProvenance(
    extractedProvenance.follow_up?.items || [],
    ["quoted", "normalized"]
  );
  const dischargeSectionProvenance = buildSectionProvenance(
    [
      ...(extractedProvenance.discharge?.dietary || []),
      ...(extractedProvenance.discharge?.instructions || []),
      ...(extractedProvenance.discharge?.red_flags || []),
    ],
    ["quoted", "normalized"]
  );
  const diagnosisSectionSupported =
    !diagnosisSectionProvenance.hasRaw || diagnosisSectionProvenance.items.length > 0;
  const medicationsSectionSupported =
    !medicationsSectionProvenance.hasRaw || medicationsSectionProvenance.items.length > 0;
  const vitalsSectionSupported =
    !vitalsSectionProvenance.hasRaw || vitalsSectionProvenance.items.length > 0;
  const labsSectionSupported =
    !labsSectionProvenance.hasRaw || labsSectionProvenance.items.length > 0;
  const radiologySectionSupported =
    !radiologySectionProvenance.hasRaw || radiologySectionProvenance.items.length > 0;
  const treatmentSectionSupported =
    !treatmentSectionProvenance.hasRaw || treatmentSectionProvenance.items.length > 0;
  const handoverSectionSupported =
    !handoverSectionProvenance.hasRaw || handoverSectionProvenance.items.length > 0;
  const followUpSectionSupported =
    !followUpSectionProvenance.hasRaw || followUpSectionProvenance.items.length > 0;
  const safeVitalsProvenanceItems = vitalsSectionProvenance.items;
  const safeLabResultProvenanceItems = getSafeProvenanceItems(extractedProvenance.labs?.results || [], ["quoted", "normalized"]);
  const safeLabInvestigationProvenanceItems = getSafeProvenanceItems(extractedProvenance.labs?.investigations || [], ["quoted", "normalized"]);
  const safeRadiologyFindingProvenanceItems = getSafeProvenanceItems(extractedProvenance.radiology?.findings || [], ["quoted", "normalized"]);
  const safeRadiologyPendingProvenanceItems = getSafeProvenanceItems(extractedProvenance.radiology?.pending || [], ["quoted", "normalized"]);
  const safeTreatmentManagementItems = getSafeProvenanceItems(extractedProvenance.treatment?.management_items || [], ["quoted", "normalized", "derived"]);
  const safeTreatmentProcedureItems = getSafeProvenanceItems(extractedProvenance.treatment?.procedures || [], ["quoted", "normalized", "derived"]);
  const safeTreatmentComplicationItems = getSafeProvenanceItems(extractedProvenance.treatment?.complications || [], ["quoted", "normalized", "derived"]);
  const safeHandoverNoteItems = getSafeProvenanceItems(extractedProvenance.handover?.notes || [], ["quoted", "normalized", "derived"]);
  const safeFollowUpItems = getSafeProvenanceItems(extractedProvenance.follow_up?.items || [], ["quoted", "normalized"]);

  const latestVitals = extracted.latest || {};
  const hasVitalEvidence = (pattern: RegExp) =>
    safeVitalsProvenanceItems.some((item) => pattern.test(item.value));
  const extractedBp =
    latestVitals.bp?.systolic && latestVitals.bp?.diastolic
      ? { systolic: latestVitals.bp.systolic, diastolic: latestVitals.bp.diastolic }
      : null;
  const bp = !vitalsSectionProvenance.hasRaw || hasVitalEvidence(/systolic bp|diastolic bp/i)
    ? (extractedBp || parseBp(cards.vitals_card?.summary?.latest_bp))
    : { systolic: 0, diastolic: 0 };
  const pulse = !vitalsSectionProvenance.hasRaw || hasVitalEvidence(/^pulse\b/i)
    ? (typeof latestVitals.pulse?.value === "number" && latestVitals.pulse.value > 0
        ? latestVitals.pulse.value
        : parseNumeric(cards.vitals_card?.summary?.pulse, 0))
    : 0;
  const temp = !vitalsSectionProvenance.hasRaw || hasVitalEvidence(/^temperature\b/i)
    ? (typeof latestVitals.temperature?.value === "number" && latestVitals.temperature.value > 0
        ? latestVitals.temperature.value
        : parseNumeric(cards.vitals_card?.summary?.temp, 0))
    : 0;
  const spo2 = !vitalsSectionProvenance.hasRaw || hasVitalEvidence(/^spo2\b/i)
    ? (typeof latestVitals.spo2?.value === "number" && latestVitals.spo2.value > 0
        ? latestVitals.spo2.value
        : parseNumeric(cards.vitals_card?.summary?.spo2, 0))
    : 0;
  const respRate = !vitalsSectionProvenance.hasRaw || hasVitalEvidence(/^respiratory rate\b/i)
    ? (typeof latestVitals.resp_rate === "number" && latestVitals.resp_rate > 0
        ? latestVitals.resp_rate
        : 0)
    : 0;
  const painScore = typeof latestVitals.pain_score?.value === "number" ? latestVitals.pain_score.value : 0;
  const secondaryDiagnoses = dedupeStrings(
    diagnosisSectionSupported ? (cards.diagnosis_card?.secondary_diagnoses || extractedDiagnosis.secondary || []) : []
  );
  const allergies = (cards.medications_card?.allergies || extracted.allergies || [])
    .map((allergen) => allergen?.trim())
    .filter((allergen): allergen is string => Boolean(allergen) && !isUnknownAllergyMarker(allergen));
  const medicationList = medicationsSectionSupported
    ? dedupeMedicationEntries(cards.medications_card?.medication_list || extracted.medications || [])
    : [];
  const extractedLabResults = extracted.lab_results?.map((result) => ({
    test: result.test_name || result.test || "Unknown",
    value: result.value || "",
    reference: result.reference || result.ref || "N/A",
    flag: result.flag || result.status || "",
  })) || [];
  const cardLabResults = cards.labs_card?.lab_results || [];
  const ungatedLabResults = cardLabResults.length > 0 ? cardLabResults : extractedLabResults;
  const labResults = labsSectionSupported
    ? (
        labsSectionProvenance.hasRaw
          ? ungatedLabResults.filter((result) =>
              matchesProvenanceValue(String(result.test || ""), safeLabResultProvenanceItems)
            )
          : ungatedLabResults
      )
    : [];
  const hasActualLabResults = (cards.labs_card?.has_results || false) && labResults.length > 0;
  const ungatedInvestigationList = cards.labs_card?.investigations_list || extracted.investigations || [];
  const investigationList = labsSectionSupported
    ? (
        labsSectionProvenance.hasRaw
          ? ungatedInvestigationList.filter((item) => matchesProvenanceValue(String(item || ""), safeLabInvestigationProvenanceItems))
          : ungatedInvestigationList
      )
    : [];
  const criticalLabRows = hasActualLabResults
    ? labResults.filter((result) => {
        const flag = (result.flag || "").toLowerCase();
        return ["critical", "c", "panic"].includes(flag);
      })
    : [];
  const abnormalLabRows = hasActualLabResults
    ? labResults.filter((result) => {
        const flag = (result.flag || "").toLowerCase();
        return ["high", "low", "abnormal", "h", "l", "a"].includes(flag);
      })
    : [];
  const instructionCount = cards.discharge_plan_card?.instruction_count || 0;
  const followUpCount = cards.follow_up_card?.appointment_count || 0;
  const noteFallbackYear = (() => {
    const parsed = Date.parse(cards.clinical_notes_card?.last_update || document.processedAt || document.uploadedAt || "");
    return Number.isNaN(parsed) ? undefined : new Date(parsed).getUTCFullYear();
  })();
  const explicitClinicalNotes = (cards.clinical_notes_card?.notes || extracted.clinical_notes || [])
    .map((note) => ({
      date: note.date || "",
      author: note.author || "",
      type: note.type || "Clinical Note",
      summary: note.summary || "",
      situation: note.situation || "",
      background: note.background || "",
      assessment: note.assessment || "",
      recommendations: note.recommendations || "",
      pending_items: Array.isArray(note.pending_items) ? note.pending_items.filter((item) => item && !isNoisyClinicalItem(item)) : [],
      risk_flags: Array.isArray(note.risk_flags) ? note.risk_flags.filter(Boolean) : [],
      handed_over_by: note.handed_over_by || "",
      handed_over_to: note.handed_over_to || "",
      source_excerpt: Array.isArray(note.source_excerpt) ? note.source_excerpt.filter((item) => item && !isNoisyClinicalItem(item)) : [],
    }))
    .filter((note) =>
      [
        note.summary,
        note.situation,
        note.background,
        note.assessment,
        note.recommendations,
        ...note.pending_items,
        ...note.risk_flags,
        note.handed_over_by,
        note.handed_over_to,
        ...note.source_excerpt,
      ].some((value) => String(value || "").trim().length > 0)
    )
    .map((note, index) => ({
      ...note,
      __sortIndex: index,
      __timestamp: parseClinicalNoteTimestamp(note.date, noteFallbackYear),
    }))
    .sort((a, b) => {
      if (a.__timestamp === b.__timestamp) return a.__sortIndex - b.__sortIndex;
      return b.__timestamp - a.__timestamp;
    })
    .map(({ __sortIndex, __timestamp, ...note }) => note);
  const totalNotes = Math.max(cards.clinical_notes_card?.total_notes || 0, explicitClinicalNotes.length);
  const handoverNotes = handoverSectionSupported && handoverSectionProvenance.hasRaw
    ? explicitClinicalNotes.filter((note) =>
        safeHandoverNoteItems.some((item) =>
          matchesProvenanceValue(
            `${note.type}: ${note.summary || note.assessment || note.recommendations || note.situation || note.background || note.source_excerpt[0] || ""}`,
            [item]
          )
        )
      )
    : explicitClinicalNotes;
  const handoverNote = explicitClinicalNotes.find((note) => /handover/i.test(note.type));
  const residentNote = explicitClinicalNotes.find((note) => /resident/i.test(note.type));
  const admissionNote = explicitClinicalNotes.find((note) => /initial assessment|admission/i.test(note.type));
  const rawRiskScores = extracted.risk_scores || {};
  const riskScores = {
    ...rawRiskScores,
    fall_risk: normalizeRiskEntry(rawRiskScores.fall_risk),
    dvt_risk: normalizeRiskEntry(rawRiskScores.dvt_risk),
    pressure_ulcer_risk: normalizeRiskEntry(rawRiskScores.pressure_ulcer_risk),
    aspiration_risk: normalizeRiskEntry(rawRiskScores.aspiration_risk),
  };
  const derivedComorbidities = dedupeStrings([
    ...(Array.isArray(extractedDiagnosis.comorbidities) ? extractedDiagnosis.comorbidities : []),
    ...secondaryDiagnoses.filter((item) => isComorbidityLikeDiagnosis(item)),
  ]);
  const likelyRealDrg = [
    extractedDiagnosis.drg,
    result.meta?.drg,
    cards.diagnosis_card?.icd_code && /^DRG[:\s]/i.test(cards.diagnosis_card.icd_code) ? cards.diagnosis_card.icd_code : "",
  ].find((value) => looksLikeRealDrg(value));
  const principalDiagnosisText = diagnosisSectionSupported
    ? (cards.diagnosis_card?.principal_diagnosis || extractedDiagnosis.principal || "Diagnosis not identified")
    : "Diagnosis not identified";
  const gatedPrincipalDiagnosisText = diagnosisSectionSupported ? principalDiagnosisText : "";
  const genericPrincipalDiagnosis = isGenericPrincipalDiagnosis(gatedPrincipalDiagnosisText);
  const consultantNote = explicitClinicalNotes.find((note) => /consultant/i.test(note.type));
  const nursingEndorsementNote = explicitClinicalNotes.find((note) => /endorsement/i.test(note.type));
  const diagnosisPresentation = dedupeStrings([
    consultantNote?.summary,
    residentNote?.summary,
    admissionNote?.summary,
    explicitClinicalNotes.find((note) => note.situation)?.situation,
    !genericPrincipalDiagnosis ? sample.summary?.split(".")[0] : "",
  ]).map(toSentence);
  const diagnosisConfirmation = dedupeStrings([
    genericPrincipalDiagnosis && gatedPrincipalDiagnosisText
      ? `Recorded impression in source document: ${gatedPrincipalDiagnosisText}`
      : "",
    consultantNote?.summary,
    nursingEndorsementNote?.assessment,
    sample.admission_date ? `Documented on admission date ${sample.admission_date}` : "",
    result.meta?.pdf_file ? `Source PDF: ${result.meta.pdf_file}` : "",
  ]).map(toSentence);
  const diagnosisConfirmedDate = sample.discharge_date || sample.admission_date || admissionNote?.date || consultantNote?.date || residentNote?.date || "";
  const likelyDiagnosisPhysician = dedupeStrings([
    consultantNote?.author,
    explicitClinicalNotes.find((note) => /doctor|consultant/i.test(note.type) && note.author)?.author,
  ])[0] || "";
  const rawReferenceRanges = cards.vitals_card?.reference_ranges || {
    bp_systolic_normal: "<120",
    bp_diastolic_normal: "<80",
    pulse_normal: "60-100",
    spo2_normal: "≥95%",
    temperature_normal: "97-99°F",
    resp_rate_normal: "12-20/min",
  };
  const systolicLimit = parseNumericReference(rawReferenceRanges.bp_systolic_normal)[0] || 120;
  const diastolicLimit = parseNumericReference(rawReferenceRanges.bp_diastolic_normal)[0] || 80;
  const pulseRange = parseNumericReference(rawReferenceRanges.pulse_normal);
  const spo2Limit = parseNumericReference(rawReferenceRanges.spo2_normal)[0] || 95;
  const tempRange = parseNumericReference(rawReferenceRanges.temperature_normal);
  const respRange = parseNumericReference(rawReferenceRanges.resp_rate_normal);
  const derivedVitalsAlerts = dedupeStrings([
    latestVitals.bp?.systolic && latestVitals.bp.systolic >= systolicLimit
      ? `Systolic BP ${latestVitals.bp.systolic} is above reference ${rawReferenceRanges.bp_systolic_normal}`
      : "",
    latestVitals.bp?.diastolic && latestVitals.bp.diastolic >= diastolicLimit
      ? `Diastolic BP ${latestVitals.bp.diastolic} is above reference ${rawReferenceRanges.bp_diastolic_normal}`
      : "",
    typeof latestVitals.pulse?.value === "number" && pulseRange.length >= 2 &&
      (latestVitals.pulse.value < pulseRange[0] || latestVitals.pulse.value > pulseRange[1])
      ? `Pulse ${latestVitals.pulse.value} is outside reference ${rawReferenceRanges.pulse_normal}`
      : "",
    typeof latestVitals.spo2?.value === "number" && latestVitals.spo2.value < spo2Limit
      ? `SpO2 ${latestVitals.spo2.value}% is below reference ${rawReferenceRanges.spo2_normal}`
      : "",
    typeof latestVitals.temperature?.value === "number" && tempRange.length >= 2 &&
      (latestVitals.temperature.value < tempRange[0] || latestVitals.temperature.value > tempRange[1])
      ? `Temperature ${latestVitals.temperature.value}${latestVitals.temperature.unit || ""} is outside reference ${rawReferenceRanges.temperature_normal}`
      : "",
    typeof latestVitals.resp_rate === "number" && respRange.length >= 2 &&
      (latestVitals.resp_rate < respRange[0] || latestVitals.resp_rate > respRange[1])
      ? `Respiratory rate ${latestVitals.resp_rate}/min is outside reference ${rawReferenceRanges.resp_rate_normal}`
      : "",
  ]).map((message) => ({
    date: document.processedAt || document.uploadedAt || "",
    type: "warning" as const,
    message,
  }));
  const imagingInvestigations = dedupeStrings(
    investigationList.filter((item) => isRadiologyInvestigation(item)).map(cleanClinicalItem)
  );
  const imagingEvidence = dedupeStrings(
    explicitClinicalNotes
      .flatMap((note) => [note.summary, note.assessment, ...note.source_excerpt])
      .map((item) => cleanClinicalItem(String(item || "")))
      .filter((item) => item && isRadiologyInvestigation(item))
  );
  const ungatedDocumentedImagingStudies = imagingEvidence.map((finding, index) => ({
    name: imagingInvestigations.find((study) => {
      const normalizedStudy = study.toLowerCase();
      const normalizedFinding = finding.toLowerCase();
      if (normalizedStudy.includes("ct") && normalizedFinding.includes("ct")) return true;
      if ((normalizedStudy.includes("xray") || normalizedStudy.includes("x-ray")) && (normalizedFinding.includes("xray") || normalizedFinding.includes("x-ray"))) return true;
      if (normalizedStudy.includes("usg") && normalizedFinding.includes("usg")) return true;
      if (normalizedStudy.includes("echo") && normalizedFinding.includes("echo")) return true;
      return false;
    }) || imagingInvestigations[index] || "Imaging finding",
    date: handoverNote?.date || consultantNote?.date || document.processedAt || document.uploadedAt,
    performedBy: consultantNote?.author || likelyDiagnosisPhysician || "Documented in source notes",
    findings: [finding],
    impression: finding,
    critical: isCriticalImagingFinding(finding),
  }));
  const documentedImagingStudies = radiologySectionSupported
    ? (
        radiologySectionProvenance.hasRaw
          ? ungatedDocumentedImagingStudies.filter(
              (study) =>
                matchesProvenanceValue(study.impression, safeRadiologyFindingProvenanceItems) ||
                matchesProvenanceValue(study.name, safeRadiologyFindingProvenanceItems)
            )
          : ungatedDocumentedImagingStudies
      )
    : [];
  const ungatedPendingImagingStudies = dedupeStrings(
    imagingInvestigations.filter(
      (study) =>
        !ungatedDocumentedImagingStudies.some((documented) => {
          const normalizedStudy = study.toLowerCase();
          const normalizedName = documented.name.toLowerCase();
          const normalizedFinding = documented.impression.toLowerCase();
          return normalizedName.includes(normalizedStudy) || normalizedStudy.includes(normalizedName) || normalizedFinding.includes(normalizedStudy.split(" ")[0]);
        })
    )
  );
  const pendingImagingStudies = radiologySectionSupported
    ? (
        radiologySectionProvenance.hasRaw
          ? ungatedPendingImagingStudies.filter((study) => matchesProvenanceValue(study, safeRadiologyPendingProvenanceItems))
          : ungatedPendingImagingStudies
      )
    : [];
  const formattedMedicationOrders = medicationList
    .slice(0, 5)
    .map((med) => [med.name, med.dose, med.frequency].filter(Boolean).join(" "))
    .filter(Boolean);
  const explicitManagementItems = dedupeStrings(
    Array.isArray(extractedTreatment.management_items) ? extractedTreatment.management_items : []
  );
  const explicitProcedures = dedupeStrings(
    Array.isArray(extractedTreatment.procedures) ? extractedTreatment.procedures : []
  );
  const safeTreatmentCurrentApproach =
    normalizeProvenanceItem(extractedProvenance.treatment?.current_approach) &&
    isSafeProvenanceItem(normalizeProvenanceItem(extractedProvenance.treatment?.current_approach) as ProvenanceItem, ["quoted", "normalized", "derived"])
      ? (normalizeProvenanceItem(extractedProvenance.treatment?.current_approach) as ProvenanceItem).value
      : "";
  const safeTreatmentResponse =
    normalizeProvenanceItem(extractedProvenance.treatment?.response) &&
    isSafeProvenanceItem(normalizeProvenanceItem(extractedProvenance.treatment?.response) as ProvenanceItem, ["quoted", "normalized", "derived"])
      ? (normalizeProvenanceItem(extractedProvenance.treatment?.response) as ProvenanceItem).value
      : "";
  const gatedManagementItems = treatmentSectionProvenance.hasRaw
    ? safeTreatmentManagementItems.map((item) => item.value)
    : explicitManagementItems;
  const gatedProcedures = treatmentSectionProvenance.hasRaw
    ? safeTreatmentProcedureItems.map((item) => item.value)
    : explicitProcedures;
  const riskItems = dedupeStrings([
    riskScores.fall_risk?.level ? `Fall risk ${riskScores.fall_risk.level}` : "",
    riskScores.aspiration_risk?.level ? `Aspiration risk ${riskScores.aspiration_risk.level}` : "",
    riskScores.pressure_ulcer_risk?.level ? `Pressure ulcer risk ${riskScores.pressure_ulcer_risk.level}` : "",
    riskScores.dvt_risk?.level ? `DVT risk ${riskScores.dvt_risk.level}` : "",
    allergies
      .filter((allergen) => !allergen.toLowerCase().includes("nkf") && !allergen.toLowerCase().includes("not known"))
      .map((allergen) => `Allergy documented: ${allergen}`)
      .join(" "),
  ]);
  const buildRiskWatchCitations = (label: string, score: number | null, level: string) => {
    const aliases = riskWatchAliases[label] || [label.toLowerCase()];
    const citations = explicitClinicalNotes.flatMap((note) => {
      const noteCandidates = [note.summary, note.assessment, note.recommendations, ...note.source_excerpt]
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      const matchingExcerpt = noteCandidates.find((candidate) => {
        const normalized = candidate.toLowerCase();
        const aliasMatch = aliases.some((alias) => normalized.includes(alias));
        const scoreMatch = typeof score === "number" ? normalized.includes(String(score)) : false;
        const levelMatch = level ? normalized.includes(level.toLowerCase()) : false;
        return aliasMatch && (scoreMatch || levelMatch || /risk/.test(normalized));
      });

      if (!matchingExcerpt) return [];
      return [{
        value: `${label}${level ? `: ${level}` : ""}`,
        sourceSection: note.type || "Clinical Note",
        sourceExcerpt: matchingExcerpt,
        sourcePage: null,
        confidence: 0.7,
        provenanceType: "normalized" as const,
      }];
    });

    return dedupeBy(citations, (item) => `${item.sourceSection}|${item.sourceExcerpt}`);
  };
  const riskWatchItems = [
    { label: "Fall", level: riskScores.fall_risk?.level || "", score: riskScores.fall_risk?.score ?? null },
    { label: "Aspiration", level: riskScores.aspiration_risk?.level || "", score: riskScores.aspiration_risk?.score ?? null },
    { label: "Pressure Ulcer", level: riskScores.pressure_ulcer_risk?.level || "", score: riskScores.pressure_ulcer_risk?.score ?? null },
    { label: "DVT", level: riskScores.dvt_risk?.level || "", score: riskScores.dvt_risk?.score ?? null },
  ]
    .filter((item) => item.level)
    .map((item) => ({
      ...item,
      summary: `${item.label}${item.level ? `: ${item.level}` : ""}`,
      citations: buildRiskWatchCitations(item.label, item.score, item.level),
    }));
  const riskWatchSectionProvenance = buildSectionProvenance(
    riskWatchItems.flatMap((item) => item.citations || []),
    ["quoted", "normalized"]
  );
  const elevatedRiskWatchItems = riskWatchItems.filter((item) => /high|moderate/i.test(String(item.level || "")));
  const documentedRiskWatchItems = riskWatchItems.filter((item) => Boolean(normalizeRiskLevel(item.level)));
  const highRiskWatchItems = riskWatchItems.filter((item) => /high/i.test(String(item.level || "")));
  const riskWatchStatus =
    typeof riskScores.ews_score === "number" && riskScores.ews_score >= 5
      ? "critical"
      : highRiskWatchItems.length > 0
        ? "critical"
        : elevatedRiskWatchItems.length > 0 || (typeof riskScores.ews_score === "number" && riskScores.ews_score > 0)
          ? "warning"
          : "normal";
  const riskWatchHeadlineMetric =
    highRiskWatchItems.length > 0
      ? `${highRiskWatchItems.length}`
      : typeof riskScores.ews_score === "number" && riskScores.ews_score > 0
        ? `${riskScores.ews_score}`
        : "0";
  const riskWatchSecondaryLine =
    highRiskWatchItems.length > 0
      ? highRiskWatchItems.length === 1
        ? "high-risk signal"
        : "high-risk signals"
      : elevatedRiskWatchItems.length > 0
        ? elevatedRiskWatchItems.length === 1
          ? "elevated watch item"
          : "elevated watch items"
        : documentedRiskWatchItems.length > 0
          ? documentedRiskWatchItems.length === 1
            ? "watch item documented"
            : "watch items documented"
        : typeof riskScores.ews_score === "number" && riskScores.ews_score > 0
          ? "ews score"
          : "not documented";
  const handoverSections = [
    {
      title: "Presentation",
      tone: "normal" as const,
      items: dedupeStrings([
        handoverNotes.find((note) => note.situation)?.situation,
        handoverNotes.find((note) => /initial assessment|admission/i.test(note.type))?.summary,
        sample.summary && !genericPrincipalDiagnosis ? sample.summary.split(".")[0] : "",
        gatedPrincipalDiagnosisText ? `Primary problem: ${gatedPrincipalDiagnosisText}` : "",
      ]).map(toSentence),
    },
    {
      title: "Assessment",
      tone: "normal" as const,
      items: dedupeStrings([
        handoverNotes.find((note) => note.assessment)?.assessment,
        handoverNotes.find((note) => note.background)?.background,
        gatedPrincipalDiagnosisText
          ? `Diagnosis: ${gatedPrincipalDiagnosisText}${secondaryDiagnoses.length ? ` with ${secondaryDiagnoses.join(", ")}` : ""}`
          : "",
        riskScores.gcs?.total ? `GCS ${riskScores.gcs.total}` : "",
        extracted.functional_status?.mobility_notes || "",
        latestVitals.bp?.systolic && latestVitals.bp?.diastolic
          ? `Latest BP ${latestVitals.bp.systolic}/${latestVitals.bp.diastolic}`
          : "",
        typeof latestVitals.grbs?.value === "number"
          ? `GRBS ${latestVitals.grbs.value}${latestVitals.grbs.interpretation ? ` (${latestVitals.grbs.interpretation})` : ""}`
          : "",
        handoverNotes.find((note) => /handover/i.test(note.type))?.summary,
      ]).map(toSentence),
    },
    {
      title: "Active Plan",
      tone: "normal" as const,
      items: dedupeStrings([
        handoverNotes.find((note) => note.recommendations)?.recommendations,
        handoverNotes.find((note) => /handover/i.test(note.type))?.summary,
        extracted.nursing_needs?.length ? `Current bedside plan: ${extracted.nursing_needs.slice(0, 4).join(", ")}` : "",
        formattedMedicationOrders.length ? `Active medication orders: ${formattedMedicationOrders.join("; ")}` : "",
      ]).map(toSentence),
    },
    {
      title: "Risks To Watch",
      tone: "warning" as const,
      items: dedupeStrings([
        ...riskItems,
        ...handoverNotes.flatMap((note) => note.risk_flags || []),
      ]).map(toSentence),
    },
    {
      title: "Pending / Follow-up",
      tone: "normal" as const,
      items: dedupeStrings([
        ...handoverNotes.flatMap((note) => note.pending_items || []),
        investigationList.length ? `Pending workup: ${investigationList.slice(0, 8).join(", ")}${investigationList.length > 8 ? ` +${investigationList.length - 8} more` : ""}` : "",
        followUpCount > 0 ? `Follow-up appointments documented: ${followUpCount}` : "",
        cards.follow_up_card?.next_appointment ? `Next appointment: ${cards.follow_up_card.next_appointment}` : "",
        handoverNotes.find((note) => note.handed_over_by || note.handed_over_to)
          ? `Handover: ${handoverNotes.find((note) => note.handed_over_by)?.handed_over_by || ""}${handoverNotes.find((note) => note.handed_over_by && note.handed_over_to) ? " to " : ""}${handoverNotes.find((note) => note.handed_over_to)?.handed_over_to || ""}`
          : "",
      ]).map(toSentence),
    },
    {
      title: "Source Notes",
      tone: "normal" as const,
      items: handoverNotes.map((note) =>
        toSentence(
          `${note.type}${note.author ? ` by ${note.author}` : ""}${note.date ? ` on ${note.date}` : ""}: ${
            note.summary ||
            note.assessment ||
            note.recommendations ||
            note.situation ||
            note.background ||
            note.source_excerpt[0] ||
            "Structured source note available"
          }`
        )
      ),
    },
  ].filter((section) => section.items.length > 0);
  const handoverOverview =
    handoverSectionProvenance.hasRaw
      ? (
          normalizeProvenanceItem(extractedProvenance.handover?.overview) &&
          isSafeProvenanceItem(normalizeProvenanceItem(extractedProvenance.handover?.overview) as ProvenanceItem, ["quoted", "normalized", "derived"])
            ? (normalizeProvenanceItem(extractedProvenance.handover?.overview) as ProvenanceItem).value
            : ""
        ) ||
        dedupeStrings([
          !genericPrincipalDiagnosis ? sample.summary : "",
          handoverSections.find((section) => section.title === "Assessment")?.items[0],
          handoverSections.find((section) => section.title === "Active Plan")?.items[0],
        ])[0] ||
        "No clinical handover summary available."
      : dedupeStrings([
          !genericPrincipalDiagnosis ? sample.summary : "",
          handoverSections.find((section) => section.title === "Assessment")?.items[0],
          handoverSections.find((section) => section.title === "Active Plan")?.items[0],
        ])[0] || "No clinical handover summary available.";
  const activeManagement = [
    (treatmentSectionSupported && (safeTreatmentCurrentApproach || (!treatmentSectionProvenance.hasRaw ? extractedTreatment.current_approach : "")))
      ? {
          title: "Current Management Approach",
          details: safeTreatmentCurrentApproach || extractedTreatment.current_approach,
          source: treatmentSectionProvenance.hasRaw ? "Treatment provenance" : "Treatment extraction",
        }
      : !treatmentSectionProvenance.hasRaw && handoverNote?.summary
      ? {
          title: "Current Management Approach",
          details: handoverNote.summary,
          source: handoverNote.type,
        }
      : null,
    gatedManagementItems.length
      ? {
          title: "Active Management Items",
          details: gatedManagementItems.slice(0, 8).join(", "),
          source: treatmentSectionProvenance.hasRaw ? "Treatment provenance" : "Treatment extraction",
        }
      : null,
    !treatmentSectionProvenance.hasRaw && extracted.nursing_needs?.length
      ? {
          title: "Bedside Interventions",
          details: extracted.nursing_needs.slice(0, 6).join(", "),
          source: "Nursing needs",
        }
      : null,
    !treatmentSectionProvenance.hasRaw && formattedMedicationOrders.length
      ? {
          title: "Active Therapeutic Orders",
          details: formattedMedicationOrders.join("; "),
          source: "Medication orders",
        }
      : null,
    !treatmentSectionProvenance.hasRaw && investigationList.length
      ? {
          title: "Ongoing Workup",
          details: `Pending investigations include ${investigationList.slice(0, 8).join(", ")}${investigationList.length > 8 ? ` and ${investigationList.length - 8} more` : ""}`,
          source: "Residents Notes",
        }
      : null,
    !treatmentSectionProvenance.hasRaw && admissionNote?.summary
      ? {
          title: "Clinical Context",
          details: admissionNote.summary,
          source: admissionNote.type,
        }
      : null,
  ].filter(Boolean) as Array<{ title: string; details: string; source: string }>;
  const currentApproach = safeTreatmentCurrentApproach
    ? safeTreatmentCurrentApproach
    : !treatmentSectionProvenance.hasRaw && extractedTreatment.current_approach
    ? extractedTreatment.current_approach
    : !treatmentSectionProvenance.hasRaw && /conservative management/i.test(handoverNote?.summary || "")
    ? "Conservative management"
      : !treatmentSectionProvenance.hasRaw && cards.treatment_card?.current_approach
        ? cards.treatment_card.current_approach
        : "Not documented";
  const responseEvidence = dedupeStrings([
    safeTreatmentResponse,
    !treatmentSectionProvenance.hasRaw ? extractedTreatment.response : "",
    explicitClinicalNotes
      .map((note) => note.summary)
      .filter((summary) => !treatmentSectionProvenance.hasRaw && /(improving|responding|stable for discharge|stable post|tolerated|no complications)/i.test(summary))
      .join(" "),
  ])[0];
  const responseDocumented = Boolean(responseEvidence);
  const response = responseDocumented
    ? toSentence(responseEvidence)
    : "Not documented";
  const complicationEvidence = dedupeStrings([
    ...(treatmentSectionProvenance.hasRaw ? safeTreatmentComplicationItems.map((item) => item.value) : (Array.isArray(extractedTreatment.complications) ? extractedTreatment.complications : [])),
    explicitClinicalNotes
      .map((note) => note.summary)
      .filter((summary) => !treatmentSectionProvenance.hasRaw && /(complication|bleeding|infection|worsening|deterioration)/i.test(summary))
      .join(" "),
  ])[0];
  const complicationsDocumented = Boolean(complicationEvidence);
  const complicationsLabel = complicationsDocumented
    ? toSentence(complicationEvidence)
    : "Not documented";
  const dischargeEvidenceText = explicitClinicalNotes
    .flatMap((note) => [
      note.summary,
      note.assessment,
      note.recommendations,
      ...note.source_excerpt,
    ])
    .join(" ");
  const dischargePlanExplicitlyAbsent = /discharge plan\s*:\s*no\b/i.test(dischargeEvidenceText);
  const rawDischargeItems = explicitClinicalNotes.flatMap((note) => [
    note.summary,
    ...note.pending_items,
    ...splitDelimitedItems(note.recommendations),
    ...note.source_excerpt,
  ]);
  const dischargePlanningNotes = explicitClinicalNotes.filter((note) =>
    /discharge|education|plan and comments/i.test(note.type)
  );
  const dischargeRecommendationItems = dedupeStrings(
    dischargePlanningNotes.flatMap((note) => splitInstructionList(note.recommendations))
  );
  const dischargeConditionChecks = dedupeStrings([
    explicitClinicalNotes.find((note) => /handover/i.test(note.type))?.summary,
    explicitClinicalNotes.find((note) => /endorsement/i.test(note.type))?.summary,
    explicitClinicalNotes.find((note) => /initial assessment|admission/i.test(note.type))?.assessment,
    explicitClinicalNotes.find((note) => /handover/i.test(note.type))?.assessment,
  ])
    .filter((item) => /(stable|improv|oriented|admitted|chemotherapy|multiple myeloma|discharge|follow-up)/i.test(item || ""))
    .map(toSentence);
  const dischargeDietary = dedupeStrings(
    dischargeSectionProvenance.hasRaw
      ? (extractedProvenance.discharge?.dietary || [])
          .map((item) => normalizeProvenanceItem(item))
          .filter(Boolean)
          .filter((item) => isSafeProvenanceItem(item as ProvenanceItem, ["quoted", "normalized"]))
          .map((item) => formatDietInstruction((item as ProvenanceItem).value))
      : rawDischargeItems
          .filter((item) => isDietInstruction(item))
          .map(formatDietInstruction)
  );
  const dischargePrecautions = dedupeStrings([
    ...explicitClinicalNotes.flatMap((note) => note.risk_flags || []).map(cleanClinicalItem),
    ...explicitClinicalNotes
      .map((note) => note.summary)
      .filter((summary) => /pressure ulcer/i.test(summary))
      .map(() => "Pressure ulcer risk"),
  ]).map(toSentence);
  const dischargeCareInstructions = dedupeStrings([
    ...(dischargeSectionProvenance.hasRaw
      ? (extractedProvenance.discharge?.instructions || [])
          .map((item) => normalizeProvenanceItem(item))
          .filter(Boolean)
          .filter((item) => isSafeProvenanceItem(item as ProvenanceItem, ["quoted", "normalized"]))
          .map((item) => (item as ProvenanceItem).value)
      : dischargeRecommendationItems.filter(
      (item) =>
        !isDietInstruction(item) &&
        !isNonInstructionCareItem(item) &&
        !isInvestigationLikeItem(item) &&
        !isMedicationLikeItem(item) &&
        !isGenericPlanBucket(item) &&
        isPatientInstruction(item)
      )),
  ]).map(toSentence);
  const dischargeRedFlags = dedupeStrings([
    ...(dischargeSectionProvenance.hasRaw
      ? (extractedProvenance.discharge?.red_flags || [])
          .map((item) => normalizeProvenanceItem(item))
          .filter(Boolean)
          .filter((item) => isSafeProvenanceItem(item as ProvenanceItem, ["quoted", "normalized"]))
          .map((item) => (item as ProvenanceItem).value)
      : dischargePlanningNotes.flatMap((note) =>
          [note.summary, note.assessment].flatMap(splitEscalationInstructions)
        )),
  ]);
  const dischargePendingItems = normalizePendingReviewItems([
    ...explicitClinicalNotes.flatMap((note) => note.pending_items || []),
    cards.follow_up_card?.next_appointment ? `Next appointment: ${cards.follow_up_card.next_appointment}` : "",
  ]).map(toSentence);

  // NEW: Add LLM-extracted pending_items
  const llmPendingItems = extracted.pending_items || {};
  const llmLabsPending = llmPendingItems.pending_labs?.map(lab => lab.test_name || lab.reason || "Pending lab") || [];
  const llmRadiologyPending = llmPendingItems.pending_radiology?.map(rad => `${rad.type}${rad.body_part ? ` of ${rad.body_part}` : ''}${rad.scheduled_date ? ` - ${rad.scheduled_date}` : ''}`) || [];
  const llmFollowUpsPending = llmPendingItems.pending_followups?.map(fu => `${fu.department}${fu.provider ? ` with ${fu.provider}` : ''}${fu.date ? ` on ${fu.date}` : ''}${fu.time ? ` at ${fu.time}` : ''}`) || [];
  const dischargeDispositionNote = dischargePlanExplicitlyAbsent
    ? "No explicit discharge disposition was documented in this record. The items below reflect current inpatient care instructions and pending workup."
    : dischargePendingItems.length > 0
      ? "Follow-up and pending items are listed exactly as documented in the source record."
      : "";

  // Merge LLM-extracted pending items with existing pending items
  const allPendingItems = [
    ...dischargePendingItems,
    ...llmLabsPending,
    ...llmRadiologyPending,
    ...llmFollowUpsPending,
    ...(llmPendingItems.pending_discharge_items?.map(item => item.item || item.reason) || []),
  ];
  const dischargeCondition = dischargePlanExplicitlyAbsent
    ? "Not documented"
    : dedupeStrings(
        explicitClinicalNotes
          .flatMap((note) => [note.summary, note.assessment])
          .filter((item) => /(stable|improv|fit for discharge|ready for discharge|oriented)/i.test(item || ""))
      )[0] || "Not documented";
  const followUpAppointments =
    followUpSectionSupported && followUpSectionProvenance.hasRaw
      ? safeFollowUpItems.map((item) => ({
          department: result.meta?.department_type || document.department || "",
          physician: "",
          date: "",
          time: "",
          purpose: toSentence(item.value),
        }))
      : cards.follow_up_card?.next_appointment
        ? [{
            department: result.meta?.department_type || document.department || "",
            physician: "",
            date: cards.follow_up_card.next_appointment,
            time: "",
            purpose: "",
          }]
        : [];
  const presentationSummaryCardsRaw = result.presentation?.summary_cards || {};
  const presentationNotesRailRaw = result.presentation?.notes_rail || [];
  const fallbackPresentationSummaryCards: Record<string, PresentationCard> = {
    vitals: {
      section: "vitals",
      title: "Vitals",
      headlineMetric: `${bp.systolic}/${bp.diastolic} mmHg`,
      secondaryLine: pulse ? `Pulse ${pulse} bpm` : "",
      supportingPoints: dedupeStrings([
        spo2 ? `SpO2 ${spo2}%` : "",
        temp || respRate ? `Temp ${temp || "-"}°F · RR ${respRate || "-"} /min` : "",
      ]).slice(0, 2),
      status: mapCardStatus(cards.vitals_card?.status || "normal"),
      provenanceStatus: vitalsSectionProvenance.status,
    },
    diagnosis: {
      section: "diagnosis",
      title: "Diagnosis",
      headlineMetric: gatedPrincipalDiagnosisText,
      secondaryLine: cards.diagnosis_card?.icd_code ? `ICD-10 ${cards.diagnosis_card.icd_code}` : "",
      supportingPoints: secondaryDiagnoses.length ? [`+${secondaryDiagnoses.length} secondary`] : [],
      status: "neutral",
      provenanceStatus: diagnosisSectionProvenance.status,
    },
    medications: {
      section: "medications",
      title: "Medications",
      headlineMetric: `${medicationList.length}`,
      secondaryLine: medicationList.length === 1 ? "active medication" : "active medications",
      supportingPoints: medicationList.slice(0, 2).map((med) => med.name || "").filter(Boolean),
      status: allergies.length > 0 ? "warning" : "normal",
      provenanceStatus: medicationsSectionProvenance.status,
    },
    labs: {
      section: "labs",
      title: "Lab Results",
      headlineMetric: `${hasActualLabResults ? labResults.length : investigationList.length}`,
      secondaryLine: hasActualLabResults ? "tests completed" : "tests ordered",
      supportingPoints: dedupeStrings([
        abnormalLabRows.length ? `${abnormalLabRows.length} abnormal` : "",
        criticalLabRows.length ? `${criticalLabRows.length} critical` : "",
      ]).slice(0, 2),
      status: criticalLabRows.length ? "critical" : abnormalLabRows.length ? "warning" : "normal",
      provenanceStatus: labsSectionProvenance.status,
    },
    radiology: {
      section: "radiology",
      title: "Radiology",
      headlineMetric: `${documentedImagingStudies.length}`,
      secondaryLine: documentedImagingStudies.length === 1 ? "finding" : "findings",
      supportingPoints: [
        pendingImagingStudies.length ? `${pendingImagingStudies.length} pending/documented` : "No pending imaging documented",
      ],
      status: documentedImagingStudies.some((study) => study.critical) ? "critical" : "normal",
      provenanceStatus: radiologySectionProvenance.status,
    },
    treatment: {
      section: "treatment",
      title: "Treatment",
      headlineMetric: `${activeManagement.length}`,
      secondaryLine: "plan items",
      supportingPoints: dedupeStrings([currentApproach, complicationsLabel]).slice(0, 2),
      status: complicationsDocumented ? "warning" : "normal",
      provenanceStatus: treatmentSectionProvenance.status,
    },
    care_gaps: {
      section: "pending",
      title: "Care Gaps",
      headlineMetric: `${pendingImagingStudies.length + (extracted.pending_items?.pending_labs?.length || 0) + allPendingItems.length}`,
      secondaryLine:
        pendingImagingStudies.length + (extracted.pending_items?.pending_labs?.length || 0) + allPendingItems.length === 1
          ? "open care gap"
          : "open care gaps",
      supportingPoints: dedupeStrings([
        [extracted.pending_items?.pending_labs?.length ? `${extracted.pending_items.pending_labs.length} labs` : "", pendingImagingStudies.length ? `${pendingImagingStudies.length} imaging` : ""]
          .filter(Boolean)
          .join(" · "),
        allPendingItems.length ? `${allPendingItems.length} discharge actions` : followUpAppointments.length ? `${followUpAppointments.length} follow-up appointments booked` : "Follow-up not scheduled",
      ]).slice(0, 2),
      status:
        followUpAppointments.length === 0 && (pendingImagingStudies.length + (extracted.pending_items?.pending_labs?.length || 0) + allPendingItems.length) > 0
          ? "critical"
          : pendingImagingStudies.length + (extracted.pending_items?.pending_labs?.length || 0) + allPendingItems.length > 0
            ? "warning"
            : "normal",
      provenanceStatus:
        [labsSectionProvenance.status, radiologySectionProvenance.status, dischargeSectionProvenance.status, followUpSectionProvenance.status].includes("source_backed")
          ? "source_backed"
          : [labsSectionProvenance.status, radiologySectionProvenance.status, dischargeSectionProvenance.status, followUpSectionProvenance.status].includes("mixed")
            ? "mixed"
            : [labsSectionProvenance.status, radiologySectionProvenance.status, dischargeSectionProvenance.status, followUpSectionProvenance.status].includes("derived_only")
              ? "derived_only"
              : "insufficient_evidence",
    },
    risk_watch: {
      section: "riskwatch",
      title: "Risk Watch",
      headlineMetric: riskWatchHeadlineMetric,
      secondaryLine: riskWatchSecondaryLine,
      supportingPoints: dedupeStrings([
        elevatedRiskWatchItems.length > 0
          ? elevatedRiskWatchItems.slice(0, 2).map((item) => item.summary).join(" · ")
          : documentedRiskWatchItems
              .slice(0, 2)
              .map((item) => item.summary)
              .join(" · "),
        documentedRiskWatchItems.length === 0 && typeof riskScores.ews_score !== "number" ? "No explicit risk levels documented" : "",
      ]).slice(0, 2),
      status: riskWatchStatus,
      provenanceStatus: riskWatchSectionProvenance.status,
    },
  };
  const normalizedPresentationSummaryCards = Object.fromEntries(
    Object.entries(presentationSummaryCardsRaw).map(([key, card]) => [
      key,
      {
        section: card?.section || key,
        title: card?.title || fallbackPresentationSummaryCards[key]?.title || key,
        headlineMetric: card?.headline_metric || fallbackPresentationSummaryCards[key]?.headlineMetric || "",
        secondaryLine: card?.secondary_line || fallbackPresentationSummaryCards[key]?.secondaryLine || "",
        supportingPoints: Array.isArray(card?.supporting_points)
          ? card.supporting_points.filter(Boolean).slice(0, 2)
          : fallbackPresentationSummaryCards[key]?.supportingPoints || [],
        status: mapCardStatus(card?.status || fallbackPresentationSummaryCards[key]?.status),
        provenanceStatus: mapPresentationStatus(card?.provenance_status) || fallbackPresentationSummaryCards[key]?.provenanceStatus || "insufficient_evidence",
      } satisfies PresentationCard,
    ])
  ) as Record<string, PresentationCard>;
  const presentationSummaryCards =
    Object.keys(normalizedPresentationSummaryCards).length > 0
      ? { ...fallbackPresentationSummaryCards, ...normalizedPresentationSummaryCards, risk_watch: fallbackPresentationSummaryCards.risk_watch }
      : fallbackPresentationSummaryCards;
  const fallbackNotesRail: PresentationRailItem[] = handoverNotes
    .slice(0, 6)
    .map((note) => ({
      title: note.type || "Clinical Note",
      author: note.author || note.handed_over_by || note.handed_over_to || "Clinical Team",
      timestamp: note.date || "",
      body: note.summary || note.assessment || note.recommendations || note.situation || note.background || "",
      priority: note.risk_flags?.length ? "warning" : "normal",
      category: /handover/i.test(note.type) ? "handover" : /nurse|endorsement/i.test(note.type) ? "nurse" : "doctor",
      provenance: (note.source_excerpt || [])
        .map((item) => ({
          value: item,
          sourceSection: note.type || "Clinical Note",
          sourceExcerpt: item,
          sourcePage: null,
          confidence: 0.7,
          provenanceType: "normalized" as const,
        }))
        .filter((item) => item.value && item.sourceExcerpt),
    }))
    .filter((item) => !isLowValuePresentationNote(item))
    .slice(0, 4);
  const presentationNotesRail =
    presentationNotesRailRaw.length > 0
      ? presentationNotesRailRaw
          .map((item) => ({
            title: String(item.title || "Clinical Note"),
            author: (() => {
              const author = String(item.author || "").trim();
              return !author || /^unknown author$/i.test(author) ? "Clinical Team" : author;
            })(),
            timestamp: String(item.timestamp || ""),
            body: String(item.body || ""),
            priority: item.priority || "normal",
            category: item.category || "doctor",
            provenance: (item.provenance || [])
              .map((entry) => normalizeProvenanceItem(entry))
              .filter(Boolean) as ProvenanceItem[],
          }))
          .filter((item) => !isLowValuePresentationNote(item))
      : fallbackNotesRail;

  return {
    meta: {
      reportId: document.id,
      generatedAt: document.processedAt || document.uploadedAt,
      version: "gemma-processed",
    },
    patient: {
      id: document.id,
      name: sample.name || "",
      age: sample.age || 0,
      gender: extracted.patient?.gender || "",
      dateOfBirth: "",
      mrn: sample.mrn || "",
      bloodGroup: "",
      contact: {
        phone: "",
        email: "",
        emergencyContact: "",
      },
    },
    admission: {
      id: document.id,
      admissionDate: sample.admission_date || document.uploadedAt,
      // If discharge_date is not present in the PDF, use null instead of processedAt
      // This allows the UI to show "Not discharged" instead of the processing timestamp
      dischargeDate: sample.discharge_date || null,
      lengthOfStay: sample.los_days || 0,
      department: result.meta?.department_type || document.department || "General",
      ward: "",
      bed: "",
      attendingPhysician: {
        id: "",
        name: likelyDiagnosisPhysician || "",
        specialization: "",
      },
      admissionType: "",
      admissionDiagnosis: gatedPrincipalDiagnosisText,
    },
    vitals: {
      latest: {
        bloodPressure: { systolic: bp.systolic, diastolic: bp.diastolic, unit: "mmHg" },
        heartRate: { value: pulse, unit: "bpm" },
        temperature: { value: temp, unit: "°F" },
        respiratoryRate: { value: respRate, unit: "/min" },
        spo2: { value: spo2, unit: "%" },
        painScore: { value: painScore, scale: 10 },
      },
      status: cards.vitals_card?.status || "stable",
      trend: cards.vitals_card?.trend || "stable",
      // Use actual readings from extraction if available, otherwise create placeholder
      history: Array.isArray(cards.vitals_card?.readings) && cards.vitals_card.readings.length > 0
        ? cards.vitals_card.readings.map(r => ({
            date: r.date || "Unknown",
            bp: r.bp_systolic && r.bp_diastolic ? `${r.bp_systolic}/${r.bp_diastolic}` : `${bp.systolic}/${bp.diastolic}`,
            hr: r.pulse || pulse,
            temp: r.temperature || temp,
            spo2: r.spo2 || spo2,
            rr: r.resp_rate || respRate
          }))
        : [
            { date: "Single Reading", bp: `${bp.systolic}/${bp.diastolic}`, hr: pulse, temp, spo2, rr: respRate }
          ],
      alerts: derivedVitalsAlerts,
      referenceRanges: rawReferenceRanges
    },
    diagnosis: {
      principal: {
        code: cards.diagnosis_card?.icd_code || extractedDiagnosis.icd_code || "",
        description: gatedPrincipalDiagnosisText,
        confirmedDate: diagnosisConfirmedDate,
        presentation: diagnosisPresentation,
        confirmation: diagnosisConfirmation,
        treatingPhysician: likelyDiagnosisPhysician,
      },
      secondary: secondaryDiagnoses.map((description, index) => ({
        code: "",
        description,
        status: isComorbidityLikeDiagnosis(description) ? "Chronic / relevant history" : "",
        history: "",
      })),
      comorbidities: derivedComorbidities,
      drg: likelyRealDrg || "",
    },
    medications: {
      active: medicationList
        .filter((med) =>
          !medicationsSectionProvenance.hasRaw ||
          medicationsSectionProvenance.items.some((item) => item.value.toLowerCase() === String(med.name || "").toLowerCase())
        )
        .map(med => ({
        name: med.name,
        dose: med.dose || "As per order",
        frequency: med.frequency || "As per order",
        route:
          med.name?.toUpperCase().includes("IV") ||
          med.name?.toUpperCase().includes("INJ") ||
          med.name?.toUpperCase().includes("INJECTION")
            ? "IV/Injection"
            : "Oral",
        start: "",
        instructions: "",
      })),
      allergies: allergies.map((allergen) => ({
        allergen,
        severity: "",
        reaction: "",
        lastReaction: "",
        action: "",
        alternative: "",
      })),
      changes: {
        added: [],
        adjusted: [],
        discontinued: [],
      },
      interactionCheck: "",
    },
    labs: {
      totalTests: hasActualLabResults ? labResults.length : investigationList.length,
      abnormalCount: abnormalLabRows.length,
      criticalCount: criticalLabRows.length,
      pendingCount: hasActualLabResults ? 0 : investigationList.length,
      // Use actual lab results from the document
      lab_results: labResults,
      // Use actual investigations from the document
      investigations: investigationList,
      hasResults: hasActualLabResults,
      note: cards.labs_card?.note || "",
      critical: criticalLabRows.map((result) => ({
        test: result.test || "Critical lab",
        result: result.value || "See uploaded report",
        reference: result.reference || "",
        status: "CRITICAL",
        date: "",
      })),
      abnormal: abnormalLabRows.map((result) => ({
        test: result.test || "Abnormal lab",
        result: result.value || "See uploaded report",
        reference: result.reference || "",
        date: "",
      })),
      cbc: [],
      metabolic: [],
      troponinTrend: [],
      pending: extracted.pending_items?.pending_labs?.map(lab => lab.test_name || lab.reason || "Pending lab") || [],
    },
    radiology: {
      completedStudies: documentedImagingStudies.length,
      pendingStudies: pendingImagingStudies.length,
      criticalFindings: documentedImagingStudies.filter((study) => study.critical).length,
      studies: documentedImagingStudies,
      pending: [
        ...pendingImagingStudies,
        ...(extracted.pending_items?.pending_radiology?.map(rad => `${rad.type}${rad.body_part ? ` of ${rad.body_part}` : ''}${rad.scheduled_date ? ` - ${rad.scheduled_date}` : ''}`) || [])
      ],
    },
    treatment: {
      procedures: gatedProcedures.map((name) => ({
        name,
        date: handoverNote?.date || consultantNote?.date || "",
        physician: likelyDiagnosisPhysician || "",
        details: "",
      })),
      activeManagement,
      currentApproach,
      response,
      responseDocumented,
      complications: 0,
      complicationsDocumented,
      complicationsLabel,
    },
    riskWatch: {
      ewsScore: typeof riskScores.ews_score === "number" ? riskScores.ews_score : null,
      items: riskWatchItems,
    },
    clinicalNotes: {
      totalNotes,
      lastUpdate: cards.clinical_notes_card?.last_update || document.processedAt || document.uploadedAt,
      notes: handoverNotes,
      handover: {
        overview: handoverOverview,
        sections: handoverSections,
      },
    },
    dischargePlan: {
      condition: dischargeCondition,
      conditionChecks: dischargeConditionChecks,
      dietary: dischargeDietary,
      activityRestrictions: {
        doNot: dischargePrecautions,
        okToDo: dischargeCareInstructions,
        duration: "Documented plan",
        afterRestriction: dischargeDispositionNote,
      },
      pendingItems: allPendingItems,
      redFlags: dischargeRedFlags,
    },
    // NEW: Add pending_items_summary for easy access
    pending_items_summary: {
      pending_labs: llmLabsPending,
      pending_radiology: llmRadiologyPending,
      pending_followups: llmFollowUpsPending,
      medication_reconciliation: llmPendingItems.medication_reconciliation,
      summary: llmPendingItems.summary || { total_pending: 0, needs_attention: 0, scheduled: 0, complete: 0 },
    },
    followUp: followUpAppointments,
    presentation: {
      summaryCards: presentationSummaryCards,
      notesRail: presentationNotesRail,
    },
    provenance: {
      sections: {
        vitals: vitalsSectionProvenance,
        diagnosis: diagnosisSectionProvenance,
        medications: medicationsSectionProvenance,
        labs: labsSectionProvenance,
        radiology: radiologySectionProvenance,
        treatment: treatmentSectionProvenance,
        riskwatch: riskWatchSectionProvenance,
        handover: handoverSectionProvenance,
        followup: followUpSectionProvenance,
        discharge: dischargeSectionProvenance,
      },
    },
  };
};

// Note: Fallback data removed to prevent bundling mock data in production
// The UI handles null/missing data appropriately
