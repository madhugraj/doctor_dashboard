/**
 * Dashboard Mapper Skill
 * Transforms extracted clinical data into dashboard card format
 */
const DashboardPresentationAgent = require("../../agents/dashboard_presentation_agent.cjs");
const SectionStatusResolverTool = require("../../tools/presentation/section_status_resolver.tool.cjs");
const { normalizeRiskEntry, normalizeRiskLevel } = require("../../lib/clinical/risk_level_normalizer.cjs");

class DashboardMapperSkill {
  constructor(config = {}) {
    this.name = "Dashboard Mapper";
    this.version = "1.0.0";
    this.config = config;
    this.presentationAgent = new DashboardPresentationAgent(config);
    this.sectionStatusResolver = new SectionStatusResolverTool(config);
  }

  /**
   * Execute the skill - transforms agent data to dashboard format
   * @param {object} context - { agentResult }
   * @returns {Promise<object>}
   */
  async execute(context) {
    const { agentResult } = context;

    if (!agentResult || !agentResult.data) {
      return {
        success: false,
        error: "No agent data provided"
      };
    }

    const data = agentResult.data;
    const validation = agentResult.validation || {};

    // Build dashboard cards from extracted data
    const dashboardCards = this.buildDashboardCards(data, validation);

    // Build sample patient data
    const samplePatientData = this.buildSamplePatientData(data);

    const presentationInput = this.buildPresentationInput(data, dashboardCards, samplePatientData);
    const presentationResult = await this.presentationAgent.execute({ dashboardData: presentationInput });

    return {
      success: true,
      step: "dashboard_mapper",
      data: {
        dashboard_cards: dashboardCards,
        sample_patient_data: samplePatientData,
        presentation: presentationResult.success ? presentationResult.data : { summary_cards: {}, notes_rail: [] }
      }
    };
  }

  buildPresentationInput(data, dashboardCards, samplePatientData) {
    const provenance = data.provenance || {};
    const labResults = Array.isArray(data.lab_results) ? data.lab_results : [];
    const investigations = Array.isArray(data.investigations) ? data.investigations : [];
    const clinicalNotes = Array.isArray(data.clinical_notes) ? data.clinical_notes : [];
    const treatment = data.treatment || {};

    const buildStatus = (items, allowedTypes) => this.sectionStatusResolver.build(items, allowedTypes);

    return {
      vitals: {
        latest: {
          bloodPressure: {
            systolic: data.vitals?.latest?.bp?.systolic || data.vitals?.bp?.systolic || 0,
            diastolic: data.vitals?.latest?.bp?.diastolic || data.vitals?.bp?.diastolic || 0,
          },
          heartRate: { value: data.vitals?.latest?.pulse?.value || data.vitals?.pulse?.value || 0 },
          spo2: { value: data.vitals?.latest?.spo2?.value || data.vitals?.spo2?.value || 0 },
          temperature: { value: data.vitals?.latest?.temperature?.value || data.vitals?.temperature?.value || 0 },
          respiratoryRate: { value: data.vitals?.latest?.resp_rate || data.vitals?.resp_rate || 0 },
        },
        status: dashboardCards.vitals_card?.status || "stable",
      },
      diagnosis: {
        principal: {
          description: data.diagnosis?.principal || "",
          code: data.diagnosis?.icd_code || "",
        },
        secondary: Array.isArray(data.diagnosis?.secondary) ? data.diagnosis.secondary.map((description) => ({ description })) : [],
      },
      medications: {
        active: Array.isArray(dashboardCards.medications_card?.medication_list)
          ? dashboardCards.medications_card.medication_list
          : [],
        allergies: Array.isArray(data.allergies) ? data.allergies.map((allergen) => ({ allergen })) : [],
      },
      labs: {
        totalTests: dashboardCards.labs_card?.total_tests || 0,
        hasResults: labResults.length > 0,
        abnormalCount: dashboardCards.labs_card?.abnormal_count || 0,
        criticalCount: dashboardCards.labs_card?.critical_count || 0,
        pendingCount: labResults.length > 0 ? 0 : investigations.length,
      },
      radiology: {
        completedStudies: dashboardCards.radiology_card?.studies_completed || 0,
        pendingStudies: Array.isArray(provenance.radiology?.pending) ? provenance.radiology.pending.length : 0,
        criticalFindings: dashboardCards.radiology_card?.critical_findings || 0,
      },
      treatment: {
        activeManagement: Array.isArray(treatment.management_items)
          ? treatment.management_items.map((item) => ({ title: item, details: item, source: "Source record" }))
          : [],
        currentApproach: treatment.current_approach || dashboardCards.treatment_card?.current_approach || "",
        complications: Array.isArray(treatment.complications) ? treatment.complications.length : 0,
        complicationsLabel: Array.isArray(treatment.complications) && treatment.complications.length
          ? treatment.complications.join(", ")
          : "Not documented",
      },
      riskWatch: {
        fallRisk: normalizeRiskEntry(data.risk_scores?.fall_risk),
        dvtRisk: normalizeRiskEntry(data.risk_scores?.dvt_risk),
        pressureUlcerRisk: normalizeRiskEntry(data.risk_scores?.pressure_ulcer_risk),
        aspirationRisk: normalizeRiskEntry(data.risk_scores?.aspiration_risk),
        ewsScore: data.risk_scores?.ews_score ?? null,
      },
      clinicalNotes: {
        notes: clinicalNotes.map((note) => ({
          type: note.type || "Clinical Note",
          author: note.author || "",
          date: note.date || "",
          summary: note.summary || "",
          assessment: note.assessment || "",
          recommendations: note.recommendations || "",
          situation: note.situation || "",
          background: note.background || "",
          risk_flags: Array.isArray(note.risk_flags) ? note.risk_flags : [],
          pending_items: Array.isArray(note.pending_items) ? note.pending_items : [],
          handed_over_by: note.handed_over_by || "",
          handed_over_to: note.handed_over_to || "",
          source_excerpt: Array.isArray(note.source_excerpt) ? note.source_excerpt : [],
        })),
      },
      dischargePlan: {
        pendingItems: Array.isArray(data.pending_items?.pending_discharge_items)
          ? data.pending_items.pending_discharge_items.map((item) => item?.item || item?.reason || "").filter(Boolean)
          : [],
      },
      pendingItemsSummary: {
        pending_labs: Array.isArray(data.pending_items?.pending_labs)
          ? data.pending_items.pending_labs.map((item) => item?.test_name || item?.reason || "").filter(Boolean)
          : [],
        pending_radiology: Array.isArray(data.pending_items?.pending_radiology)
          ? data.pending_items.pending_radiology
              .map((item) =>
                [item?.type, item?.body_part ? `of ${item.body_part}` : "", item?.scheduled_date ? `- ${item.scheduled_date}` : ""]
                  .filter(Boolean)
                  .join(" ")
              )
              .filter(Boolean)
          : [],
        medication_reconciliation: data.pending_items?.medication_reconciliation || null,
      },
      followUp: data.follow_up?.appointments || [],
      provenance: {
        sections: {
          vitals: buildStatus(
            [
              provenance.vitals?.systolic,
              provenance.vitals?.diastolic,
              provenance.vitals?.pulse,
              provenance.vitals?.spo2,
              provenance.vitals?.temperature,
              provenance.vitals?.respiratory_rate,
            ],
            ["quoted", "normalized"]
          ),
          diagnosis: buildStatus(
            [provenance.diagnosis?.principal, ...(provenance.diagnosis?.secondary || [])],
            ["quoted", "normalized"]
          ),
          medications: buildStatus(provenance.medications || [], ["quoted", "normalized"]),
          labs: buildStatus(
            [...(provenance.labs?.results || []), ...(provenance.labs?.investigations || [])],
            ["quoted", "normalized"]
          ),
          radiology: buildStatus(
            [...(provenance.radiology?.findings || []), ...(provenance.radiology?.pending || [])],
            ["quoted", "normalized"]
          ),
          treatment: buildStatus(
            [
              provenance.treatment?.current_approach,
              ...(provenance.treatment?.management_items || []),
              ...(provenance.treatment?.procedures || []),
              provenance.treatment?.response,
              ...(provenance.treatment?.complications || []),
            ],
            ["quoted", "normalized", "derived"]
          ),
          handover: buildStatus(
            [provenance.handover?.overview, ...(provenance.handover?.notes || [])],
            ["quoted", "normalized", "derived"]
          ),
          followup: buildStatus(provenance.follow_up?.items || [], ["quoted", "normalized"]),
          discharge: buildStatus(
            [
              ...(provenance.discharge?.dietary || []),
              ...(provenance.discharge?.instructions || []),
              ...(provenance.discharge?.red_flags || []),
            ],
            ["quoted", "normalized"]
          ),
        },
      },
    };
  }

  /**
   * Build dashboard cards from extracted clinical data
   */
  buildDashboardCards(data, validation) {
    const patient = data.patient || {};
    const vitals = data.vitals || {};
    const riskScores = data.risk_scores || {};
    const clinical = data.diagnosis || {};
    const medications = data.medications || [];
    const allergies = data.allergies || [];
    const clinicalNotes = Array.isArray(data.clinical_notes) ? data.clinical_notes : [];
    const treatment = data.treatment || {};

    // Vitals Card - Include readings and reference ranges for trend graphs
    const vitalsCard = {
      icon: "📊",
      title: "Vital Signs",
      status: this.determineVitalsStatus(vitals, riskScores),
      summary: {
        latest_bp: this.formatBP(vitals.latest?.bp || vitals.bp),
        pulse: vitals.latest?.pulse?.value || vitals.pulse?.value || 0,
        temp: vitals.latest?.temperature?.value || vitals.temperature?.value || 0,
        spo2: vitals.latest?.spo2?.value || vitals.spo2?.value || 0
      },
      trend: this.determineTrend(vitals),
      data_points: vitals.readings?.length || this.countVitalsDataPoints(vitals),
      has_alerts: this.hasVitalsAlerts(vitals),
      // NEW: Include all readings with timestamps for trend graph
      readings: vitals.readings || [],
      // NEW: Reference ranges for comparison
      reference_ranges: vitals.reference_ranges || {
        bp_systolic_normal: "<120",
        bp_diastolic_normal: "<80",
        pulse_normal: "60-100",
        spo2_normal: "≥95%",
        temperature_normal: "97-99°F"
      }
    };

    // Diagnosis Card
    const diagnosisCard = {
      icon: "🩺",
      title: "Diagnosis",
      principal_diagnosis: clinical.principal || "",
      icd_code: clinical.icd_code || "",
      secondary_count: (clinical.secondary || []).length,
      secondary_diagnoses: clinical.secondary || [],
      procedures_count: data.procedures?.length || 0
    };

    // Medications Card - Include actual medication list with dose, frequency, and route
    const medicationsCard = {
      icon: "💊",
      title: "Medications",
      active_count: Array.isArray(medications) ? medications.length : 0,
      allergy_count: allergies.length,
      allergies: allergies,
      categories: this.categorizeMedications(medications),
      // Include full medication list for display with all fields
      medication_list: Array.isArray(medications) ? medications.map(med => {
        const name = med.name || "";
        const upperName = name.toUpperCase();
        // Determine route from name if not provided
        let route = med.route || "Oral";
        if (upperName.includes("INJ") || upperName.includes("INJECTION")) route = "IV/IM";
        else if (upperName.includes("TAB") || upperName.includes("TABLET") || upperName.includes("CAPSULE")) route = "Oral";
        else if (upperName.includes("SYRUP") || upperName.includes("SUSPENSION")) route = "Oral";
        else if (upperName.includes("OINTMENT") || upperName.includes("CREAM") || upperName.includes("GEL")) route = "Topical";

        // Determine category
        let category = med.category || "Other";
        if (upperName.includes("INSULIN") || upperName.includes("ACTRAPID") || upperName.includes("METFORMIN")) category = "Diabetes";
        else if (upperName.includes("MANNITOL") || upperName.includes("LASIX") || upperName.includes("FUROSEMIDE")) category = "Diuretic";
        else if (upperName.includes("LEVETIRACETAM") || upperName.includes("LEVERA") || upperName.includes("PHENYTOIN")) category = "Antiepileptic";
        else if (upperName.includes("PANTOPRAZOLE") || upperName.includes("PAN") || upperName.includes("OMEPRazole")) category = "PPI/Gastric";
        else if (upperName.includes("ONDANSETRON") || upperName.includes("ZOFER") || upperName.includes("EMESET")) category = "Antiemetic";
        else if (upperName.includes("ASPIRIN") || upperName.includes("CLOPIDOGREL")) category = "Antiplatelet";
        else if (upperName.includes("METOPROLOL") || upperName.includes("ATENOLOL")) category = "Beta Blocker";
        else if (upperName.includes("AMLODIPINE") || upperName.includes("AMILONG")) category = "Calcium Channel Blocker";
        else if (upperName.includes("ATORVASTATIN") || upperName.includes("ROSUVASTATIN")) category = "Statin";
        else if (upperName.includes("RAMIPRIL") || upperName.includes("ENALAPRIL")) category = "ACE Inhibitor";

        return {
          name: name,
          dose: med.dose || "As prescribed",
          frequency: med.frequency || "As prescribed",
          route: route,
          category: category,
          start: "Generated",
          instructions: med.instructions || "Validate against source document"
        };
      }) : []
    };

    // Labs Card - Show lab results if available, otherwise show investigations ordered
    const labResults = data.lab_results || [];
    const investigations = data.investigations || [];
    const hasLabResults = labResults.length > 0;

    const labsCard = {
      icon: "🔬",
      title: "Laboratory Results",
      total_tests: hasLabResults ? labResults.length : investigations.length,
      abnormal_count: this.countAbnormalLabResults(labResults),
      critical_count: this.countCriticalLabResults(labResults),
      pending_count: hasLabResults ? 0 : investigations.length,
      top_abnormal: this.getTopAbnormalLabResult(labResults),
      // Include actual lab results
      lab_results: labResults.map(result => ({
        test: result.test_name || result.test || "Unknown",
        value: result.value || "",
        reference: result.reference || result.ref || "N/A",
        flag: result.flag || result.status || ""
      })),
      // Include investigation list
      investigations_list: investigations,
      has_results: hasLabResults,
      note: hasLabResults
        ? `${labResults.length} lab results documented`
        : (investigations.length > 0 ? "Investigations ordered (results not in document)" : "No laboratory data documented")
    };

    // Risk Assessment Card (combines all risk scores)
    const riskCard = {
      icon: "⚠️",
      title: "Risk Assessment",
      fall_risk: this.formatRisk(riskScores.fall_risk),
      dvt_risk: this.formatRisk(riskScores.dvt_risk),
      pressure_ulcer_risk: this.formatRisk(riskScores.pressure_ulcer_risk),
      aspiration_risk: this.formatRisk(riskScores.aspiration_risk),
      ews_score: riskScores.ews_score || 0,
      overall_status: this.determineOverallRiskStatus(riskScores)
    };

    // Radiology Card
    const radiologyCard = {
      icon: "🫀",
      title: "Radiology & Imaging",
      studies_completed: this.countRadiologyStudies(data.investigations),
      critical_findings: 0,
      key_finding: ""
    };

    // Treatment Card
    const treatmentCard = {
      icon: "🏥",
      title: "Treatment & Procedures",
      procedures_performed: Array.isArray(treatment.procedures) ? treatment.procedures.length : (data.procedures?.length || 0),
      surgeries: 0,
      response: treatment.response || "",
      current_approach: treatment.current_approach || "",
      management_items: Array.isArray(treatment.management_items) ? treatment.management_items : [],
      complications_count: Array.isArray(treatment.complications) ? treatment.complications.length : 0
    };

    // Clinical Notes Card
    const clinicalNotesCard = {
      icon: "📝",
      title: "Clinical Notes",
      total_notes: clinicalNotes.length,
      last_update: clinicalNotes[0]?.date || data.meta?.processed_at || new Date().toISOString(),
      notes: clinicalNotes.map((note) => ({
        type: note.type || "Clinical Note",
        author: note.author || "",
        date: note.date || "",
        summary: note.summary || "",
        situation: note.situation || "",
        background: note.background || "",
        assessment: note.assessment || "",
        recommendations: note.recommendations || "",
        pending_items: Array.isArray(note.pending_items) ? note.pending_items : [],
        risk_flags: Array.isArray(note.risk_flags) ? note.risk_flags : [],
        handed_over_by: note.handed_over_by || "",
        handed_over_to: note.handed_over_to || "",
        source_excerpt: Array.isArray(note.source_excerpt) ? note.source_excerpt : []
      }))
    };

    // Discharge Plan Card
    const dischargePlanCard = {
      icon: "📋",
      title: "Discharge Plan",
      condition: this.determineDischargeCondition(riskScores, vitals),
      instruction_count: data.discharge_instructions?.length || 0,
      red_flags: this.countRedFlags(validation)
    };

    // Follow Up Card
    const followUpCard = {
      icon: "📅",
      title: "Follow-Up",
      next_appointment: data.follow_up?.next_appointment || "",
      appointment_count: data.follow_up?.appointments?.length || 0
    };

    return {
      vitals_card: vitalsCard,
      diagnosis_card: diagnosisCard,
      medications_card: medicationsCard,
      labs_card: labsCard,
      risk_card: riskCard,
      radiology_card: radiologyCard,
      treatment_card: treatmentCard,
      clinical_notes_card: clinicalNotesCard,
      discharge_plan_card: dischargePlanCard,
      follow_up_card: followUpCard
    };
  }

  /**
   * Build sample patient data
   */
  buildSamplePatientData(data) {
    const patient = data.patient || {};
    const meta = data.meta || {};

    return {
      name: patient.name || "Sample Patient Name",
      age: patient.age || 0,
      mrn: patient.mrn || "",
      admission_date: patient.admission_date || "",
      discharge_date: patient.discharge_date || "",
      los_days: this.calculateLOS(patient),
      summary: this.generatePatientSummary(data)
    };
  }

  // Helper methods for card data transformation

  determineVitalsStatus(vitals, riskScores) {
    if (riskScores.ews_score >= 7) return "critical";
    if (riskScores.ews_score >= 5) return "warning";
    if (this.hasVitalsAlerts(vitals)) return "warning";
    return "stable";
  }

  formatBP(bp) {
    if (!bp) return "";
    if (typeof bp === "object") {
      return `${bp.systolic || 0}/${bp.diastolic || 0}`;
    }
    return bp;
  }

  determineTrend(vitals) {
    // Simple trend logic - could be enhanced with historical data
    if (vitals.bp?.status === "high" || vitals.pulse?.status === "tachycardia") {
      return "deteriorating";
    }
    return "stable";
  }

  countVitalsDataPoints(vitals) {
    let count = 0;
    if (vitals.bp) count++;
    if (vitals.pulse) count++;
    if (vitals.temperature) count++;
    if (vitals.spo2) count++;
    if (vitals.resp_rate) count++;
    return count;
  }

  hasVitalsAlerts(vitals) {
    if (vitals.bp?.status === "high") return true;
    if (vitals.pulse?.status !== "normal") return true;
    if (vitals.spo2?.status === "low") return true;
    if (vitals.grbs?.interpretation === "diabetic") return true;
    return false;
  }

  categorizeMedications(medications) {
    if (!Array.isArray(medications)) return [];
    const categories = {};
    medications.forEach(med => {
      // Categorize based on medication name
      const name = med.name?.toUpperCase() || "";
      let cat = "Other";

      if (name.includes("INJ") || name.includes("INJECTION")) {
        cat = "Injections";
      } else if (name.includes("TAB") || name.includes("TABLET")) {
        cat = "Tablets";
      } else if (name.includes("IV FLUID") || name.includes("NORMAL SALINE") || name.includes("NS")) {
        cat = "IV Fluids";
      } else if (name.includes("INSULIN") || name.includes("ACTRAPID")) {
        cat = "Diabetes";
      } else if (name.includes("MANNITOL") || name.includes("LASIX")) {
        cat = "Neurology";
      } else if (name.includes("ANTIBIOTIC") || name.includes("-MYCIN") || name.includes("-CILLIN")) {
        cat = "Antibiotics";
      }

      categories[cat] = (categories[cat] || 0) + 1;
    });
    return Object.entries(categories).map(([name, count]) => ({ name, count }));
  }

  countAbnormalLabs(vitals) {
    let count = 0;
    if (vitals.bp?.status !== "normal") count++;
    if (vitals.pulse?.status !== "normal") count++;
    if (vitals.spo2?.status === "low") count++;
    if (vitals.grbs?.interpretation !== "normal") count++;
    return count;
  }

  countAbnormalLabResults(labResults) {
    if (!Array.isArray(labResults)) return 0;
    return labResults.filter(result =>
      result.flag && ['high', 'low', 'abnormal', 'critical', 'h', 'l', 'a', 'c'].includes(result.flag.toLowerCase())
    ).length;
  }

  countCriticalLabResults(labResults) {
    if (!Array.isArray(labResults)) return 0;
    return labResults.filter(result =>
      result.flag && ['critical', 'c', 'panic'].includes(result.flag.toLowerCase())
    ).length;
  }

  getTopAbnormalLabResult(labResults) {
    if (!Array.isArray(labResults) || labResults.length === 0) return "";
    const critical = labResults.find(r =>
      r.flag && ['critical', 'c', 'panic'].includes(r.flag.toLowerCase())
    );
    if (critical) return `${critical.test_name || critical.test}: ${critical.value}`;
    const abnormal = labResults.find(r =>
      r.flag && ['high', 'low', 'abnormal', 'h', 'l', 'a'].includes(r.flag.toLowerCase())
    );
    return abnormal ? `${abnormal.test_name || abnormal.test}: ${abnormal.value}` : "";
  }

  countCriticalLabs(riskScores) {
    let count = 0;
    if (riskScores.ews_score >= 7) count++;
    if (normalizeRiskLevel(riskScores.fall_risk?.level) === "High") count++;
    if (normalizeRiskLevel(riskScores.aspiration_risk?.level) === "High") count++;
    return count;
  }

  getTopAbnormal(vitals) {
    const abnormalities = [];
    if (vitals.bp?.status === "high") abnormalities.push("High BP");
    if (vitals.pulse?.status === "tachycardia") abnormalities.push("Tachycardia");
    if (vitals.spo2?.status === "low") abnormalities.push("Low SpO2");
    return abnormalities[0] || "";
  }

  formatRisk(risk) {
    const normalized = normalizeRiskEntry(risk);
    if (!normalized.level) return { score: 0, level: "Not assessed" };
    return {
      score: normalized.score || 0,
      level: normalized.level
    };
  }

  determineOverallRiskStatus(riskScores) {
    const highRisks = [];
    if (normalizeRiskLevel(riskScores.fall_risk?.level) === "High") highRisks.push("Fall");
    if (normalizeRiskLevel(riskScores.dvt_risk?.level) === "High") highRisks.push("DVT");
    if (normalizeRiskLevel(riskScores.pressure_ulcer_risk?.level) === "High") highRisks.push("Pressure Ulcer");
    if (normalizeRiskLevel(riskScores.aspiration_risk?.level) === "High") highRisks.push("Aspiration");

    if (highRisks.length >= 2) return "critical";
    if (highRisks.length === 1) return "warning";
    return "stable";
  }

  countRadiologyStudies(investigations) {
    if (!Array.isArray(investigations)) return 0;
    return investigations.filter(inv =>
      String(inv?.type || inv || "").toLowerCase().includes("xray") ||
      String(inv?.type || inv || "").toLowerCase().includes("ct") ||
      String(inv?.type || inv || "").toLowerCase().includes("mri") ||
      String(inv?.type || inv || "").toLowerCase().includes("ultrasound") ||
      String(inv?.type || inv || "").toLowerCase().includes("usg") ||
      String(inv?.type || inv || "").toLowerCase().includes("echo")
    ).length;
  }

  determineTreatmentResponse(data) {
    const riskScores = data.risk_scores || {};
    if (riskScores.ews_score >= 7) return "Poor";
    if (riskScores.ews_score >= 5) return "Fair";
    return "Good";
  }

  determineDischargeCondition(riskScores, vitals) {
    const overallRisk = this.determineOverallRiskStatus(riskScores);
    if (overallRisk === "critical") return "Unstable";
    if (overallRisk === "warning") return "Stable (with precautions)";
    return "Stable";
  }

  countRedFlags(validation) {
    return (validation.inconsistencies_found || []).length +
           (validation.missing_critical_fields || []).length;
  }

  calculateLOS(patient) {
    if (patient.los_days) return patient.los_days;
    if (patient.admission_date && patient.discharge_date) {
      const adm = new Date(patient.admission_date);
      const dis = new Date(patient.discharge_date);
      return Math.ceil((dis - adm) / (1000 * 60 * 60 * 24));
    }
    return 0;
  }

  generatePatientSummary(data) {
    const patient = data.patient || {};
    const diagnosis = data.diagnosis || {};
    const riskScores = data.risk_scores || {};

    const age = patient.age || 0;
    const gender = patient.gender || "";
    const principalDiagnosis = diagnosis.principal || "Unknown";
    const riskLevel = this.determineOverallRiskStatus(riskScores);

    return `${age}-year-old ${gender} diagnosed with ${principalDiagnosis}. ` +
           `Overall risk status: ${riskLevel}. ` +
           `Processed via Agent System v${data.meta?.agent_version || "2.0.0"}.`;
  }
}

module.exports = DashboardMapperSkill;
