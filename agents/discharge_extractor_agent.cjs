/**
 * Discharge Extractor Agent (Option B - Thinking/ReAct)
 * Multi-step extraction with validation for discharge summaries
 */

const PDFReaderTool = require("../tools/pdf/pdf_reader.tool.cjs");
const GemmaClientTool = require("../tools/llm/gemma_client.tool.cjs");
const PromptBuilderTool = require("../tools/llm/prompt_builder.tool.cjs");
const ProvenanceBuilderTool = require("../tools/clinical/provenance_builder.tool.cjs");

// Skills
const DocumentAnalyzerSkill = require("../skills/extraction/document_analyzer.skill.cjs");
const DemographicsExtractorSkill = require("../skills/extraction/demographics_extractor.skill.cjs");
const RiskScoresExtractorSkill = require("../skills/extraction/risk_scores_extractor.skill.cjs");
const VitalsExtractorSkill = require("../skills/extraction/vitals_extractor.skill.cjs");
const FunctionalStatusExtractorSkill = require("../skills/extraction/functional_status_extractor.skill.cjs");
const ClinicalDataExtractorSkill = require("../skills/extraction/clinical_data_extractor.skill.cjs");
const PendingItemsExtractorSkill = require("../skills/extraction/pending_items_extractor.skill.cjs");
const CrossValidatorSkill = require("../skills/validation/cross_validator.skill.cjs");

class DischargeExtractorAgent {
  constructor(config = {}) {
    this.name = "Discharge Summary Extractor";
    this.version = "2.0.0";
    this.type = "thinking_agent";

    // Initialize tools
    this.pdfReader = new PDFReaderTool(config);
    this.gemmaClient = new GemmaClientTool(config.gemma || {});
    this.promptBuilder = new PromptBuilderTool(config);
    this.provenanceBuilder = new ProvenanceBuilderTool(config);

    // Initialize skills
    this.skills = [
      new DocumentAnalyzerSkill(),
      new DemographicsExtractorSkill(),
      new RiskScoresExtractorSkill(),
      new VitalsExtractorSkill(),
      new FunctionalStatusExtractorSkill(),
      new ClinicalDataExtractorSkill(),
      new PendingItemsExtractorSkill(),
      new CrossValidatorSkill()
    ];

    this.config = {
      maxRetries: 2,
      timeoutPerStep: 180000,
      totalTimeout: 600000,
      requireAllSteps: false,
      logSteps: true,
      saveIntermediates: true,
      ...config
    };
  }

  /**
   * Process a PDF document through the thinking agent pipeline
   * @param {string} pdfPath - Path to the PDF file
   * @param {object} options - Processing options
   * @param {function} options.onProgress - Callback for progress updates {step, current, total, status, data}
   * @returns {Promise<object>}
   */
  async process(pdfPath, options = {}) {
    const startTime = Date.now();
    const pdfName = options.pdfName || pdfPath.split("/").pop();
    const onProgress = options.onProgress || null;

    try {
      console.log(`\n📄 Processing: ${pdfName}`);
      console.log(`📋 Method: Option B (Thinking/ReAct-Style Extraction)`);

      // Emit starting event
      if (onProgress) {
        onProgress({ type: 'start', pdfName, totalSteps: this.skills.length });
      }

      // Step 1: Read PDF
      const pdfResult = await this.pdfReader.execute(pdfPath, 8000);
      if (!pdfResult.success) {
        throw new Error(`Failed to read PDF: ${pdfResult.error}`);
      }

      const pdfText = pdfResult.text;
      console.log(`   📖 PDF read: ${pdfText.length} chars, ${pdfResult.pages} pages`);

      // Emit PDF read event
      if (onProgress) {
        onProgress({
          type: 'step',
          step: 'pdf_read',
          stepNumber: 0,
          totalSteps: this.skills.length,
          status: 'complete',
          data: { chars: pdfText.length, pages: pdfResult.pages }
        });
      }

      // Execute each skill in sequence
      const steps = [];
      let totalTokens = 0;
      let stepNumber = 0;

      for (const skill of this.skills) {
        stepNumber++;
        const stepName = skill.name;
        console.log(`\n   🔄 ${stepName}...`);

        // Emit step start event
        if (onProgress) {
          onProgress({
            type: 'step',
            step: stepName,
            stepNumber,
            totalSteps: this.skills.length,
            status: 'running'
          });
        }

        const stepResult = await skill.execute({
          pdfText: pdfText,
          gemmaClient: this.gemmaClient,
          promptBuilder: this.promptBuilder,
          provenanceBuilder: this.provenanceBuilder,
          previousSteps: steps
        });

        steps.push(stepResult);

        if (stepResult.usage) {
          totalTokens += stepResult.usage.totalTokens || 0;
        }

        if (stepResult.success) {
          console.log(`      ✅ Completed (${stepResult.usage?.totalTokens || 0} tokens)`);
          if (stepResult.validation?.issues?.length > 0) {
            console.log(`      ⚠️  Validation issues: ${stepResult.validation.issues.join(", ")}`);
          }

          // Emit step complete event
          if (onProgress) {
            onProgress({
              type: 'step',
              step: stepName,
              stepNumber,
              totalSteps: this.skills.length,
              status: 'complete',
              data: {
                tokens: stepResult.usage?.totalTokens || 0,
                latency: stepResult.usage?.latency || 0,
                dataKeys: stepResult.data ? Object.keys(stepResult.data) : [],
                validationIssues: stepResult.validation?.issues?.length || 0
              }
            });
          }
        } else {
          console.log(`      ❌ Failed: ${stepResult.error}`);
          if (!this.config.requireAllSteps) {
            console.log(`      ⚠️  Continuing despite failure...`);
          }

          // Emit step error event
          if (onProgress) {
            onProgress({
              type: 'step',
              step: stepName,
              stepNumber,
              totalSteps: this.skills.length,
              status: 'error',
              error: stepResult.error
            });
          }
        }
      }

      // Assemble final result
      const finalResult = this.assembleFinalResult(steps, pdfName);

      const endTime = Date.now();

      // Emit complete event
      if (onProgress) {
        onProgress({
          type: 'complete',
          pdfName,
          latency: endTime - startTime,
          tokensUsed: totalTokens,
          confidence: finalResult.validation.confidence_level
        });
      }

      return {
        success: true,
        agent: this.name,
        pdfName: pdfName,
        pdfPath: pdfPath,
        latency: endTime - startTime,
        tokensUsed: totalTokens,
        steps: steps.map(s => ({
          step: s.step,
          success: s.success,
          tokens: s.usage?.totalTokens || 0,
          latency: s.usage?.latency || 0,
          dataKeys: s.data ? Object.keys(s.data) : [],
          hasValidation: !!s.validation,
          validationIssues: s.validation?.issues?.length || 0,
          error: s.error || null
        })),
        detailedSteps: steps.map(s => ({
          step: s.step,
          success: s.success,
          data: s.data || null,
          validation: s.validation || null,
          error: s.error || null,
          tokens: s.usage?.totalTokens || 0
        })),
        data: finalResult.data,
        validation: finalResult.validation
      };

    } catch (error) {
      return {
        success: false,
        agent: this.name,
        error: error.message,
        pdfName: pdfName
      };
    }
  }

  /**
   * Assemble final validated result from all steps
   */
  assembleFinalResult(steps, pdfName) {
    // Collect all data from successful steps
    const data = {
      meta: {
        pdf_file: pdfName,
        processed_at: new Date().toISOString(),
        agent_version: this.version
      },
      patient: {},
      vitals: {},
      risk_scores: {},
      functional_status: {},
      diagnosis: {},
      allergies: [],
      medications: [],
      investigations: [],
      nursing_needs: [],
      clinical_notes: [],
      treatment: {
        current_approach: "",
        management_items: [],
        procedures: [],
        response: "",
        complications: []
      },
      provenance: {}
    };

    const validation = {
      confidence_level: "high",
      inconsistencies_found: [],
      missing_critical_fields: [],
      data_quality_notes: ""
    };

    // Merge data from all successful steps
    steps.forEach(step => {
      if (step.success && step.data) {
        const stepData = step.data;

        // Smart merge based on data structure
        // If stepData has known top-level patient fields, merge into patient object
        if (stepData.name || stepData.mrn || stepData.age || stepData.gender) {
          Object.assign(data.patient, {
            name: stepData.name || data.patient.name,
            mrn: stepData.mrn || data.patient.mrn,
            age: stepData.age || data.patient.age,
            gender: stepData.gender || data.patient.gender,
            admission_date: stepData.admission_date || data.patient.admission_date,
            discharge_date: stepData.discharge_date || data.patient.discharge_date,
            los_days: stepData.los_days || data.patient.los_days
          });
        }

        // Merge vitals data
        if (stepData.bp || stepData.pulse || stepData.spo2 || stepData.temperature) {
          Object.assign(data.vitals, stepData);
        }

        // Merge risk scores
        if (stepData.fall_risk || stepData.dvt_risk || stepData.ews_score || stepData.gcs) {
          Object.assign(data.risk_scores, stepData);
        }

        // Merge functional status
        if (stepData.functional_status || stepData.overall_assistance_needs) {
          Object.assign(data.functional_status, stepData);
        }

        // Merge diagnosis
        if (stepData.diagnosis) {
          Object.assign(data.diagnosis, stepData.diagnosis);
        }

        // Merge arrays
        if (Array.isArray(stepData.allergies)) {
          data.allergies = [...data.allergies, ...stepData.allergies];
        }
        if (Array.isArray(stepData.medications)) {
          data.medications = [...data.medications, ...stepData.medications];
        }
        if (Array.isArray(stepData.investigations)) {
          data.investigations = [...data.investigations, ...stepData.investigations];
        }
        if (Array.isArray(stepData.nursing_needs)) {
          data.nursing_needs = [...data.nursing_needs, ...stepData.nursing_needs];
        }
        if (Array.isArray(stepData.clinical_notes)) {
          data.clinical_notes = [...data.clinical_notes, ...stepData.clinical_notes];
        }
        if (stepData.treatment) {
          data.treatment = {
            current_approach: stepData.treatment.current_approach || data.treatment.current_approach,
            management_items: [
              ...data.treatment.management_items,
              ...(Array.isArray(stepData.treatment.management_items) ? stepData.treatment.management_items : [])
            ],
            procedures: [
              ...data.treatment.procedures,
              ...(Array.isArray(stepData.treatment.procedures) ? stepData.treatment.procedures : [])
            ],
            response: stepData.treatment.response || data.treatment.response,
            complications: [
              ...data.treatment.complications,
              ...(Array.isArray(stepData.treatment.complications) ? stepData.treatment.complications : [])
            ]
          };
        }
        if (stepData.provenance && typeof stepData.provenance === "object") {
          data.provenance = {
            ...data.provenance,
            ...stepData.provenance,
          };
        }

        // Merge pending_items (new LLM-based extraction)
        if (stepData.pending_items) {
          data.pending_items = stepData.pending_items;
        }

        // Any remaining fields at top level
        Object.keys(stepData).forEach(key => {
          if (!['name', 'mrn', 'age', 'gender', 'admission_date', 'discharge_date', 'los_days',
               'bp', 'pulse', 'spo2', 'temperature', 'resp_rate', 'pain_score', 'grbs', 'abnormal_flags',
               'fall_risk', 'dvt_risk', 'pressure_ulcer_risk', 'aspiration_risk', 'ews_score', 'gcs',
               'functional_status', 'overall_assistance_needs', 'mobility_notes',
               'diagnosis', 'allergies', 'medications', 'investigations', 'nursing_needs', 'clinical_notes', 'treatment', 'provenance',
               'pending_items',
               'document_type', 'sections_identified', 'confidence', 'extraction_strategy',
               'confidence_notes', 'sources', 'validation_notes'].includes(key)) {
            data[key] = stepData[key];
          }
        });

        // Collect validation information
        if (step.validation) {
          if (step.validation.inconsistencies) {
            validation.inconsistencies_found.push(...step.validation.inconsistencies);
          }
          if (step.validation.missing) {
            validation.missing_critical_fields.push(...step.validation.missing);
          }
        }

        // Collect self-validation info
        if (step.selfValidation) {
          if (step.selfValidation.inconsistencies) {
            validation.inconsistencies_found.push(...step.selfValidation.inconsistencies);
          }
          if (step.selfValidation.missing) {
            validation.missing_critical_fields.push(...step.selfValidation.missing);
          }
        }
      }
    });

    // Clean up validation (remove duplicates)
    validation.inconsistencies_found = [...new Set(validation.inconsistencies_found)];
    validation.missing_critical_fields = [...new Set(validation.missing_critical_fields)];

    // Set confidence level
    if (validation.inconsistencies_found.length > 2) {
      validation.confidence_level = "low";
    } else if (validation.inconsistencies_found.length > 0) {
      validation.confidence_level = "medium";
    }

    // Generate data quality notes
    if (validation.confidence_level === "high") {
      validation.data_quality_notes = "All data successfully extracted and validated.";
    } else {
      validation.data_quality_notes = `Found ${validation.inconsistencies_found.length} inconsistencies. Review recommended.`;
    }

    return { data, validation };
  }

  /**
   * Get agent status
   */
  getStatus() {
    return {
      name: this.name,
      version: this.version,
      type: this.type,
      skillsCount: this.skills.length,
      toolsCount: 4, // pdf_reader, gemma_client, prompt_builder, provenance_builder
      config: this.config
    };
  }
}

module.exports = DischargeExtractorAgent;
