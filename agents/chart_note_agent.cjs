/**
 * Chart Note Agent (ReAct-Style with Thinking)
 * Multi-step chart note generation with explicit reasoning for each SOAP section
 */

const GemmaClientTool = require("../tools/llm/gemma_client.tool.cjs");
const PromptBuilderTool = require("../tools/llm/prompt_builder.tool.cjs");

class ChartNoteAgent {
  constructor(config = {}) {
    this.name = "Chart Note Agent (ReAct)";
    this.version = "1.0.0";
    this.type = "reasoning_agent";

    this.gemmaClient = new GemmaClientTool(config.gemma || {});
    this.promptBuilder = new PromptBuilderTool(config);

    this.config = {
      temperature: 0.3,
      maxTokensPerStep: 1500,
      timeoutPerStep: 60000,
      logSteps: true,
      ...config
    };
  }

  /**
   * Generate chart note with ReAct-style reasoning
   * @param {object} context - { extractedData, pdfText, citationData, validationSummary }
   * @param {function} onProgress - Progress callback
   * @returns {Promise<object>}
   */
  async execute(context, onProgress = null) {
    const { extractedData, pdfText, citationData, validationSummary } = context;

    console.log("\n🤖 Chart Note Agent (ReAct-Style) starting...");

    // Data quality validation
    const dataQuality = this.validateExtractedData(extractedData);
    console.log("📊 Data Quality Assessment:", dataQuality);

    const startTime = Date.now();
    const reasoningSteps = [];
    let totalTokens = 0;

    try {
      // STEP 1: Analyze the clinical picture (THINK)
      console.log("\n📝 Step 1: Analyzing clinical picture...");
      const analysisStep = await this.thinkAboutClinicalPicture(extractedData, pdfText);
      reasoningSteps.push({ step: "clinical_analysis", ...analysisStep });
      totalTokens += analysisStep.usage?.totalTokens || 0;

      if (onProgress) onProgress({ step: "analysis", status: "complete", data: analysisStep });

      // STEP 2: Determine SOAP structure (THINK)
      console.log("📝 Step 2: Determining SOAP structure...");
      const structureStep = await this.thinkAboutSOAPStructure(extractedData, analysisStep.insights);
      reasoningSteps.push({ step: "soap_structure", ...structureStep });
      totalTokens += structureStep.usage?.totalTokens || 0;

      if (onProgress) onProgress({ step: "structure", status: "complete", data: structureStep });

      // STEP 3: Generate ALLERGIES section (THINK + WRITE)
      console.log("📝 Step 3: Generating ALLERGIES section...");
      const allergiesStep = await this.generateAllergies(extractedData);
      reasoningSteps.push({ step: "allergies", ...allergiesStep });
      totalTokens += allergiesStep.usage?.totalTokens || 0;

      if (onProgress) onProgress({ step: "allergies", status: "complete" });

      // STEP 4: Generate CHIEF COMPLAINT & HISTORY section (THINK + WRITE)
      console.log("📝 Step 4: Generating CHIEF COMPLAINT & HISTORY section...");
      const subjectiveStep = await this.generateSubjective(extractedData, structureStep.subjective);
      reasoningSteps.push({ step: "subjective", ...subjectiveStep });
      totalTokens += subjectiveStep.usage?.totalTokens || 0;

      if (onProgress) onProgress({ step: "subjective", status: "complete" });

      // STEP 5: Generate COMORBIDITIES section (THINK + WRITE)
      console.log("📝 Step 5: Generating COMORBIDITIES section...");
      const comorbiditiesStep = await this.generateComorbidities(extractedData);
      reasoningSteps.push({ step: "comorbidities", ...comorbiditiesStep });
      totalTokens += comorbiditiesStep.usage?.totalTokens || 0;

      if (onProgress) onProgress({ step: "comorbidities", status: "complete" });

      // STEP 6: Generate PHYSICAL EXAMINATION section (THINK + WRITE)
      console.log("📝 Step 6: Generating PHYSICAL EXAMINATION section...");
      const objectiveStep = await this.generateObjective(extractedData, structureStep.objective);
      reasoningSteps.push({ step: "objective", ...objectiveStep });
      totalTokens += objectiveStep.usage?.totalTokens || 0;

      if (onProgress) onProgress({ step: "objective", status: "complete" });

      // STEP 7: Generate PROCEDURES & INTERVENTIONS section (THINK + WRITE)
      console.log("📝 Step 7: Generating PROCEDURES & INTERVENTIONS section...");
      const proceduresStep = await this.generateProcedures(extractedData);
      reasoningSteps.push({ step: "procedures", ...proceduresStep });
      totalTokens += proceduresStep.usage?.totalTokens || 0;

      if (onProgress) onProgress({ step: "procedures", status: "complete" });

      // STEP 8: Generate HOSPITAL COURSE section (THINK + WRITE)
      console.log("📝 Step 8: Generating HOSPITAL COURSE section...");
      const hospitalCourseStep = await this.generateHospitalCourse(extractedData, subjectiveStep.content);
      reasoningSteps.push({ step: "hospital_course", ...hospitalCourseStep });
      totalTokens += hospitalCourseStep.usage?.totalTokens || 0;

      if (onProgress) onProgress({ step: "hospital_course", status: "complete" });

      // STEP 9: Generate ASSESSMENT section (THINK + WRITE)
      console.log("📝 Step 9: Generating ASSESSMENT section...");
      const assessmentStep = await this.generateAssessment(extractedData, structureStep.assessment);
      reasoningSteps.push({ step: "assessment", ...assessmentStep });
      totalTokens += assessmentStep.usage?.totalTokens || 0;

      if (onProgress) onProgress({ step: "assessment", status: "complete" });

      // STEP 10: Generate PENDING INVESTIGATIONS section (THINK + WRITE)
      console.log("📝 Step 10: Generating PENDING INVESTIGATIONS section...");
      const pendingStep = await this.generatePendingInvestigations(extractedData);
      reasoningSteps.push({ step: "pending", ...pendingStep });
      totalTokens += pendingStep.usage?.totalTokens || 0;

      if (onProgress) onProgress({ step: "pending", status: "complete" });

      // STEP 11: Generate PLAN section (THINK + WRITE)
      console.log("📝 Step 11: Generating PLAN section...");
      const planStep = await this.generatePlan(extractedData, structureStep.plan);
      reasoningSteps.push({ step: "plan", ...planStep });
      totalTokens += planStep.usage?.totalTokens || 0;

      if (onProgress) onProgress({ step: "plan", status: "complete" });

      // STEP 12: Generate NURSING CARE NEEDS section (THINK + WRITE)
      console.log("📝 Step 12: Generating NURSING CARE NEEDS section...");
      const nursingStep = await this.generateNursingCare(extractedData);
      reasoningSteps.push({ step: "nursing", ...nursingStep });
      totalTokens += nursingStep.usage?.totalTokens || 0;

      if (onProgress) onProgress({ step: "nursing", status: "complete" });

      // STEP 13: Generate RISK FLAGS section (THINK + WRITE)
      console.log("📝 Step 13: Generating RISK FLAGS section...");
      const riskFlagsStep = await this.generateRiskFlags(extractedData);
      reasoningSteps.push({ step: "risk_flags", ...riskFlagsStep });
      totalTokens += riskFlagsStep.usage?.totalTokens || 0;

      if (onProgress) onProgress({ step: "risk_flags", status: "complete" });

      // STEP 14: Review and refine (THINK)
      console.log("📝 Step 14: Reviewing and refining chart note...");
      const reviewStep = await this.reviewAndRefine({
        allergies: allergiesStep.content,
        subjective: subjectiveStep.content,
        comorbidities: comorbiditiesStep.content,
        objective: objectiveStep.content,
        procedures: proceduresStep.content,
        hospitalCourse: hospitalCourseStep.content,
        assessment: assessmentStep.content,
        pending: pendingStep.content,
        plan: planStep.content,
        nursing: nursingStep.content,
        riskFlags: riskFlagsStep.content,
        validationSummary
      });
      reasoningSteps.push({ step: "review", ...reviewStep });
      totalTokens += reviewStep.usage?.totalTokens || 0;

      if (onProgress) onProgress({ step: "review", status: "complete" });

      // Compile final chart note
      const finalChartNote = this.compileChartNote({
        allergies: reviewStep.refined?.allergies || allergiesStep.content,
        subjective: reviewStep.refined?.subjective || subjectiveStep.content,
        comorbidities: reviewStep.refined?.comorbidities || comorbiditiesStep.content,
        objective: reviewStep.refined?.objective || objectiveStep.content,
        procedures: reviewStep.refined?.procedures || proceduresStep.content,
        hospitalCourse: reviewStep.refined?.hospitalCourse || hospitalCourseStep.content,
        assessment: reviewStep.refined?.assessment || assessmentStep.content,
        pending: reviewStep.refined?.pending || pendingStep.content,
        plan: reviewStep.refined?.plan || planStep.content,
        nursing: reviewStep.refined?.nursing || nursingStep.content,
        riskFlags: reviewStep.refined?.riskFlags || riskFlagsStep.content,
        extractedData,
        validationSummary
      });

      const elapsed = Date.now() - startTime;
      console.log(`\n✅ Chart note generated in ${elapsed}ms | Tokens: ${totalTokens}`);

      return {
        success: true,
        step: "chart_note_agent",
        data: {
          chart_note: finalChartNote,
          reasoning_steps: reasoningSteps,
          metadata: {
            generated_at: new Date().toISOString(),
            total_tokens: totalTokens,
            generation_time_ms: elapsed,
            agent_type: "react",
            steps_completed: reasoningSteps.length
          }
        },
        usage: { totalTokens }
      };

    } catch (error) {
      console.error("❌ Chart Note Agent error:", error.message);
      return {
        success: false,
        step: "chart_note_agent",
        error: error.message,
        reasoning_steps
      };
    }
  }

  /**
   * STEP 1: Think about the clinical picture
   */
  async thinkAboutClinicalPicture(extractedData, pdfText) {
    const prompt = `You are an expert clinician analyzing a patient's hospital stay.

EXTRACTED DATA:
${JSON.stringify(extractedData, null, 2)}

${pdfText ? `SOURCE DOCUMENT (first 3000 chars):\n${pdfText.substring(0, 3000)}` : ''}

Think through this step-by-step:

1. What is the primary reason for admission?
2. What are the key clinical events during the stay?
3. What is the patient's current condition at discharge?
4. What are the most important data points to document?

Provide your analysis in the following format:

THOUGHT: [Your clinical reasoning]
KEY_FINDINGS: [Bullet list of 5-7 key findings]
PATIENT_STATUS: [Stable/Guarded/Critical and why]
COMPLEXITY: [Low/Medium/High and why]`;

    const result = await this.gemmaClient.execute(prompt, {
      temperature: 0.3,
      maxTokens: 1000
    });

    if (!result.success) {
      return { insights: "Analysis failed", usage: {} };
    }

    // Parse the response
    const content = result.content;
    return {
      insights: content,
      thought: this.extractSection(content, "THOUGHT"),
      keyFindings: this.extractSection(content, "KEY_FINDINGS"),
      patientStatus: this.extractSection(content, "PATIENT_STATUS"),
      complexity: this.extractSection(content, "COMPLEXITY"),
      usage: result.usage
    };
  }

  /**
   * STEP 2: Think about SOAP structure
   */
  async thinkAboutSOAPStructure(extractedData, analysis) {
    const prompt = `Based on the clinical analysis, determine what goes into each SOAP section.

CLINICAL ANALYSIS:
${analysis}

EXTRACTED DATA SUMMARY:
- Diagnosis: ${JSON.stringify(extractedData.diagnosis || {})}
- Vitals: ${JSON.stringify(extractedData.vitals || {})}
- Medications: ${extractedData.medications?.length || 0} medications
- Labs: ${extractedData.lab_results?.length || 0} results
- Risk Scores: ${JSON.stringify(extractedData.risk_scores || {})}

For each SOAP section, list what MUST be included:

SUBJECTIVE - Must include:
- [List key subjective elements]

OBJECTIVE - Must include:
- [List key objective elements]

ASSESSMENT - Must include:
- [List key assessment elements]

PLAN - Must include:
- [List key plan elements]

Focus on what's clinically most important for this specific patient.`;

    const result = await this.gemmaClient.execute(prompt, {
      temperature: 0.3,
      maxTokens: 800
    });

    const content = result.success ? result.content : "";

    console.log("  📋 SOAP structure determined:", {
      subjective: this.extractSection(content, "SUBJECTIVE")?.substring(0, 50) || "N/A",
      objective: this.extractSection(content, "OBJECTIVE")?.substring(0, 50) || "N/A",
      assessment: this.extractSection(content, "ASSESSMENT")?.substring(0, 50) || "N/A",
      plan: this.extractSection(content, "PLAN")?.substring(0, 50) || "N/A"
    });

    return {
      subjective: this.extractSection(content, "SUBJECTIVE") || "History and symptoms",
      objective: this.extractSection(content, "OBJECTIVE") || "Clinical findings",
      assessment: this.extractSection(content, "ASSESSMENT") || "Clinical impression",
      plan: this.extractSection(content, "PLAN") || "Discharge planning",
      structure: content,
      usage: result.usage
    };
  }

  /**
   * STEP 3: Generate Subjective section
   */
  async generateSubjective(extractedData, requirements) {
    const prompt = `Generate the SUBJECTIVE section of a discharge chart note.

Patient Data:
${JSON.stringify(extractedData, null, 2)}

REQUIREMENTS: ${requirements}

Write a detailed SUBJECTIVE section that includes:
- Chief complaint and reason for admission
- Present illness narrative in chronological order
- Patient's reported symptoms and progression
- Relevant past medical history
- Patient's perspective and concerns

The section should be 3-5 sentences, clinically detailed, and written as the attending physician would document it.

Format:
THOUGHT: [Your reasoning for what to include in subjective]
SUBJECTIVE SECTION:
[The actual content]`;

    const result = await this.gemmaClient.execute(prompt, {
      temperature: 0.4,
      maxTokens: 1000
    });

    const content = result.success ? result.content : "";
    const sectionContent = this.cleanSectionContent(this.extractAfter(content, "SUBJECTIVE SECTION"));

    console.log("  📝 Subjective section generated:", {
      length: sectionContent?.length || 0,
      preview: sectionContent?.substring(0, 100) || "N/A"
    });

    return {
      thought: this.extractSection(content, "THOUGHT"),
      content: sectionContent,
      usage: result.usage
    };
  }

  /**
   * STEP 4: Generate Objective section
   */
  async generateObjective(extractedData, requirements) {
    const vitals = extractedData.vitals || {};
    const labs = extractedData.lab_results?.slice(0, 5) || [];
    const risks = extractedData.risk_scores || {};
    const functional = extractedData.functional_status || {};

    const prompt = `Generate the OBJECTIVE section of a discharge chart note.

VITALS AT DISCHARGE:
${JSON.stringify(vitals, null, 2)}

KEY LAB RESULTS:
${JSON.stringify(labs, null, 2)}

RISK ASSESSMENT:
${JSON.stringify(risks, null, 2)}

FUNCTIONAL STATUS:
${JSON.stringify(functional, null, 2)}

REQUIREMENTS: ${requirements}

Write a detailed OBJECTIVE section that includes:
- Vital signs with actual values
- Pertinent physical exam findings
- Abnormal lab values with reference ranges
- Risk assessment scores with interpretation
- Functional status and ADL assessment

Format:
THOUGHT: [Your reasoning for objective data selection]
OBJECTIVE SECTION:
[The actual content with specific values and interpretations]`;

    const result = await this.gemmaClient.execute(prompt, {
      temperature: 0.3,
      maxTokens: 1200
    });

    const content = result.success ? result.content : "";
    const sectionContent = this.cleanSectionContent(this.extractAfter(content, "OBJECTIVE SECTION"));

    console.log("  📝 Objective section generated:", {
      length: sectionContent?.length || 0,
      preview: sectionContent?.substring(0, 100) || "N/A"
    });

    return {
      thought: this.extractSection(content, "THOUGHT"),
      content: sectionContent,
      usage: result.usage
    };
  }

  /**
   * STEP 5: Generate Assessment section
   */
  async generateAssessment(extractedData, requirements) {
    const diagnosis = extractedData.diagnosis || {};
    const treatment = extractedData.treatment || {};
    const response = extractedData.response_to_treatment || "";

    const prompt = `Generate the ASSESSMENT section of a discharge chart note.

DIAGNOSIS:
${JSON.stringify(diagnosis, null, 2)}

TREATMENT GIVEN:
${JSON.stringify(treatment, null, 2)}

RESPONSE: ${response}

REQUIREMENTS: ${requirements}

Write a comprehensive ASSESSMENT section that includes:
- Principal diagnosis with clinical reasoning
- Secondary diagnoses/comorbidities
- Clinical judgment on patient's condition
- Response to treatment during stay
- Prognosis and severity classification
- Discharge disposition rationale

Format:
THOUGHT: [Your clinical reasoning and synthesis]
ASSESSMENT SECTION:
[The actual content with clinical judgment]`;

    const result = await this.gemmaClient.execute(prompt, {
      temperature: 0.4,
      maxTokens: 1000
    });

    const content = result.success ? result.content : "";
    const sectionContent = this.cleanSectionContent(this.extractAfter(content, "ASSESSMENT SECTION"));

    console.log("  📝 Assessment section generated:", {
      length: sectionContent?.length || 0,
      preview: sectionContent?.substring(0, 100) || "N/A"
    });

    return {
      thought: this.extractSection(content, "THOUGHT"),
      content: sectionContent,
      usage: result.usage
    };
  }

  /**
   * STEP 6: Generate Plan section
   */
  async generatePlan(extractedData, requirements) {
    const medications = extractedData.medications || [];
    const dischargeMeds = extractedData.discharge_medications || medications;
    const education = extractedData.patient_education || [];
    const followUp = extractedData.follow_up || {};

    const prompt = `Generate the PLAN (Discharge Planning) section of a chart note.

DISCHARGE MEDICATIONS (${dischargeMeds.length}):
${JSON.stringify(dischargeMeds.slice(0, 10), null, 2)}

PATIENT EDUCATION:
${JSON.stringify(education, null, 2)}

FOLLOW-UP:
${JSON.stringify(followUp, null, 2)}

REQUIREMENTS: ${requirements}

Write a comprehensive PLAN section that includes:
- Organized medication list with doses, frequency, route
- Activity restrictions and mobility requirements
- Dietary instructions
- Patient education topics covered
- Red flags and warning signs
- Follow-up arrangements (specialty, timing)
- Home health/services arranged

Format:
THOUGHT: [Your reasoning for discharge planning]
PLAN SECTION:
[The actual content with specific arrangements]`;

    const result = await this.gemmaClient.execute(prompt, {
      temperature: 0.3,
      maxTokens: 1200
    });

    const content = result.success ? result.content : "";
    const sectionContent = this.cleanSectionContent(this.extractAfter(content, "PLAN SECTION"));

    console.log("  📝 Plan section generated:", {
      length: sectionContent?.length || 0,
      preview: sectionContent?.substring(0, 100) || "N/A"
    });

    return {
      thought: this.extractSection(content, "THOUGHT"),
      content: sectionContent,
      usage: result.usage
    };
  }

  /**
   * Generate ALLERGIES section
   */
  async generateAllergies(extractedData) {
    const allergies = extractedData.allergies || [];
    const prompt = `Generate the ALLERGIES & ADVERSE REACTIONS section of a discharge chart note.

ALLERGIES DATA:
${JSON.stringify(allergies, null, 2)}

If allergies are documented, list them clearly with severity if known.
If no allergies are documented or array is empty, state "No Known Allergies (NKDA)"

Format:
THOUGHT: [Your reasoning]
ALLERGIES SECTION:
[The actual content - clear and concise]`;

    const result = await this.gemmaClient.execute(prompt, {
      temperature: 0.2,
      maxTokens: 300
    });

    const content = result.success ? result.content : "";
    const sectionContent = this.cleanSectionContent(this.extractAfter(content, "ALLERGIES SECTION"));

    console.log("  📝 Allergies section generated:", {
      length: sectionContent?.length || 0,
      preview: sectionContent?.substring(0, 100) || "N/A"
    });

    return {
      thought: this.extractSection(content, "THOUGHT"),
      content: sectionContent || "No Known Allergies (NKDA)",
      usage: result.usage
    };
  }

  /**
   * Generate COMORBIDITIES section
   */
  async generateComorbidities(extractedData) {
    const diagnosis = extractedData.diagnosis || {};
    const comorbidities = diagnosis.comorbidities || diagnosis.secondary || [];
    const prompt = `Generate the COMORBIDITIES section of a discharge chart note.

DIAGNOSIS DATA:
${JSON.stringify(diagnosis, null, 2)}

Document all comorbidities and secondary diagnoses that affect the patient's care.
Include conditions like hypertension, diabetes, heart disease, kidney disease, etc.

Format:
THOUGHT: [Your reasoning]
COMORBIDITIES SECTION:
[The actual content - list each comorbidity]`;

    const result = await this.gemmaClient.execute(prompt, {
      temperature: 0.3,
      maxTokens: 500
    });

    const content = result.success ? result.content : "";
    const sectionContent = this.cleanSectionContent(this.extractAfter(content, "COMORBIDITIES SECTION"));

    console.log("  📝 Comorbidities section generated:", {
      length: sectionContent?.length || 0,
      preview: sectionContent?.substring(0, 100) || "N/A"
    });

    return {
      thought: this.extractSection(content, "THOUGHT"),
      content: sectionContent || "No significant comorbidities documented.",
      usage: result.usage
    };
  }

  /**
   * Generate PROCEDURES & INTERVENTIONS section
   */
  async generateProcedures(extractedData) {
    const treatment = extractedData.treatment || {};
    const procedures = treatment.procedures || [];
    const clinicalNotes = extractedData.clinical_notes || [];
    const prompt = `Generate the PROCEDURES & INTERVENTIONS section of a discharge chart note.

TREATMENT DATA:
${JSON.stringify(treatment, null, 2)}

CLINICAL NOTES (for procedure context):
${JSON.stringify(clinicalNotes.slice(0, 3), null, 2)}

List all procedures, surgeries, interventions, and consults performed during the stay.
Include dates when available.

Format:
THOUGHT: [Your reasoning]
PROCEDURES SECTION:
[The actual content - list procedures with dates]`;

    const result = await this.gemmaClient.execute(prompt, {
      temperature: 0.3,
      maxTokens: 600
    });

    const content = result.success ? result.content : "";
    const sectionContent = this.cleanSectionContent(this.extractAfter(content, "PROCEDURES SECTION"));

    console.log("  📝 Procedures section generated:", {
      length: sectionContent?.length || 0,
      preview: sectionContent?.substring(0, 100) || "N/A"
    });

    return {
      thought: this.extractSection(content, "THOUGHT"),
      content: sectionContent || "No major procedures performed during this admission.",
      usage: result.usage
    };
  }

  /**
   * Generate HOSPITAL COURSE section
   */
  async generateHospitalCourse(extractedData, subjectiveContent) {
    const treatment = extractedData.treatment || {};
    const clinicalNotes = extractedData.clinical_notes || [];
    const meta = extractedData.meta || {};
    const prompt = `Generate the HOSPITAL COURSE section of a discharge chart note.

TREATMENT DATA:
${JSON.stringify(treatment, null, 2)}

CLINICAL NOTES:
${JSON.stringify(clinicalNotes.slice(0, 5), null, 2)}

ADMISSION INFO:
${JSON.stringify(meta, null, 2)}

CHIEF COMPLAINT (for context):
${subjectiveContent}

Write a narrative of the patient's hospital course from admission to discharge.
Include:
- Initial presentation and condition on admission
- Treatment approach (conservative, surgical, etc.)
- Response to treatment and clinical progression
- Any complications or interventions
- Condition at discharge

Format:
THOUGHT: [Your reasoning]
HOSPITAL COURSE SECTION:
[The actual content - narrative 3-5 sentences]`;

    const result = await this.gemmaClient.execute(prompt, {
      temperature: 0.4,
      maxTokens: 800
    });

    const content = result.success ? result.content : "";
    const sectionContent = this.cleanSectionContent(this.extractAfter(content, "HOSPITAL COURSE SECTION"));

    console.log("  📝 Hospital Course section generated:", {
      length: sectionContent?.length || 0,
      preview: sectionContent?.substring(0, 100) || "N/A"
    });

    return {
      thought: this.extractSection(content, "THOUGHT"),
      content: sectionContent || this.generateFallbackHospitalCourse(extractedData),
      usage: result.usage
    };
  }

  /**
   * Generate PENDING INVESTIGATIONS section
   */
  async generatePendingInvestigations(extractedData) {
    const clinicalNotes = extractedData.clinical_notes || [];
    const investigations = extractedData.investigations || [];
    const pendingItems = [];

    // Extract pending items from clinical notes
    clinicalNotes.forEach(note => {
      if (note.pending_items && Array.isArray(note.pending_items)) {
        pendingItems.push(...note.pending_items);
      }
    });

    const prompt = `Generate the PENDING INVESTIGATIONS section of a discharge chart note.

PENDING ITEMS FROM CLINICAL NOTES:
${JSON.stringify(pendingItems.slice(0, 20), null, 2)}

INVESTIGATIONS:
${JSON.stringify(investigations, null, 2)}

List all pending labs, imaging, procedures, or consults at the time of discharge.
Include what was ordered and the reason if known.

Format:
THOUGHT: [Your reasoning]
PENDING INVESTIGATIONS SECTION:
[The actual content - list pending items]`;

    const result = await this.gemmaClient.execute(prompt, {
      temperature: 0.3,
      maxTokens: 600
    });

    const content = result.success ? result.content : "";
    const sectionContent = this.cleanSectionContent(this.extractAfter(content, "PENDING INVESTIGATIONS SECTION"));

    console.log("  📝 Pending Investigations section generated:", {
      length: sectionContent?.length || 0,
      preview: sectionContent?.substring(0, 100) || "N/A"
    });

    return {
      thought: this.extractSection(content, "THOUGHT"),
      content: sectionContent || "No pending investigations documented at discharge.",
      usage: result.usage
    };
  }

  /**
   * Generate NURSING CARE NEEDS section
   */
  async generateNursingCare(extractedData) {
    const nursingNeeds = extractedData.nursing_needs || [];
    const risks = extractedData.risk_scores || {};
    const functional = extractedData.functional_status || {};
    const prompt = `Generate the NURSING CARE NEEDS section of a discharge chart note.

NURSING NEEDS:
${JSON.stringify(nursingNeeds, null, 2)}

RISK SCORES:
${JSON.stringify(risks, null, 2)}

FUNCTIONAL STATUS:
${JSON.stringify(functional, null, 2)}

List all nursing care needs and special precautions required.
Include fall precautions, pressure ulcer prevention, assistance with ADLs, etc.

Format:
THOUGHT: [Your reasoning]
NURSING CARE SECTION:
[The actual content - list nursing needs]`;

    const result = await this.gemmaClient.execute(prompt, {
      temperature: 0.3,
      maxTokens: 500
    });

    const content = result.success ? result.content : "";
    const sectionContent = this.cleanSectionContent(this.extractAfter(content, "NURSING CARE SECTION"));

    console.log("  📝 Nursing Care section generated:", {
      length: sectionContent?.length || 0,
      preview: sectionContent?.substring(0, 100) || "N/A"
    });

    return {
      thought: this.extractSection(content, "THOUGHT"),
      content: sectionContent || this.generateFallbackNursingCare(extractedData),
      usage: result.usage
    };
  }

  /**
   * Generate RISK FLAGS section
   */
  async generateRiskFlags(extractedData) {
    const risks = extractedData.risk_scores || {};
    const clinicalNotes = extractedData.clinical_notes || [];
    const riskFlags = [];

    // Extract risk flags from clinical notes
    clinicalNotes.forEach(note => {
      if (note.risk_flags && Array.isArray(note.risk_flags)) {
        riskFlags.push(...note.risk_flags);
      }
    });

    const prompt = `Generate the RISK FLAGS section of a discharge chart note.

RISK SCORES:
${JSON.stringify(risks, null, 2)}

RISK FLAGS FROM NOTES:
${JSON.stringify(riskFlags, null, 2)}

List all risk flags that require attention.
Include high fall risk, high pressure ulcer risk, bleeding risk, etc.

Format:
THOUGHT: [Your reasoning]
RISK FLAGS SECTION:
[The actual content - list significant risks]`;

    const result = await this.gemmaClient.execute(prompt, {
      temperature: 0.2,
      maxTokens: 400
    });

    const content = result.success ? result.content : "";
    const sectionContent = this.cleanSectionContent(this.extractAfter(content, "RISK FLAGS SECTION"));

    console.log("  📝 Risk Flags section generated:", {
      length: sectionContent?.length || 0,
      preview: sectionContent?.substring(0, 100) || "N/A"
    });

    return {
      thought: this.extractSection(content, "THOUGHT"),
      content: sectionContent || this.generateFallbackRiskFlags(extractedData),
      usage: result.usage
    };
  }

  /**
   * STEP 14: Review and refine
   */
  async reviewAndRefine(sections) {
    const prompt = `Review the following chart note for quality, completeness, and clinical accuracy.

ALLERGIES:
${sections.allergies || 'N/A'}

CHIEF COMPLAINT & HISTORY:
${sections.subjective}

COMORBIDITIES:
${sections.comorbidities || 'N/A'}

PHYSICAL EXAMINATION:
${sections.objective}

PROCEDURES:
${sections.procedures || 'N/A'}

HOSPITAL COURSE:
${sections.hospitalCourse || 'N/A'}

ASSESSMENT:
${sections.assessment}

PENDING INVESTIGATIONS:
${sections.pending || 'N/A'}

PLAN:
${sections.plan}

NURSING CARE:
${sections.nursing || 'N/A'}

RISK FLAGS:
${sections.riskFlags || 'N/A'}

Validation: ${sections.validationSummary}

Review each section and provide:
1. Quality assessment (Excellent/Good/Fair/Poor)
2. Missing elements (if any)
3. Suggestions for improvement (if needed)

IMPORTANT: Return the review ONLY. Do NOT include refined versions in your response.
Format your response as:

REVIEW:
ALLERGIES: [Quality rating and brief feedback]
CHIEF COMPLAINT: [Quality rating and brief feedback]
COMORBIDITIES: [Quality rating and brief feedback]
PHYSICAL EXAM: [Quality rating and brief feedback]
PROCEDURES: [Quality rating and brief feedback]
HOSPITAL COURSE: [Quality rating and brief feedback]
ASSESSMENT: [Quality rating and brief feedback]
PENDING: [Quality rating and brief feedback]
PLAN: [Quality rating and brief feedback]
NURSING: [Quality rating and brief feedback]
RISK FLAGS: [Quality rating and brief feedback]`;

    const result = await this.gemmaClient.execute(prompt, {
      temperature: 0.3,
      maxTokens: 1500
    });

    const content = result.success ? result.content : "";

    // Don't do refinements - just return the review
    const refined = {
      allergies: null,
      subjective: null,
      comorbidities: null,
      objective: null,
      procedures: null,
      hospitalCourse: null,
      assessment: null,
      pending: null,
      plan: null,
      nursing: null,
      riskFlags: null
    };

    console.log("  📝 Review completed:", {
      reviewLength: content.length,
      preview: content.substring(0, 200)
    });

    return {
      review: content,
      refined: refined,
      usage: result.usage
    };
  }

  /**
   * Compile final chart note
   */
  compileChartNote(sections) {
    const patient = sections.extractedData.patient || {};
    const admission = sections.extractedData.admission || {};
    const diagnosis = sections.extractedData.diagnosis || {};

    // Ensure sections have content, provide fallback if empty
    const allergies = sections.allergies?.trim() || "No Known Allergies (NKDA)";
    const subjective = sections.subjective?.trim() || this.generateFallbackSubjective(sections.extractedData);
    const comorbidities = sections.comorbidities?.trim() || this.generateFallbackComorbidities(sections.extractedData);
    const objective = sections.objective?.trim() || this.generateFallbackObjective(sections.extractedData);
    const procedures = sections.procedures?.trim() || "No major procedures performed during this admission.";
    const hospitalCourse = sections.hospitalCourse?.trim() || this.generateFallbackHospitalCourse(sections.extractedData);
    const assessment = sections.assessment?.trim() || this.generateFallbackAssessment(sections.extractedData);
    const pending = sections.pending?.trim() || "No pending investigations documented at discharge.";
    const plan = sections.plan?.trim() || this.generateFallbackPlan(sections.extractedData);
    const nursing = sections.nursing?.trim() || this.generateFallbackNursingCare(sections.extractedData);
    const riskFlags = sections.riskFlags?.trim() || this.generateFallbackRiskFlags(sections.extractedData);

    console.log("  📋 Final chart note compiled:", {
      totalLength: allergies.length + subjective.length + comorbidities.length + objective.length +
                   procedures.length + hospitalCourse.length + assessment.length + pending.length +
                   plan.length + nursing.length + riskFlags.length
    });

    const finalNote = `DISCHARGE SUMMARY CHART NOTE

Patient: ${patient.name || 'Not documented'} | MRN: ${patient.mrn || 'N/A'} | Age: ${patient.age || 'N/A'} ${patient.gender || ''}
Admission: ${admission.admission_date || 'Not documented'} | Discharge: ${admission.discharge_date || 'Not documented'}

ALLERGIES & ADVERSE REACTIONS
${allergies.trim()}

CHIEF COMPLAINT & HISTORY
${subjective.trim()}

COMORBIDITIES
${comorbidities.trim()}

PHYSICAL EXAMINATION
${objective.trim()}

PROCEDURES & INTERVENTIONS
${procedures.trim()}

HOSPITAL COURSE
${hospitalCourse.trim()}

ASSESSMENT
${assessment.trim()}

PENDING INVESTIGATIONS
${pending.trim()}

PLAN
${plan.trim()}

NURSING CARE NEEDS
${nursing.trim()}

RISK FLAGS
${riskFlags.trim()}

_________________________
Generated: ${new Date().toLocaleString()}
Note: This chart note was automatically generated from the discharge summary document. Clinician review and signature required.
Validation Summary: ${sections.validationSummary}

***** END OF RECORD *****`;

    return finalNote;
  }

  /**
   * Fallback generators for when LLM doesn't return content
   */
  generateFallbackSubjective(data) {
    const diagnosis = data.diagnosis?.principal || "Not documented";
    const patient = data.patient || {};
    return `Patient is a ${patient.age || 'XX'}-year-old ${patient.gender || 'individual'} admitted with ${diagnosis}.`;
  }

  generateFallbackObjective(data) {
    const vitals = data.vitals || data.latest || {};
    const risks = data.risk_scores || {};
    let content = "Vital Signs: ";
    if (vitals.bp) content += `BP ${vitals.bp.systolic || 'N/A'}/${vitals.bp.diastolic || 'N/A'} mmHg `;
    if (vitals.pulse) content += `Pulse ${vitals.pulse.value || vitals.pulse || 'N/A'} bpm `;
    if (vitals.spo2) content += `SpO2 ${vitals.spo2.value || vitals.spo2 || 'N/A'}%`;
    if (risks.fall_risk) content += `\nFall Risk: ${risks.fall_risk.score || 'N/A'} (${risks.fall_risk.level || 'N/A'})`;
    return content || "Clinical findings not available.";
  }

  generateFallbackAssessment(data) {
    const diagnosis = data.diagnosis?.principal || "Not documented";
    const secondary = data.diagnosis?.secondary?.length > 0
      ? data.diagnosis.secondary.slice(0, 3).join(", ")
      : "None documented";
    return `Principal Diagnosis: ${diagnosis}\nSecondary Diagnoses: ${secondary}`;
  }

  generateFallbackPlan(data) {
    const meds = data.medications || [];
    let content = "Discharge Medications:\n";
    if (meds.length > 0) {
      meds.slice(0, 5).forEach(med => {
        content += `- ${med.name || med} ${med.dose || ''} ${med.frequency || ''} ${med.route || ''}\n`;
      });
    } else {
      content += "No medications documented.\n";
    }
    return content;
  }

  generateFallbackComorbidities(data) {
    const comorbidities = data.diagnosis?.comorbidities || [];
    const secondary = data.diagnosis?.secondary || [];
    if (comorbidities.length > 0) {
      return `• ${comorbidities.join("\n• ")}`;
    } else if (secondary.length > 0) {
      return `• ${secondary.slice(0, 5).join("\n• ")}`;
    }
    return "No significant comorbidities documented.";
  }

  generateFallbackHospitalCourse(data) {
    const diagnosis = data.diagnosis?.principal || "the presenting condition";
    const treatment = data.treatment?.current_approach || "standard medical management";
    return `Patient was admitted with ${diagnosis} and managed with ${treatment}. ` +
           `Clinical response was monitored throughout the hospital stay. ` +
           `Patient was stabilized for discharge.`;
  }

  generateFallbackNursingCare(data) {
    const nursingNeeds = data.nursing_needs || [];
    const risks = data.risk_scores || {};
    let content = "";
    if (nursingNeeds.length > 0) {
      content += `• ${nursingNeeds.join("\n• ")}`;
    }
    if (risks.fall_risk?.level === "High") {
      content += `${content ? "\n" : ""}• Fall precautions required`;
    }
    if (risks.pressure_ulcer_risk?.level === "High") {
      content += `${content ? "\n" : ""}• Pressure ulcer prevention measures`;
    }
    return content || "Standard nursing care provided.";
  }

  generateFallbackRiskFlags(data) {
    const risks = data.risk_scores || {};
    let flags = [];
    if (risks.fall_risk?.level === "High") {
      flags.push(`High Fall Risk (Score: ${risks.fall_risk.score})`);
    }
    if (risks.pressure_ulcer_risk?.level === "High") {
      flags.push(`High Pressure Ulcer Risk (Score: ${risks.pressure_ulcer_risk.score})`);
    }
    return flags.length > 0 ? flags.join("\n• ") : "No significant risk flags identified.";
  }

  /**
   * Helper: Extract a section from formatted response
   */
  extractSection(content, sectionName) {
    const regex = new RegExp(sectionName + ":?\\s*([\\s\\S]*?)(?=\\n[A-Z]|$)", "i");
    const match = content.match(regex);
    return match ? match[1].trim() : "";
  }

  /**
   * Helper: Extract content after a marker
   */
  extractAfter(content, marker) {
    const index = content.indexOf(marker);
    if (index === -1) {
      // Marker not found - try to extract meaningful content
      console.log(`    ⚠️ Marker "${marker}" not found, attempting fallback extraction`);
      // Return content after THOUGHT section if it exists
      const thoughtIndex = content.indexOf("THOUGHT:");
      if (thoughtIndex !== -1) {
        const afterThought = content.substring(thoughtIndex + 8).trim();
        // Find the next line after THOUGHT content
        const lines = afterThought.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].trim() && !lines[i].startsWith('THOUGHT')) {
            // Found actual content
            return this.cleanSectionContent(lines.slice(i).join('\n'));
          }
        }
      }
      return this.cleanSectionContent(content);
    }
    let extracted = content.substring(index + marker.length).trim();
    if (!extracted) {
      console.log(`    ⚠️ Empty content after marker "${marker}"`);
      return this.cleanSectionContent(content); // Fallback to full content
    }
    // Remove any remaining section markers that might appear after
    const lines = extracted.split('\n');
    const cleaned = [];
    for (const line of lines) {
      // Stop if we hit another major section marker
      if (line.match(/^(OBJECTIVE|ASSESSMENT|PLAN|REVIEW):/i)) break;
      cleaned.push(line);
    }
    return this.cleanSectionContent(cleaned.join('\n').trim());
  }

  /**
   * Clean section content - remove leading artifacts like colons, extra whitespace
   */
  cleanSectionContent(content) {
    if (!content) return '';
    let cleaned = content;
    // Remove leading colon or artifacts on first line
    const lines = cleaned.split('\n');
    if (lines.length > 0 && lines[0].trim() === ':') {
      lines.shift(); // Remove the stray colon line
    }
    // Also remove leading colon if content starts with it
    cleaned = lines.join('\n').replace(/^:\s*/, '').trim();
    return cleaned;
  }

  /**
   * Helper: Extract refinement content
   */
  extractRefinement(content, prefix) {
    const regex = new RegExp(prefix + "\\s*([\\s\\S]*?)(?=\\n[A-Z]:|$)", "i");
    const match = content.match(regex);
    const extracted = match ? match[1].trim() : "";
    return extracted === "OK" ? null : extracted;
  }

  /**
   * Validate extracted data quality before chartnote generation
   */
  validateExtractedData(extractedData) {
    const issues = [];
    const warnings = [];
    const score = { total: 0, max: 0 };

    // Check critical fields
    const checks = [
      {
        path: ["patient", "name"],
        name: "Patient Name",
        critical: true,
        found: !!this.getNestedValue(extractedData, ["patient", "name"])
      },
      {
        path: ["patient", "age"],
        name: "Patient Age",
        critical: true,
        found: !!this.getNestedValue(extractedData, ["patient", "age"])
      },
      {
        path: ["diagnosis", "principal"],
        name: "Principal Diagnosis",
        critical: true,
        found: !!this.getNestedValue(extractedData, ["diagnosis", "principal"])
      },
      {
        path: ["vitals"],
        name: "Vital Signs",
        critical: false,
        found: !!(extractedData?.vitals && Object.keys(extractedData.vitals).length > 0)
      },
      {
        path: ["medications"],
        name: "Medications",
        critical: false,
        found: !!(extractedData?.medications && extractedData.medications.length > 0)
      },
      {
        path: ["risk_scores"],
        name: "Risk Scores",
        critical: false,
        found: !!(extractedData?.risk_scores && Object.keys(extractedData.risk_scores).length > 0)
      },
      {
        path: ["lab_results"],
        name: "Lab Results",
        critical: false,
        found: !!(extractedData?.lab_results && extractedData.lab_results.length > 0)
      },
      {
        path: ["functional_status"],
        name: "Functional Status",
        critical: false,
        found: !!extractedData?.functional_status
      },
      {
        path: ["clinical_notes"],
        name: "Clinical Notes",
        critical: false,
        found: !!(extractedData?.clinical_notes && extractedData.clinical_notes.length > 0)
      }
    ];

    checks.forEach(check => {
      score.max += check.critical ? 20 : 10;
      if (check.found) {
        score.total += check.critical ? 20 : 10;
      } else if (check.critical) {
        issues.push(`Missing: ${check.name}`);
      } else {
        warnings.push(`Not found: ${check.name}`);
      }
    });

    const qualityPercentage = Math.round((score.total / score.max) * 100);
    let qualityLevel = "Poor";
    if (qualityPercentage >= 80) qualityLevel = "Good";
    else if (qualityPercentage >= 60) qualityLevel = "Fair";

    return {
      quality: qualityLevel,
      percentage: qualityPercentage,
      score: score.total,
      maxScore: score.max,
      issues,
      warnings,
      hasCriticalIssues: issues.length > 0
    };
  }

  /**
   * Get nested value from object
   */
  getNestedValue(obj, path) {
    let current = obj;
    for (const key of path) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return null;
      }
    }
    return current;
  }
}

module.exports = ChartNoteAgent;
