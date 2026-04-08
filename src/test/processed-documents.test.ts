import { describe, expect, it } from "vitest";

import {
  extractProcessedDocumentResponse,
  transformProcessedDocument,
  type ProcessedDocument,
} from "@/lib/processedDocuments";

const createProcessedDocument = (overrides?: Partial<ProcessedDocument>): ProcessedDocument => ({
  id: "doc-1",
  name: "report.pdf",
  size: 1,
  uploadedAt: "2026-04-05T00:00:00Z",
  processedAt: "2026-04-05T00:10:00Z",
  status: "processed",
  department: "General",
  result: {
    meta: {
      pdf_file: "report.pdf",
      department_type: "General",
    },
    dashboard_cards: {},
    sample_patient_data: {
      name: "Test Patient",
      age: 50,
      mrn: "MRN-1",
      admission_date: "2026-04-01",
      discharge_date: "2026-04-05",
    },
    extracted_data: {},
  },
  ...overrides,
});

describe("transformProcessedDocument", () => {
  it("accepts both wrapped and flat processed document payloads", () => {
    const document = createProcessedDocument();

    expect(extractProcessedDocumentResponse(document)).toEqual(document);
    expect(extractProcessedDocumentResponse({ document })).toEqual(document);
    expect(extractProcessedDocumentResponse({})).toBeNull();
  });

  it("suppresses unsupported diagnosis, medications, and discharge sections when provenance is unsafe", () => {
    const transformed = transformProcessedDocument(
      createProcessedDocument({
        result: {
          meta: {
            pdf_file: "report.pdf",
            department_type: "General",
          },
          sample_patient_data: {
            name: "Test Patient",
            age: 50,
            mrn: "MRN-1",
            admission_date: "2026-04-01",
            discharge_date: "2026-04-05",
          },
          dashboard_cards: {
            diagnosis_card: {
              principal_diagnosis: "Hallucinated diagnosis",
              secondary_diagnoses: ["Hallucinated comorbidity"],
            },
            medications_card: {
              medication_list: [{ name: "INJ Imaginary", dose: "1 amp", frequency: "BD" }],
            },
          },
          extracted_data: {
            patient: {
              gender: "Male",
            },
            diagnosis: {
              principal: "Hallucinated diagnosis",
              secondary: ["Hallucinated comorbidity"],
            },
            medications: [{ name: "INJ Imaginary", dose: "1 amp", frequency: "BD" }],
            clinical_notes: [
              {
                type: "Discharge Planning",
                summary: "Report back if fever",
                recommendations: "Diet: Soft diet, Continue physiotherapy",
              },
            ],
            provenance: {
              diagnosis: {
                principal: {
                  value: "Hallucinated diagnosis",
                  source_section: "Diagnosis",
                  source_excerpt: "",
                  provenance_type: "normalized",
                },
                secondary: [
                  {
                    value: "Hallucinated comorbidity",
                    source_section: "Diagnosis",
                    source_excerpt: "",
                    provenance_type: "normalized",
                  },
                ],
              },
              medications: [
                {
                  value: "INJ Imaginary",
                  source_section: "Medication Orders",
                  source_excerpt: "",
                  provenance_type: "normalized",
                },
              ],
              discharge: {
                dietary: [
                  {
                    value: "Soft diet",
                    source_section: "Discharge Planning",
                    source_excerpt: "",
                    provenance_type: "normalized",
                  },
                ],
                instructions: [
                  {
                    value: "Continue physiotherapy",
                    source_section: "Discharge Planning",
                    source_excerpt: "",
                    provenance_type: "normalized",
                  },
                ],
                red_flags: [
                  {
                    value: "Fever",
                    source_section: "Discharge Planning",
                    source_excerpt: "",
                    provenance_type: "normalized",
                  },
                ],
              },
            },
          },
        },
      }),
    );

    expect(transformed.diagnosis.principal.description).toBe("");
    expect(transformed.admission.admissionDiagnosis).toBe("");
    expect(transformed.diagnosis.secondary).toEqual([]);
    expect(transformed.medications.active).toEqual([]);
    expect(transformed.dischargePlan.dietary).toEqual([]);
    expect(transformed.dischargePlan.activityRestrictions.okToDo).toEqual([]);
    expect(transformed.dischargePlan.redFlags).toEqual([]);
  });

  it("keeps legacy fallback behavior when provenance is absent", () => {
    const transformed = transformProcessedDocument(
      createProcessedDocument({
        result: {
          meta: {
            pdf_file: "report.pdf",
            department_type: "General",
          },
          sample_patient_data: {
            name: "Test Patient",
            age: 50,
            mrn: "MRN-1",
            admission_date: "2026-04-01",
            discharge_date: "2026-04-05",
          },
          dashboard_cards: {
            diagnosis_card: {
              principal_diagnosis: "Pneumonia",
              secondary_diagnoses: ["Hypertension"],
            },
            medications_card: {
              medication_list: [{ name: "TAB Paracetamol", dose: "500 mg", frequency: "TDS" }],
            },
          },
          extracted_data: {
            patient: {
              gender: "Male",
            },
            clinical_notes: [
              {
                type: "Discharge Planning",
                summary: "Report back if fever",
                recommendations: "Diet: Soft diet, Continue breathing exercises",
              },
            ],
          },
        },
      }),
    );

    expect(transformed.diagnosis.principal.description).toBe("Pneumonia");
    expect(transformed.admission.admissionDiagnosis).toBe("Pneumonia");
    expect(transformed.medications.active).toHaveLength(1);
    expect(transformed.dischargePlan.dietary).toEqual(["Diet: Soft diet"]);
    expect(transformed.dischargePlan.activityRestrictions.okToDo).toEqual(["Continue breathing exercises."]);
    expect(transformed.dischargePlan.redFlags).toEqual(["Fever."]);
  });

  it("dedupes medication entries and does not fabricate medication changes from the active list", () => {
    const transformed = transformProcessedDocument(
      createProcessedDocument({
        result: {
          meta: {
            pdf_file: "report.pdf",
            department_type: "General",
          },
          sample_patient_data: {
            name: "Test Patient",
            age: 50,
            mrn: "MRN-1",
            admission_date: "2026-04-01",
            discharge_date: "2026-04-05",
          },
          dashboard_cards: {
            medications_card: {
              medication_list: [
                { name: "TAB Paracetamol", dose: "500 mg", frequency: "TDS" },
                { name: "TAB Paracetamol", dose: "500 mg", frequency: "TDS" },
              ],
            },
          },
          extracted_data: {
            patient: {
              gender: "Male",
            },
          },
        },
      }),
    );

    expect(transformed.medications.active).toHaveLength(1);
    expect(transformed.medications.active[0].name).toBe("TAB Paracetamol");
    expect(transformed.medications.changes).toEqual({
      added: [],
      adjusted: [],
      discontinued: [],
    });
  });
});
