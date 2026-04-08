const cors = require("cors");
const express = require("express");
const fs = require("fs/promises");
const multer = require("multer");
const path = require("path");

// Import Agent System
const DischargeExtractorAgent = require("../agents/discharge_extractor_agent.cjs");
const DashboardMapperSkill = require("../skills/clinical/dashboard_mapper.skill.cjs");
const DoctorAssistantAgent = require("../agents/doctor_assistant_agent.cjs");
const ChatExportBuilderSkill = require("../skills/chat/chat_export_builder.skill.cjs");
const SourceHealthTool = require("../tools/chat/source_health.tool.cjs");

const app = express();
const PORT = Number(process.env.PORT || 8001);
const GEMMA_URL = process.env.GEMMA_URL || "http://206.1.62.28:8000/v1/chat/completions";
const MODEL = process.env.GEMMA_MODEL || "google/gemma-4-26B-A4B-it";
const USE_GEMINI_FOR_EXTERNAL = process.env.USE_GEMINI_FOR_EXTERNAL !== "false";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const storageDir = path.join(__dirname, "storage");
const uploadsDir = path.join(storageDir, "uploads");
const distDir = path.join(__dirname, "..", "dist");
const documentsPath = path.join(storageDir, "documents.json");
const chatSessionsPath = path.join(storageDir, "chat_sessions.json");
const chatActionsPath = path.join(storageDir, "chat_actions.json");
const chatExportsPath = path.join(storageDir, "chat_exports.json");
const searchCachePath = path.join(storageDir, "search_cache.json");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 50,
  },
});

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Serve static test page
app.get('/test-agent', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-agent.html'));
});

function publicDocument(document) {
  const { filePath, ...rest } = document;
  return rest;
}

async function ensureStorage() {
  await fs.mkdir(uploadsDir, { recursive: true });
  await ensureCollectionFile(documentsPath, { documents: [] });
  await ensureCollectionFile(chatSessionsPath, { sessions: [] });
  await ensureCollectionFile(chatActionsPath, { actions: [] });
  await ensureCollectionFile(chatExportsPath, { exports: [] });
  await ensureCollectionFile(searchCachePath, { entries: [] });
}

async function ensureCollectionFile(filePath, initialValue) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(initialValue, null, 2), "utf8");
  }
}

async function readDocuments() {
  await ensureStorage();
  const raw = await fs.readFile(documentsPath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.documents) ? parsed.documents : [];
}

async function writeDocuments(documents) {
  await ensureStorage();
  await fs.writeFile(documentsPath, JSON.stringify({ documents }, null, 2), "utf8");
}

async function readCollection(filePath, key) {
  await ensureStorage();
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed[key]) ? parsed[key] : [];
}

async function writeCollection(filePath, key, items) {
  await ensureStorage();
  await fs.writeFile(filePath, JSON.stringify({ [key]: items }, null, 2), "utf8");
}

let documentMutationQueue = Promise.resolve();

function queueDocumentMutation(task) {
  const run = documentMutationQueue.then(task, task);
  documentMutationQueue = run.catch(() => {});
  return run;
}

async function mutateDocuments(mutator) {
  return queueDocumentMutation(async () => {
    const documents = await readDocuments();
    const value = await mutator(documents);
    await writeDocuments(documents);
    return value;
  });
}

async function updateDocument(id, updater) {
  return mutateDocuments(async (documents) => {
    const document = documents.find((item) => item.id === id);
    if (!document) {
      return null;
    }

    await updater(document, documents);
    return { ...document };
  });
}

async function removeDocument(id) {
  return mutateDocuments(async (documents) => {
    const index = documents.findIndex((item) => item.id === id);
    if (index === -1) {
      return null;
    }

    const [document] = documents.splice(index, 1);
    return document;
  });
}

function buildAgentInfo(agentResult) {
  return {
    name: agentResult.agent,
    version: agentResult.data?.meta?.agent_version,
    latency: agentResult.latency,
    tokensUsed: agentResult.tokensUsed,
    steps: agentResult.steps,
    validation: agentResult.validation,
  };
}

function inferDepartment(filename) {
  const lower = filename.toLowerCase();

  if (lower.includes("summary3") || lower.includes("cardio") || lower.includes("chest")) {
    return "Cardiology / Cath Lab";
  }

  if (lower.includes("summary4") || lower.includes("ent")) {
    return "Pediatrics / ENT";
  }

  if (lower.includes("summary5") || lower.includes("neo") || lower.includes("newborn")) {
    return "Neonatal / Pediatrics";
  }

  return "Inpatient nursing / medical";
}

// NOTE: Agent System now handles PDF processing and data extraction
// The legacy functions have been replaced by:
// - DischargeExtractorAgent (multi-step extraction with validation)
// - DashboardMapperSkill (transforms data to dashboard card format)

// Initialize Agent
const dischargeAgent = new DischargeExtractorAgent({
  gemma: {
    baseUrl: GEMMA_URL,
    model: MODEL,
    timeout: 180000
  }
});

// Initialize Dashboard Mapper
const dashboardMapper = new DashboardMapperSkill();
const chatExportBuilder = new ChatExportBuilderSkill();
const sourceHealthTool = new SourceHealthTool();
const doctorAssistantAgent = new DoctorAssistantAgent({
  gemma: {
    baseUrl: GEMMA_URL,
    model: MODEL,
    timeout: 120000,
  },
  gemini: {
    enabled: USE_GEMINI_FOR_EXTERNAL,
    model: GEMINI_MODEL,
    timeout: 120000,
    apiKey: process.env.GEMINI_API_KEY || "",
  },
  readSessions: async () => readCollection(chatSessionsPath, "sessions"),
  writeSessions: async (sessions) => writeCollection(chatSessionsPath, "sessions", sessions),
  readSearchCache: async () => readCollection(searchCachePath, "entries"),
  writeSearchCache: async (entries) => writeCollection(searchCachePath, "entries", entries),
});

// Helper function to transform agent result to dashboard format
async function transformAgentResultToDashboard(agentResult) {
  // Use the dashboard mapper skill to transform the data
  const mapperResult = await dashboardMapper.execute({ agentResult });

  if (!mapperResult.success) {
    // Fallback to basic transformation if mapper fails
    return {
      meta: agentResult.data?.meta || {},
      dashboard_cards: buildFallbackDashboardCards(agentResult.data),
      sample_patient_data: buildFallbackPatientData(agentResult.data),
      presentation: {
        summary_cards: {},
        notes_rail: [],
      },
      extracted_data: agentResult.data || {}
    };
  }

  return {
    meta: agentResult.data?.meta || {},
    dashboard_cards: mapperResult.data.dashboard_cards,
    sample_patient_data: mapperResult.data.sample_patient_data,
    presentation: mapperResult.data.presentation || {
      summary_cards: {},
      notes_rail: [],
    },
    extracted_data: agentResult.data || {}
  };
}

// Fallback dashboard cards builder
function buildFallbackDashboardCards(data) {
  return {
    vitals_card: {
      icon: "📊",
      title: "Vital Signs",
      status: "stable",
      summary: { latest_bp: "", pulse: 0, temp: 0, spo2: 0 },
      trend: "stable",
      data_points: 0,
      has_alerts: false
    },
    diagnosis_card: {
      icon: "🩺",
      title: "Diagnosis",
      principal_diagnosis: data?.diagnosis?.principal || "",
      icd_code: data?.diagnosis?.icd_code || "",
      secondary_count: 0,
      secondary_diagnoses: [],
      procedures_count: 0
    },
    medications_card: {
      icon: "💊",
      title: "Medications",
      active_count: Array.isArray(data?.medications) ? data.medications.length : 0,
      allergy_count: Array.isArray(data?.allergies) ? data.allergies.length : 0,
      allergies: data?.allergies || [],
      categories: []
    },
    labs_card: {
      icon: "🔬",
      title: "Laboratory Results",
      total_tests: 0,
      abnormal_count: 0,
      critical_count: 0,
      pending_count: 0,
      top_abnormal: ""
    },
    risk_card: {
      icon: "⚠️",
      title: "Risk Assessment",
      fall_risk: data?.risk_scores?.fall_risk || { score: 0, level: "Unknown" },
      dvt_risk: data?.risk_scores?.dvt_risk || { score: 0, level: "Unknown" },
      pressure_ulcer_risk: data?.risk_scores?.pressure_ulcer_risk || { score: 0, level: "Unknown" },
      aspiration_risk: data?.risk_scores?.aspiration_risk || { score: 0, level: "Unknown" },
      ews_score: data?.risk_scores?.ews_score || 0,
      overall_status: "stable"
    },
    radiology_card: {
      icon: "🫀",
      title: "Radiology & Imaging",
      studies_completed: 0,
      critical_findings: 0,
      key_finding: ""
    },
    treatment_card: {
      icon: "🏥",
      title: "Treatment & Procedures",
      procedures_performed: 0,
      surgeries: 0,
      response: "Good"
    },
    clinical_notes_card: {
      icon: "📝",
      title: "Clinical Notes",
      total_notes: Array.isArray(data?.clinical_notes) ? data.clinical_notes.length : 0,
      last_update: data?.clinical_notes?.[0]?.date || data?.meta?.processed_at || new Date().toISOString(),
      notes: Array.isArray(data?.clinical_notes)
        ? data.clinical_notes.map((note) => ({
            type: note.type || "Clinical Note",
            author: note.author || "",
            date: note.date || "",
            summary: note.summary || ""
          }))
        : []
    },
    discharge_plan_card: {
      icon: "📋",
      title: "Discharge Plan",
      condition: "Stable",
      instruction_count: 0,
      red_flags: 0
    },
    follow_up_card: {
      icon: "📅",
      title: "Follow-Up",
      next_appointment: "",
      appointment_count: 0
    }
  };
}

// Fallback patient data builder
function buildFallbackPatientData(data) {
  const patient = data?.patient || {};
  return {
    name: patient.name || "Sample Patient Name",
    age: patient.age || 0,
    mrn: patient.mrn || "",
    admission_date: patient.admission_date || "",
    discharge_date: patient.discharge_date || "",
    los_days: patient.los_days || 0,
    summary: `Patient processed via Agent System v2.0.0`
  };
}

app.get("/api/health", async (_req, res) => {
  res.json({ status: "ok", model: MODEL });
});

app.get("/api/agent/status", async (_req, res) => {
  const agentStatus = dischargeAgent.getStatus();
  res.json({
    agent: {
      name: agentStatus.name,
      version: agentStatus.version,
      type: agentStatus.type,
      skillsCount: agentStatus.skillsCount,
      toolsCount: agentStatus.toolsCount,
      config: {
        maxRetries: agentStatus.config.maxRetries,
        timeoutPerStep: agentStatus.config.timeoutPerStep,
        totalTimeout: agentStatus.config.totalTimeout,
        requireAllSteps: agentStatus.config.requireAllSteps,
        logSteps: agentStatus.config.logSteps,
        saveIntermediates: agentStatus.config.saveIntermediates
      }
    },
    gemma: {
      url: GEMMA_URL,
      model: MODEL
    },
    dashboardMapper: {
      name: dashboardMapper.name,
      version: dashboardMapper.version
    }
  });
});

app.get("/api/documents", async (_req, res) => {
  const documents = await readDocuments();
  res.json({ documents: documents.map(publicDocument) });
});

app.get("/api/documents/:id", async (req, res) => {
  const documents = await readDocuments();
  const document = documents.find((item) => item.id === req.params.id);

  if (!document) {
    return res.status(404).json({ error: "Document not found" });
  }

  return res.json({ document: publicDocument(document) });
});

app.use(express.static(distDir));

app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.post("/api/documents/upload", upload.array("files"), async (req, res) => {
  const files = req.files || [];

  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const uploaded = [];
  await mutateDocuments(async (documents) => {
    for (const file of files) {
      const id = crypto.randomUUID();
      const extension = path.extname(file.originalname) || ".pdf";
      const filePath = path.join(uploadsDir, `${id}${extension}`);

      await fs.writeFile(filePath, file.buffer);

      const document = {
        id,
        name: file.originalname,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        status: "queued",
        department: inferDepartment(file.originalname),
        filePath,
        result: null,
        error: null,
      };

      documents.unshift(document);
      uploaded.push(publicDocument(document));
    }
  });

  res.status(201).json({ documents: uploaded });
});

app.post("/api/documents/process", async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];

  if (ids.length === 0) {
    return res.status(400).json({ error: "No document ids provided" });
  }

  const queuedDocuments = await mutateDocuments(async (documents) => {
    const selected = [];

    for (const id of ids) {
      const document = documents.find((item) => item.id === id);
      if (!document) continue;

      document.status = "processing";
      document.error = null;
      selected.push({
        id: document.id,
        name: document.name,
        filePath: document.filePath,
        department: document.department,
      });
    }

    return selected;
  });

  for (const document of queuedDocuments) {
    if (!document) continue;

    try {
      const agentResult = await dischargeAgent.process(document.filePath, {
        pdfName: document.name,
      });

      if (!agentResult.success) {
        throw new Error(agentResult.error);
      }

      const result = await transformAgentResultToDashboard(agentResult);
      await updateDocument(document.id, async (currentDocument) => {
        currentDocument.status = "processed";
        currentDocument.department = result?.meta?.department_type || currentDocument.department;
        currentDocument.result = result;
        currentDocument.agentInfo = buildAgentInfo(agentResult);
        currentDocument.error = null;
        currentDocument.processedAt = new Date().toISOString();
      });
    } catch (error) {
      await updateDocument(document.id, async (currentDocument) => {
        currentDocument.status = "failed";
        currentDocument.error = error instanceof Error ? error.message : "Unknown processing error";
      });
    }
  }

  const documents = await readDocuments();
  res.json({ documents: documents.map(publicDocument) });
});

app.delete("/api/documents/:id", async (req, res) => {
  const document = await removeDocument(req.params.id);

  if (!document) {
    return res.status(404).json({ error: "Document not found" });
  }

  await fs.rm(document.filePath, { force: true });
  res.status(204).end();
});

// SSE endpoint for real-time processing progress
app.get("/api/documents/process/progress", async (req, res) => {
  const documentId = req.query.documentId;
  if (!documentId) {
    return res.status(400).json({ error: "documentId required" });
  }

  // Set headers for SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: "connected", documentId })}\n\n`);

  // Process the document with progress callbacks
  try {
    const documents = await readDocuments();
    const document = documents.find((item) => item.id === documentId);

    if (!document) {
      res.write(`data: ${JSON.stringify({ type: "error", error: "Document not found" })}\n\n`);
      res.end();
      return;
    }

    await updateDocument(documentId, async (currentDocument) => {
      currentDocument.status = "processing";
      currentDocument.error = null;
    });

    const agentResult = await dischargeAgent.process(document.filePath, {
      pdfName: document.name,
      onProgress: (progress) => {
        res.write(`data: ${JSON.stringify({ ...progress, documentId })}\n\n`);
      }
    });

    if (!agentResult.success) {
      throw new Error(agentResult.error);
    }

    const result = await transformAgentResultToDashboard(agentResult);
    const updatedDocument = await updateDocument(documentId, async (currentDocument) => {
      currentDocument.status = "processed";
      currentDocument.department = result?.meta?.department_type || currentDocument.department;
      currentDocument.result = result;
      currentDocument.agentInfo = buildAgentInfo(agentResult);
      currentDocument.error = null;
      currentDocument.processedAt = new Date().toISOString();
    });

    res.write(`data: ${JSON.stringify({
      type: "done",
      documentId,
      document: updatedDocument ? publicDocument(updatedDocument) : null
    })}\n\n`);
  } catch (error) {
    await updateDocument(documentId, async (currentDocument) => {
      currentDocument.status = "failed";
      currentDocument.error = error instanceof Error ? error.message : "Unknown error";
    });

    res.write(`data: ${JSON.stringify({
      type: "error",
      documentId,
      error: error instanceof Error ? error.message : "Unknown error"
    })}\n\n`);
  }

  res.end();
});

// Test agent endpoint with verbose thinking output
app.post("/api/agent/test-pdf", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const id = crypto.randomUUID();
  const extension = path.extname(req.file.originalname) || ".pdf";
  const filePath = path.join(uploadsDir, `test_${id}${extension}`);

  await fs.writeFile(filePath, req.file.buffer);

  console.log("\n" + "=".repeat(60));
  console.log("🧪 AGENT TEST MODE - Verbose Thinking Output");
  console.log("=".repeat(60));

  const startTime = Date.now();

  try {
    // Process with the agent - logs will appear in console
    const agentResult = await dischargeAgent.process(filePath, {
      pdfName: req.file.originalname
    });

    const endTime = Date.now();

    // Clean up test file
    await fs.rm(filePath, { force: true });

    // Return detailed results including all step data
    res.json({
      success: agentResult.success,
      summary: {
        pdfName: req.file.originalname,
        agentName: agentResult.agent,
        agentVersion: agentResult.data?.meta?.agent_version || "2.0.0",
        totalLatency: endTime - startTime,
        tokensUsed: agentResult.tokensUsed,
        stepsCount: agentResult.steps?.length || 0
      },
      steps: agentResult.steps || [],
      validation: agentResult.validation,
      extractedData: agentResult.data,
      rawResult: agentResult
    });
  } catch (error) {
    await fs.rm(filePath, { force: true }).catch(() => {});
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

app.get("/api/chat/history/:documentId", async (req, res) => {
  const sessions = await readCollection(chatSessionsPath, "sessions");
  const session = sessions.find((item) => item.documentId === req.params.documentId) || null;
  res.json({ session });
});

app.delete("/api/chat/history/:documentId", async (req, res) => {
  const documentId = req.params.documentId;
  const chatId = typeof req.query.chatId === "string" ? req.query.chatId : "";

  const sessions = await readCollection(chatSessionsPath, "sessions");
  const sessionIndex = sessions.findIndex((item) => item.documentId === documentId && (!chatId || item.chatId === chatId));

  if (sessionIndex === -1) {
    return res.status(404).json({ error: "Chat session not found" });
  }

  const [removedSession] = sessions.splice(sessionIndex, 1);
  await writeCollection(chatSessionsPath, "sessions", sessions);

  const actions = await readCollection(chatActionsPath, "actions");
  const filteredActions = actions.filter((item) => item.documentId !== documentId || item.chatId !== removedSession.chatId);
  if (filteredActions.length !== actions.length) {
    await writeCollection(chatActionsPath, "actions", filteredActions);
  }

  const exportsList = await readCollection(chatExportsPath, "exports");
  const filteredExports = exportsList.filter((item) => item.documentId !== documentId || item.chatId !== removedSession.chatId);
  if (filteredExports.length !== exportsList.length) {
    await writeCollection(chatExportsPath, "exports", filteredExports);
  }

  return res.json({ cleared: true, chatId: removedSession.chatId });
});

app.get("/api/chat/source-health", async (_req, res) => {
  try {
    const sources = await sourceHealthTool.checkAll();
    return res.json({ sources });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Source health check failed" });
  }
});

app.post("/api/chat/query", async (req, res) => {
  const { documentId, message, sectionContext, chatId, geminiApiKey } = req.body || {};

  if (!documentId || !message) {
    return res.status(400).json({ error: "documentId and message are required" });
  }

  const documents = await readDocuments();
  const document = documents.find((item) => item.id === documentId);
  if (!document) {
    return res.status(404).json({ error: "Document not found" });
  }

  try {
    const response = await doctorAssistantAgent.execute({
      document,
      documentId,
      message,
      sectionContext,
      chatId,
      geminiApiKey,
    });

    return res.json({
      response: response.data,
      session: response.session,
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Chat query failed" });
  }
});

app.post("/api/chat/action/confirm", async (req, res) => {
  const { documentId, chatId, actionId } = req.body || {};

  if (!documentId || !chatId || !actionId) {
    return res.status(400).json({ error: "documentId, chatId, and actionId are required" });
  }

  const sessions = await readCollection(chatSessionsPath, "sessions");
  const sessionIndex = sessions.findIndex((item) => item.chatId === chatId && item.documentId === documentId);
  if (sessionIndex === -1) {
    return res.status(404).json({ error: "Chat session not found" });
  }

  const session = sessions[sessionIndex];
  const action = session.messages
    .filter((message) => message.role === "assistant")
    .flatMap((message) => message.proposed_actions || [])
    .find((proposal) => proposal.id === actionId);

  if (!action) {
    return res.status(404).json({ error: "Action proposal not found" });
  }

  const confirmedAction = {
    ...action,
    confirmedAt: new Date().toISOString(),
    documentId,
    chatId,
  };

  session.confirmedActions = Array.isArray(session.confirmedActions) ? session.confirmedActions : [];
  if (!session.confirmedActions.some((item) => item.id === actionId)) {
    session.confirmedActions.push(confirmedAction);
  }
  session.messages.push({
    id: crypto.randomUUID(),
    role: "system",
    content: `Confirmed action: ${action.title}`,
    createdAt: new Date().toISOString(),
  });
  session.updatedAt = new Date().toISOString();
  sessions[sessionIndex] = session;
  await writeCollection(chatSessionsPath, "sessions", sessions);

  const actions = await readCollection(chatActionsPath, "actions");
  actions.unshift(confirmedAction);
  await writeCollection(chatActionsPath, "actions", actions);

  return res.json({ action: confirmedAction, session });
});

app.post("/api/chat/export/:documentId", async (req, res) => {
  const documentId = req.params.documentId;
  const { chatId } = req.body || {};

  const documents = await readDocuments();
  const document = documents.find((item) => item.id === documentId);
  if (!document) {
    return res.status(404).json({ error: "Document not found" });
  }

  const sessions = await readCollection(chatSessionsPath, "sessions");
  const session = sessions.find((item) => item.documentId === documentId && (!chatId || item.chatId === chatId));
  if (!session) {
    return res.status(404).json({ error: "Chat session not found" });
  }

  try {
    const exportResult = chatExportBuilder.execute({ session, document });
    const exportRecord = {
      id: crypto.randomUUID(),
      documentId,
      chatId: session.chatId,
      createdAt: new Date().toISOString(),
      chart_note_appendix: exportResult.data.chart_note_appendix,
    };

    const exportsList = await readCollection(chatExportsPath, "exports");
    exportsList.unshift(exportRecord);
    await writeCollection(chatExportsPath, "exports", exportsList);

    await updateDocument(documentId, async (currentDocument) => {
      currentDocument.chatAssistantExport = exportRecord;
    });

    return res.json({ export: exportRecord });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Export failed" });
  }
});

// Chart Note Generation Endpoint
app.get("/api/documents/:id/chart-note", async (req, res) => {
  const documents = await readDocuments();
  const document = documents.find((item) => item.id === req.params.id);

  if (!document) {
    return res.status(404).json({ error: "Document not found" });
  }

  // Check if force regeneration is requested
  const forceRegenerate = req.query.regenerate === 'true' || req.query.force === 'true';

  // Return cached chart note if available and not forcing regeneration
  if (document.chartNote && !forceRegenerate) {
    return res.json({ chartNote: document.chartNote, cached: true });
  }

  // Force regeneration requested - proceed to generate new chart note
  if (forceRegenerate) {
    console.log(`Force regenerating chart note for document ${req.params.id}`);
  }

  // No chart note exists or force regenerate - delegate to POST logic
  req.method = 'POST'; // Temporarily change to POST for the chart note generation logic
  try {
    // Import and initialize the chart note agent
    const ChartNoteAgent = require("../agents/chart_note_agent.cjs");
    const CrossValidationAgentSkill = require("../skills/validation/cross_validation_agent.skill.cjs");
    const PdfReaderTool = require("../tools/pdf/pdf_reader.tool.cjs");

    const chartNoteAgent = new ChartNoteAgent({
      gemma: {
        baseUrl: GEMMA_URL,
        model: MODEL,
        timeout: 90000
      }
    });
    const pdfReader = new PdfReaderTool();
    const crossValidator = new CrossValidationAgentSkill({ confidenceThreshold: 0.9 });

    // Get the extracted data from the document result
    const extractedData = document.result?.extracted_data || {};

    // Read PDF directly from storage for validation
    const pdfFilePath = document.filePath;

    let pdfText = "";
    let validationEnabled = false;

    if (pdfFilePath) {
      try {
        const pdfReaderResult = await pdfReader.execute(pdfFilePath);
        if (pdfReaderResult.success && pdfReaderResult.text && pdfReaderResult.text.length > 0) {
          // Truncate PDF text to avoid token limits (max ~12000 chars for PDF text)
          const maxPdfLength = 12000;
          pdfText = pdfReaderResult.text.length > maxPdfLength
            ? pdfReaderResult.text.substring(0, maxPdfLength) + '\n\n... [PDF truncated for token limit]'
            : pdfReaderResult.text;
          validationEnabled = true;
          console.log("PDF text extracted successfully, length:", pdfReaderResult.text.length, "-> truncated to:", pdfText.length);
        } else {
          console.log("PDF text extraction failed, proceeding without citations");
          if (pdfReaderResult.error) {
            console.log("PDF Reader error:", pdfReaderResult.error);
          }
        }
      } catch (pdfError) {
        console.log("PDF Reader exception:", pdfError.message);
      }
    }

    let validationResult = null;
    let citationSummary = null;

    // Only run validation if we have PDF text
    if (validationEnabled && pdfText) {
      console.log("Running cross-validation for citations...");
      validationResult = await crossValidator.execute({
        extractedData: extractedData,
        pdfText: pdfText,
        gemmaClient: chartNoteAgent.gemmaClient,
        promptBuilder: chartNoteAgent.promptBuilder
      });
      citationSummary = validationResult.data.citations.summary;
    } else {
      // Create empty validation result
      const CitationTrackerTool = require("../tools/llm/citation_tracker.tool.cjs");
      const citationTracker = new CitationTrackerTool();
      validationResult = {
        data: {
          validatedData: extractedData,
          citations: citationTracker.exportForChartNote(),
          validation: citationTracker.generateSummary(),
          fieldsNeedingReview: []
        }
      };
      citationSummary = validationResult.data.citations.summary;
    }

    // Generate chart note using ReAct agent
    const chartNoteResult = await chartNoteAgent.execute({
      extractedData: extractedData,
      pdfText: pdfText,
      citationData: validationResult.data.citations,
      validationSummary: `Confidence: ${(citationSummary.overallConfidence * 100).toFixed(0)}% | Fields reviewed: ${citationSummary.fieldsReviewed}/${citationSummary.totalFields}`
    });

    if (!chartNoteResult.success) {
      return res.status(500).json({ error: chartNoteResult.error });
    }

    // Update document with new chart note
    await updateDocument(req.params.id, async (currentDocument) => {
      currentDocument.chartNote = {
        content: chartNoteResult.data.chart_note,
        generatedAt: new Date().toISOString(),
        tokensUsed: chartNoteResult.data.metadata.total_tokens || 0,
        generationTime: chartNoteResult.data.metadata.generation_time_ms || 0,
        agentType: "react",
        reasoningSteps: chartNoteResult.data.reasoning_steps,
        validation: validationResult.data.validation,
        citations: validationResult.data.citations
      };
    });

    return res.json({
      chartNote: {
        content: chartNoteResult.data.chart_note,
        generatedAt: new Date().toISOString(),
        tokensUsed: chartNoteResult.data.metadata.total_tokens || 0,
        generationTime: chartNoteResult.data.metadata.generation_time_ms || 0,
        agentType: "react",
        reasoningSteps: chartNoteResult.data.reasoning_steps,
        validation: validationResult.data.validation,
        citations: validationResult.data.citations
      },
      cached: false,
      regenerated: true
    });

  } catch (error) {
    console.error("Chart note generation error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to generate chart note" });
  }
});

app.post("/api/documents/:id/chart-note", async (req, res) => {
  const documents = await readDocuments();
  const document = documents.find((item) => item.id === req.params.id);

  if (!document) {
    return res.status(404).json({ error: "Document not found" });
  }

  if (document.status !== "processed") {
    return res.status(400).json({ error: "Document must be processed before generating chart note" });
  }

  try {
    // Initialize ReAct-style Chart Note Agent
    const ChartNoteAgent = require("../agents/chart_note_agent.cjs");
    const CrossValidationAgentSkill = require("../skills/validation/cross_validation_agent.skill.cjs");
    const PdfReaderTool = require("../tools/pdf/pdf_reader.tool.cjs");

    const chartNoteAgent = new ChartNoteAgent({
      gemma: {
        baseUrl: GEMMA_URL,
        model: MODEL,
        timeout: 90000
      }
    });
    const pdfReader = new PdfReaderTool();
    const crossValidator = new CrossValidationAgentSkill({ confidenceThreshold: 0.9 });

    // Get the extracted data from the document result
    const extractedData = document.result?.extracted_data || {};

    // Read PDF directly from storage for validation
    const pdfFilePath = document.filePath;

    let pdfText = "";
    let validationEnabled = false;

    if (pdfFilePath) {
      try {
        const pdfReaderResult = await pdfReader.execute(pdfFilePath);
        if (pdfReaderResult.success && pdfReaderResult.text && pdfReaderResult.text.length > 0) {
          // Truncate PDF text to avoid token limits (max ~12000 chars for PDF text)
          const maxPdfLength = 12000;
          pdfText = pdfReaderResult.text.length > maxPdfLength
            ? pdfReaderResult.text.substring(0, maxPdfLength) + '\n\n... [PDF truncated for token limit]'
            : pdfReaderResult.text;
          validationEnabled = true;
          console.log("PDF text extracted successfully, length:", pdfReaderResult.text.length, "-> truncated to:", pdfText.length);
        } else {
          console.log("PDF text extraction failed, proceeding without citations");
          if (pdfReaderResult.error) {
            console.log("PDF Reader error:", pdfReaderResult.error);
          }
        }
      } catch (pdfError) {
        console.log("PDF Reader exception:", pdfError.message);
      }
    }

    let validationResult = null;
    let citationSummary = null;

    // Only run validation if we have PDF text
    if (validationEnabled && pdfText) {
      console.log("Running cross-validation for citations...");
      validationResult = await crossValidator.execute({
        extractedData: extractedData,
        pdfText: pdfText,
        gemmaClient: chartNoteAgent.gemmaClient,
        promptBuilder: chartNoteAgent.promptBuilder
      });
      citationSummary = validationResult.data.citations.summary;
    } else {
      // Create empty validation result
      const CitationTrackerTool = require("../tools/llm/citation_tracker.tool.cjs");
      const citationTracker = new CitationTrackerTool();
      validationResult = {
        data: {
          validatedData: extractedData,
          citations: citationTracker.exportForChartNote(),
          validation: citationTracker.generateSummary(),
          fieldsNeedingReview: []
        }
      };
      citationSummary = validationResult.data.citations.summary;
    }

    const needsReview = validationResult.data.fieldsNeedingReview.length > 0;
    const validationSummaryText = `Confidence: ${(citationSummary.overallConfidence * 100).toFixed(0)}% | Fields reviewed: ${citationSummary.fieldsReviewed}/${citationSummary.totalFields} | Flags: ${validationResult.data.validation.flags.length}`;

    // Use ReAct-style Chart Note Agent
    console.log("🤖 Using ReAct-style Chart Note Agent...");
    const chartNoteResult = await chartNoteAgent.execute({
      extractedData: extractedData,
      pdfText: pdfText,
      citationData: validationResult.data.citations,
      validationSummary: validationSummaryText
    }, (progress) => {
      console.log(`   Progress: ${progress.step} - ${progress.status}`);
    });

    if (!chartNoteResult.success) {
      return res.status(500).json({ error: chartNoteResult.error });
    }

    // Update document with chart note and validation data
    await updateDocument(req.params.id, async (currentDocument) => {
      currentDocument.chartNote = {
        content: chartNoteResult.data.chart_note,
        generatedAt: new Date().toISOString(),
        tokensUsed: chartNoteResult.data.metadata.total_tokens || 0,
        generationTime: chartNoteResult.data.metadata.generation_time_ms || 0,
        agentType: "react",
        reasoningSteps: chartNoteResult.data.reasoning_steps,
        validation: validationResult.data.validation,
        citations: validationResult.data.citations
      };
    });

    res.json({
      chartNote: {
        content: chartNoteResult.data.chart_note,
        generatedAt: new Date().toISOString(),
        tokensUsed: chartNoteResult.data.metadata.total_tokens || 0,
        generationTime: chartNoteResult.data.metadata.generation_time_ms || 0,
        agentType: "react",
        reasoningSteps: chartNoteResult.data.reasoning_steps,
        validation: validationResult.data.validation,
        citations: validationResult.data.citations
      },
      needsReview: needsReview
    });

  } catch (error) {
    console.error("Chart note generation error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to generate chart note" });
  }
});

// Chart Note PDF Export Endpoint
app.post("/api/documents/:id/chart-note/pdf", async (req, res) => {
  const documents = await readDocuments();
  const document = documents.find((item) => item.id === req.params.id);

  if (!document) {
    return res.status(404).json({ error: "Document not found" });
  }

  try {
    // Get or generate chart note
    let chartNoteContent = document.chartNote?.content;

    if (!chartNoteContent) {
      // Generate chart note first using the full validation pipeline
      const GemmaClientTool = require("../tools/llm/gemma_client.tool.cjs");
      const PromptBuilderTool = require("../tools/llm/prompt_builder.tool.cjs");
      const CrossValidationAgentSkill = require("../skills/validation/cross_validation_agent.skill.cjs");
      const PdfReaderTool = require("../tools/pdf/pdf_reader.tool.cjs");

      const gemmaClient = new GemmaClientTool({
        baseUrl: GEMMA_URL,
        model: MODEL,
        timeout: 180000
      });
      const promptBuilder = new PromptBuilderTool();
      const pdfReader = new PdfReaderTool();
      const crossValidator = new CrossValidationAgentSkill({ confidenceThreshold: 0.9 });

      const extractedData = document.result?.extracted_data || {};
      const pdfReaderResult = await pdfReader.execute(document.filePath);

      // Truncate PDF text to avoid token limits
      const maxPdfLength = 12000;
      const pdfText = (pdfReaderResult.text || "").length > maxPdfLength
        ? pdfReaderResult.text.substring(0, maxPdfLength) + '\n\n... [PDF truncated for token limit]'
        : (pdfReaderResult.text || "");

      const validationResult = await crossValidator.execute({
        extractedData: extractedData,
        pdfText: pdfText,
        gemmaClient: gemmaClient,
        promptBuilder: promptBuilder
      });

      const citationSummary = validationResult.data.citations.summary;
      const validationSummaryText = `Confidence: ${(citationSummary.overallConfidence * 100).toFixed(0)}% | Fields reviewed: ${citationSummary.fieldsReviewed}/${citationSummary.totalFields}`;

      // Calculate max output tokens based on input size
      // Model has 16384 token max context - leave room for output
      const MAX_CONTEXT = 16384;
      const MIN_OUTPUT = 800;
      const MAX_OUTPUT = 1800;
      const dataSize = (JSON.stringify(extractedData).length + JSON.stringify(validationResult.data.citations).length) / 4;
      // Prompt template adds ~7000 tokens for 11-section format
      const PROMPT_TEMPLATE_SIZE = 7000;
      const inputSize = dataSize + PROMPT_TEMPLATE_SIZE;
      // Small safety margin
      const maxOutputTokens = Math.max(MIN_OUTPUT, Math.min(MAX_OUTPUT, Math.floor(MAX_CONTEXT - inputSize - 100)));

      console.log(`Token budget: input=${Math.floor(inputSize)}, output=${maxOutputTokens}, total=${Math.floor(inputSize) + maxOutputTokens}/${MAX_CONTEXT}`);

      const prompt = promptBuilder.build("chart_note_composer", {
        extractedData: JSON.stringify(extractedData, null, 2),
        citationData: JSON.stringify(validationResult.data.citations, null, 2),
        validationSummary: validationSummaryText
      });

      const chartNoteResult = await gemmaClient.execute(prompt, {
        temperature: 0.3,
        maxTokens: maxOutputTokens
      });

      if (!chartNoteResult.success) {
        throw new Error(chartNoteResult.error);
      }

      chartNoteContent = chartNoteResult.content.trim();

      // Add end of record marker
      if (!chartNoteContent.includes("END OF RECORD")) {
        chartNoteContent += "\n\n***** END OF RECORD *****";
      }

      // Cache the chart note
      await updateDocument(req.params.id, async (currentDocument) => {
        currentDocument.chartNote = {
          content: chartNoteContent,
          generatedAt: new Date().toISOString(),
          tokensUsed: chartNoteResult.usage?.totalTokens || 0,
          validation: validationResult.data.validation,
          citations: validationResult.data.citations
        };
      });
    }

    // Generate professional PDF
    const PDFDocument = require("pdfkit");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=discharge-summary-${document.id}.pdf`);

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 45, bottom: 45, left: 50, right: 50 },
      info: {
        Title: "Discharge Summary",
        Subject: "Medical Chart Note",
        Creator: "Yavar.ai"
      }
    });

    doc.pipe(res);

    // ==================== HEADER ====================
    const primaryColor = "#059669";
    const lightBg = "#f0fdf4";
    const borderColor = "#d1fae5";

    // Top border
    doc.moveTo(50, 35).lineTo(560, 35).lineWidth(2).strokeColor(primaryColor).stroke();

    // Logos
    const manipalLogoPath = path.join(__dirname, "../public/manipal-logo.png");
    const yavarLogoPath = path.join(__dirname, "../public/yavar-logo.png");

    try {
      const manipalLogo = await fs.readFile(manipalLogoPath);
      doc.image(manipalLogo, 50, 42, { width: 40 });
    } catch (e) {}

    try {
      const yavarLogo = await fs.readFile(yavarLogoPath);
      doc.image(yavarLogo, 500, 42, { width: 40 });
    } catch (e) {}

    // Title
    doc.fontSize(15).font("Helvetica-Bold").fillColor("#1f2937").text("CLINICAL CHART NOTE", 100, 50);
    doc.fontSize(8).font("Helvetica").fillColor("#6b7280").text("Chart Note", 100, 67);

    // Header line
    doc.moveTo(50, 85).lineTo(560, 85).lineWidth(2).strokeColor(primaryColor).stroke();

    // ==================== PARSE & RENDER CONTENT ====================
    let yPosition = 100;
    const leftMargin = 50;
    const contentWidth = 510;

    doc.fontSize(10).font("Helvetica").fillColor("#374151");

    // Parse patient header
    const lines = chartNoteContent.split("\n");
    let contentStarted = false;
    let inPatientHeader = true;

    // Draw patient info box
    doc.roundedRect(leftMargin, yPosition, contentWidth, 45, 4).fillAndStroke(lightBg, borderColor);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Extract patient info from header line
      if (line.includes("Patient:") && line.includes("MRN:")) {
        const patientMatch = line.match(/Patient:\s*([^|]+?)\s*\|\s*MRN:\s*([^|]+?)\s*\|\s*Age:\s*([^|]+)/);
        if (patientMatch) {
          const name = patientMatch[1].trim();
          const mrn = patientMatch[2].trim();
          const age = patientMatch[3].trim();

          doc.fontSize(10).font("Helvetica-Bold").fillColor("#1f2937").text(name, leftMargin + 10, yPosition + 8);
          doc.fontSize(9).font("Helvetica").fillColor("#6b7280").text(`MRN: ${mrn}  |  Age: ${age}`, leftMargin + 10, yPosition + 24);

          // Extract admission/discharge from same line or next
          let admLine = line;
          if (i + 1 < lines.length && lines[i + 1].includes("Admission:")) {
            admLine = lines[i + 1];
          }
          const admMatch = admLine.match(/Admission:\s*([^|]+?)\s*\|\s*Discharge:\s*([^|]+)/);
          if (admMatch) {
            doc.fontSize(9).font("Helvetica").fillColor("#6b7280").text(
              `Admission: ${admMatch[1].trim()}  |  Discharge: ${admMatch[2].trim()}`,
              leftMargin + 10, yPosition + 37
            );
          }
        }
        yPosition += 55;
        break;
      }
    }

    // Render content sections
    let currentSection = null;
    let sectionContent = [];

    const sectionTitles = {
      "CHIEF COMPLAINT & HISTORY": "CHIEF COMPLAINT & HISTORY",
      "PHYSICAL EXAMINATION": "PHYSICAL EXAMINATION",
      "ASSESSMENT": "ASSESSMENT",
      "PLAN": "PLAN"
    };

    // Page height for A4 is ~842 points, footer at 750
    const MAX_Y = 750;
    const PAGE_MARGIN = 50;

    const checkPageBreak = (requiredSpace = 30) => {
      if (yPosition + requiredSpace > MAX_Y) {
        doc.addPage();
        yPosition = PAGE_MARGIN;
        return true;
      }
      return false;
    };

    const renderSection = (title, content) => {
      if (content.length === 0) return;

      // Check if we need a new page for section header
      checkPageBreak(50);

      // Special handling for ALLERGIES - use red/warning color for safety
      const isAllergies = title === "ALLERGIES & ADVERSE REACTIONS";
      const sectionColor = isAllergies ? "#dc2626" : primaryColor;

      // Section header
      doc.roundedRect(leftMargin, yPosition, contentWidth, 22, 3).fillAndStroke(sectionColor, sectionColor);
      doc.fontSize(11).font("Helvetica-Bold").fillColor("white").text(title, leftMargin + 10, yPosition + 6);
      yPosition += 28;

      const textIndent = 12;

      // Special handling for CHIEF COMPLAINT & HISTORY - more paragraph spacing
      const isChiefComplaint = title === "CHIEF COMPLAINT & HISTORY";
      const isAssessment = title === "ASSESSMENT";

      // Render content with consistent spacing
      let prevWasBullet = false;
      let prevWasHeader = false;

      content.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) {
          // Skip empty lines but add a small gap if next line is not a bullet
          if (index + 1 < content.length) {
            const nextLine = content[index + 1].trim();
            const nextIsBullet = /^[\*\-\••]\s+|^(\d+[\.\)])\s+/.test(nextLine);
            if (!nextIsBullet && !prevWasBullet) {
              yPosition += isChiefComplaint ? 14 : 8; // More spacing for CHIEF COMPLAINT
            }
          }
          return;
        }

        // Special handling for END OF RECORD marker
        if (trimmed.includes("END OF RECORD")) {
          yPosition += 20; // Extra spacing before END OF RECORD
          checkPageBreak(30);

          // Center aligned END OF RECORD
          doc.fontSize(9).font("Helvetica-Bold").fillColor("#374151");
          doc.text("***** END OF RECORD *****", leftMargin, yPosition, {
            width: contentWidth,
            align: "center"
          });
          yPosition += doc.heightOfString("***** END OF RECORD *****", { width: contentWidth, align: "center" }) + 15;
          return;
        }

        // Check if current line fits on page
        checkPageBreak(25);

        // Detect content type
        const isBullet = /^[\*\-\••]\s+|^(\d+[\.\)])\s+/.test(trimmed);
        const isSubsection = /^\*\*[^*]+\*\*:?$/.test(trimmed);
        const isBoldHeader = /^.+:\s*$/.test(trimmed) && trimmed.length < 60;
        const isMajorHeader = /^[A-Z][A-Z\s\/]+$/.test(trimmed) && trimmed.length < 30;

        if (isMajorHeader) {
          prevWasBullet = false;
          prevWasHeader = true;
          yPosition += 8;

          doc.fontSize(10).font("Helvetica-Bold").fillColor("#1f2937");
          doc.text(trimmed, leftMargin + textIndent, yPosition);
          yPosition += doc.heightOfString(trimmed) + 6;
        } else if (isSubsection) {
          prevWasBullet = false;
          prevWasHeader = true;
          yPosition += 8;

          const headerText = trimmed.replace(/\*\*/g, '').replace(/:$/, '');
          doc.fontSize(10).font("Helvetica-Bold").fillColor("#1f2937");
          doc.text(headerText, leftMargin + textIndent, yPosition);
          yPosition += doc.heightOfString(headerText) + 5;
        } else if (isBoldHeader) {
          prevWasBullet = false;
          prevWasHeader = true;
          yPosition += 8;

          doc.fontSize(10).font("Helvetica-Bold").fillColor("#374151");
          doc.text(trimmed.replace(/:$/, ''), leftMargin + textIndent, yPosition);
          yPosition += doc.heightOfString(trimmed.replace(/:$/, '')) + 5;
        } else if (isBullet) {
          // Bullet item - use proper bullet symbol
          if (!prevWasBullet) {
            yPosition += 6; // Space before bullet list starts
          }
          prevWasBullet = true;
          prevWasHeader = false;

          const bulletText = trimmed.replace(/^[\*\-\••]\s+|^(\d+[\.\)])\s+/, '');
          const bulletNum = trimmed.match(/^(\d+)[\.\)]/);
          const bulletChar = bulletNum ? `${bulletNum[1]}.` : '•';

          // Draw bullet in green
          doc.fillColor("#059669").fontSize(8).text(bulletChar, leftMargin + textIndent, yPosition + 2);
          // Draw text
          doc.fillColor("#374151").fontSize(9).font("Helvetica").text(bulletText, leftMargin + textIndent + 10, yPosition, {
            width: contentWidth - textIndent * 2 - 20
          });

          yPosition += Math.max(doc.heightOfString(bulletText, { width: contentWidth - textIndent * 2 - 20 }), 12) + 3;
        } else {
          // Regular paragraph text
          if (prevWasBullet || prevWasHeader) {
            yPosition += 6; // Space after bullets/headers
          }
          prevWasBullet = false;
          prevWasHeader = false;

          doc.fontSize(9).font("Helvetica").fillColor("#374151");
          const lineHeight = isChiefComplaint ? 2.0 : 1.5;
          const options = {
            width: contentWidth - textIndent * 2,
            align: 'justify',
            lineGap: lineHeight
          };
          doc.text(trimmed, leftMargin + textIndent, yPosition, options);
          yPosition += doc.heightOfString(trimmed, options) + (isChiefComplaint ? 10 : 6);
        }
      });

      yPosition += 12;
    };

    for (const line of lines) {
      const trimmed = line.trim();

      // Check for section headers - must be exact match on the line (not part of other text)
      // This prevents matching "Plan & Management Strategy:" as a PLAN section
      const isAllergies = trimmed === "ALLERGIES & ADVERSE REACTIONS" ||
                         trimmed === "ALLERGIES" ||
                         trimmed === "DRUG ALLERGIES";

      const isSubjective = trimmed === "CHIEF COMPLAINT & HISTORY" ||
                          trimmed === "SUBJECTIVE - HISTORY & PRESENTATION" ||
                          trimmed === "SUBJECTIVE" ||
                          trimmed === "S - SUBJECTIVE" ||
                          trimmed === "HISTORY & PRESENTATION";

      const isComorbidities = trimmed === "COMORBIDITIES" ||
                             trimmed === "PAST MEDICAL HISTORY" ||
                             trimmed === "CO-MORBIDITIES";

      const isObjective = trimmed === "PHYSICAL EXAMINATION" ||
                        trimmed === "OBJECTIVE - CLINICAL FINDINGS" ||
                        trimmed === "OBJECTIVE" ||
                        trimmed === "O - OBJECTIVE" ||
                        trimmed === "CLINICAL FINDINGS";

      const isProcedures = trimmed === "PROCEDURES & INTERVENTIONS" ||
                          trimmed === "PROCEDURES" ||
                          trimmed === "PROCEDURES PERFORMED";

      const isHospitalCourse = trimmed === "HOSPITAL COURSE" ||
                              trimmed === "COURSE IN HOSPITAL" ||
                              trimmed === "HOSPITALIZATION COURSE";

      const isAssessment = trimmed === "ASSESSMENT" ||
                          trimmed === "ASSESSMENT - DIAGNOSIS & CLINICAL JUDGMENT" ||
                          trimmed === "A - ASSESSMENT" ||
                          trimmed === "DIAGNOSIS & ASSESSMENT";

      const isPending = trimmed === "PENDING INVESTIGATIONS" ||
                       trimmed === "PENDING" ||
                       trimmed === "PENDING TESTS";

      const isPlan = trimmed === "PLAN" ||
                    trimmed === "PLAN - DISCHARGE PLAN & RECOMMENDATIONS" ||
                    trimmed === "P - PLAN" ||
                    trimmed === "DISCHARGE PLAN";

      const isNursing = trimmed === "NURSING CARE NEEDS" ||
                       trimmed === "NURSING CARE" ||
                       trimmed === "NURSING";

      const isRiskFlags = trimmed === "RISK FLAGS" ||
                         trimmed === "RISK FACTORS" ||
                         trimmed === "RISK ASSESSMENT";

      if (isAllergies || isSubjective || isComorbidities || isObjective ||
          isProcedures || isHospitalCourse || isAssessment || isPending ||
          isPlan || isNursing || isRiskFlags) {

        // Render previous section
        if (currentSection && sectionContent.length > 0) {
          renderSection(currentSection, sectionContent);
          sectionContent = [];
        }

        // Determine proper section title (new standard format)
        if (isAllergies) {
          currentSection = "ALLERGIES & ADVERSE REACTIONS";
        } else if (isSubjective) {
          currentSection = "CHIEF COMPLAINT & HISTORY";
        } else if (isComorbidities) {
          currentSection = "COMORBIDITIES";
        } else if (isObjective) {
          currentSection = "PHYSICAL EXAMINATION";
        } else if (isProcedures) {
          currentSection = "PROCEDURES & INTERVENTIONS";
        } else if (isHospitalCourse) {
          currentSection = "HOSPITAL COURSE";
        } else if (isAssessment) {
          currentSection = "ASSESSMENT";
        } else if (isPending) {
          currentSection = "PENDING INVESTIGATIONS";
        } else if (isPlan) {
          currentSection = "PLAN";
        } else if (isNursing) {
          currentSection = "NURSING CARE NEEDS";
        } else if (isRiskFlags) {
          currentSection = "RISK FLAGS";
        }
        continue;
      }

      // Skip patient header lines already processed
      if (trimmed.includes("Patient:") || trimmed.includes("MRN:") || trimmed.includes("Admission:")) {
        continue;
      }

      // Skip generated footer lines
      if (trimmed.includes("Generated:") || trimmed.includes("Note: This chart note") ||
          trimmed.includes("Validation Summary:") || trimmed.includes("____")) {
        continue;
      }

      // Add to current section content
      if (currentSection && trimmed) {
        sectionContent.push(trimmed);
      }
    }

    // Render last section
    if (currentSection && sectionContent.length > 0) {
      renderSection(currentSection, sectionContent);
    }

    // ==================== FOOTER ====================
    const footerY = 750;

    // Check if we need a new page
    if (yPosition > footerY - 50) {
      doc.addPage();
    }

    doc.moveTo(50, footerY).lineTo(560, footerY).lineWidth(1).strokeColor("#d1d5db").stroke();

    // Validation badge
    if (document.chartNote?.validation) {
      const validation = document.chartNote.validation;
      const confidence = validation.overallConfidence || 0;
      const badgeColor = confidence >= 0.9 ? "#059669" : confidence >= 0.7 ? "#d97706" : "#dc2626";

      doc.roundedRect(leftMargin, footerY + 8, 180, 16, 2).fillAndStroke(badgeColor, badgeColor);
      doc.fontSize(8).font("Helvetica-Bold").fillColor("white").text(
        `✓ ${(confidence * 100).toFixed(0)}% Confidence`,
        leftMargin + 8,
        footerY + 13
      );

      doc.fontSize(7).font("Helvetica").fillColor("white").text(
        `${validation.fieldsReviewed}/${validation.totalFields} verified`,
        leftMargin + 100,
        footerY + 13
      );
    }

    // Footer text
    doc.fontSize(7).font("Helvetica").fillColor("#9ca3af");
    doc.text("Generated by Yavar.ai | " + new Date().toLocaleString(), 240, footerY + 13);

    // Disclaimer
    doc.fontSize(6).font("Helvetica-Oblique").fillColor("#9ca3af");
    doc.text("This is an AI-generated document. Clinician review required.", leftMargin, footerY + 30, { width: contentWidth, align: "center" });

    doc.end();

  } catch (error) {
    console.error("PDF generation error:", error);
    res.status(500).json({ error: error.message });
  }
});

ensureStorage()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Doctor dashboard processing server listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize storage", error);
    process.exit(1);
  });
