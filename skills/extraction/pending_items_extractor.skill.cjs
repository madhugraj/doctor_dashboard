/**
 * Pending Items Extractor Skill (Pure LLM-Based)
 *
 * This skill uses ONLY Gemma LLM to extract pending items from discharge summaries.
 * No regex patterns, no heuristics - pure AI extraction with structured prompts.
 */

class PendingItemsExtractorSkill {
  constructor(config = {}) {
    this.name = "Pending Items Extractor (LLM-Only)";
    this.version = "2.0.0";
    this.config = config;
  }

  /**
   * The main prompt for extracting pending items
   */
  getPendingItemsPrompt() {
    return `You are a clinical data specialist extracting PENDING ITEMS from a hospital discharge summary.

CRITICAL RULES:
1. Use ONLY information explicitly stated in the document
2. Do NOT infer or assume pending items - they must be explicitly mentioned
3. Categorize each item correctly (labs, radiology, medications, follow-up, discharge)
4. Extract the exact wording and any associated dates/times
5. Identify the priority level based on clinical context

PDF CONTENT:
{{pdfText}}

Think through this step-by-step:

STEP 1: Identify sections that may contain pending items
- Look for sections like: "Residents Notes", "Doctor's Handover", "Nursing Endorsement", "Investigations", "Pending Reports"
- Note any headers or subsections

STEP 2: Extract PENDING LABS
- Look for phrases like: "SEND BLOOD FOR", "Lab pending", "Awaiting reports", "Investigations ordered"
- Extract: test name, expected date/time, reason if stated
- Example: {"test": "Lipid Panel", "expected_date": "March 21, 2026", "reason": "Cardiac risk assessment"}

STEP 3: Extract PENDING RADIOLOGY/IMAGING
- Look for: CT scans, MRI, X-rays, Ultrasounds, Echocardiograms that are SCHEDULED or PENDING
- Keywords: "Scheduled", "Pending", "Awaiting", "Planned", followed by imaging modality
- Extract: imaging type, body part, scheduled date, reason if stated
- Example: {"type": "CT Chest", "scheduled_date": "March 21, 2026", "reason": "Pulmonary nodule surveillance"}

STEP 4: Extract PENDING FOLLOW-UPS
- Look for: "Follow-up", "Review", "Appointment", "Outpatient visit"
- Extract: department/specialty, provider name, date, time, purpose
- Example: {"department": "Cardiology", "provider": "Dr. Smith", "date": "April 15, 2026", "time": "10:00 AM", "purpose": "Post-MI follow-up"}

STEP 5: Extract MEDICATION RECONCILIATION STATUS
- Look for: medication lists, allergy documentation, interaction notes
- Determine: Are medications reconciled? Are there allergies? Any interaction concerns?
- Categorize as: "complete" or "attention_needed"

STEP 6: Extract DISCHARGE PENDING ITEMS
- Look for: pending procedures, pending consultations, incomplete documentation
- These are items that need completion before discharge

STEP 7: Assess PRIORITY for each item
- HIGH: Critical labs, imaging for acute conditions, medication interactions
- MEDIUM: Routine follow-ups, non-urgent tests
- LOW: Optional monitoring, general wellness items

Return ONLY JSON in this exact format:
{
  "pending_labs": [
    {
      "test_name": "",
      "expected_date": "",
      "reason": "",
      "priority": "high/medium/low",
      "source_section": "",
      "source_excerpt": ""
    }
  ],
  "pending_radiology": [
    {
      "type": "",
      "body_part": "",
      "scheduled_date": "",
      "reason": "",
      "priority": "high/medium/low",
      "source_section": "",
      "source_excerpt": ""
    }
  ],
  "pending_followups": [
    {
      "department": "",
      "provider": "",
      "date": "",
      "time": "",
      "purpose": "",
      "priority": "medium",
      "source_section": "",
      "source_excerpt": ""
    }
  ],
  "medication_reconciliation": {
    "status": "complete/attention_needed",
    "medication_count": 0,
    "allergy_count": 0,
    "concerns": "",
    "source_section": "",
    "source_excerpt": ""
  },
  "pending_discharge_items": [
    {
      "item": "",
      "reason": "",
      "priority": "high/medium/low",
      "source_section": "",
      "source_excerpt": ""
    }
  ],
  "summary": {
    "total_pending": 0,
    "needs_attention": 0,
    "scheduled": 0,
    "complete": 0
  }
}

Remember:
- Return EMPTY arrays if no pending items of that type are found
- Do NOT invent items that aren't explicitly mentioned
- source_excerpt should be the exact text from the PDF that supports this item
- Leave optional fields empty (not null) if not found`;
  }

  /**
   * Execute the pending items extraction
   */
  async execute(context) {
    const { pdfText, gemmaClient, promptBuilder } = context;

    console.log("\n🔍 Pending Items Extractor (LLM-Only) starting...");

    try {
      // Build the prompt
      const prompt = promptBuilder.build("pending_items_extractor", { pdfText });

      // Execute with Gemma
      const result = await gemmaClient.execute(prompt, {
        temperature: 0.1,  // Low temperature for consistent extraction
        maxTokens: 3000
      });

      if (!result.success) {
        console.error("❌ Gemma extraction failed:", result.error);
        return {
          success: false,
          step: "pending_items_extractor",
          error: result.error,
          data: this.getEmptyResult()
        };
      }

      // Parse the JSON response
      const extractedData = this.parseResponse(result.content);

      console.log("✅ Pending items extracted:", {
        labs: extractedData.pending_labs.length,
        radiology: extractedData.pending_radiology.length,
        followups: extractedData.pending_followups.length,
        total: extractedData.summary.total_pending
      });

      return {
        success: true,
        step: "pending_items_extractor",
        data: extractedData,
        usage: result.usage
      };

    } catch (error) {
      console.error("❌ Pending items extraction error:", error.message);
      return {
        success: false,
        step: "pending_items_extractor",
        error: error.message,
        data: this.getEmptyResult()
      };
    }
  }

  /**
   * Parse the LLM response, handling common JSON issues
   */
  parseResponse(content) {
    const normalized = String(content || "")
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    // Try to parse directly first
    try {
      return JSON.parse(normalized);
    } catch (e) {
      // Try to find JSON block
      const firstBrace = normalized.indexOf("{");
      const lastBrace = normalized.lastIndexOf("}");
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
          return JSON.parse(normalized.slice(firstBrace, lastBrace + 1));
        } catch (e2) {
          console.error("Failed to parse JSON even after extraction");
        }
      }
    }

    // If all parsing fails, return empty result
    console.warn("⚠️ Could not parse LLM response as JSON, returning empty result");
    return this.getEmptyResult();
  }

  /**
   * Get empty result structure for fallback
   */
  getEmptyResult() {
    return {
      pending_labs: [],
      pending_radiology: [],
      pending_followups: [],
      medication_reconciliation: {
        status: "attention_needed",
        medication_count: 0,
        allergy_count: 0,
        concerns: "Unable to extract",
        source_section: "",
        source_excerpt: ""
      },
      pending_discharge_items: [],
      summary: {
        total_pending: 0,
        needs_attention: 0,
        scheduled: 0,
        complete: 0
      }
    };
  }

  /**
   * Register this skill's prompt with the prompt builder
   */
  registerPrompt(promptBuilder) {
    promptBuilder.addTemplate("pending_items_extractor", this.getPendingItemsPrompt());
  }
}

module.exports = PendingItemsExtractorSkill;
