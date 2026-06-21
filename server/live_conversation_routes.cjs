const LiveConversationStore = require("./live_conversation_store.cjs");
const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const { buildLiveConversationDocument } = require("./live_conversation_document.cjs");
const {
  buildRequiredReviewItems,
  listMissingRequiredFields,
  mergeRequiredReviewItems,
  normalizeLiveDraft,
  parseRequiredFieldPatch,
} = require("./live_conversation_draft.cjs");

class LiveConversationRoutes {
  constructor(config = {}) {
    this.storageDir = config.storageDir || config.storage?.storageDir;
    this.store = config.store || new LiveConversationStore({
      storageDir: this.storageDir,
      authService: config.authService || null,
      transcriptsRepository: config.transcriptsRepository || null,
      docsRepository: config.docsRepository || null,
      liveSessionsRepository: config.liveSessionsRepository || null,
    });
    this.documentsPath = config.documentsPath;
    // Phase 6: Inject DocumentsRepository for Postgres-only document creation
    this.docsRepository = config.docsRepository || null;
  }

  log(message, data = {}) {
    console.log(`[LiveConversationRoutes] ${message}`, data);
  }

  getAudioExtension(mimeType = "audio/webm") {
    const normalized = String(mimeType || "").toLowerCase();
    if (normalized.includes("mp4") || normalized.includes("m4a")) return ".mp4";
    if (normalized.includes("mpeg") || normalized.includes("mp3")) return ".mp3";
    if (normalized.includes("ogg")) return ".ogg";
    return ".webm";
  }

  normalizeTranscriptText(value = "") {
    return String(value || "")
      .replace(/<\|[^>]+\|>/g, " ")
      .replace(/<\/?s>/gi, " ")
      .replace(/\[(?:music|silence|blank_audio|inaudible|noise)\]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  isMeaningfulTranscriptText(value = "") {
    const cleaned = this.normalizeTranscriptText(value);
    return Boolean(cleaned && /[a-z0-9]/i.test(cleaned));
  }

  async syncStructuredReviewItems(sessionId) {
    const currentSession = await this.store.get(sessionId);
    if (!currentSession) return null;
    if (
      typeof this.store.updateDraftExtraction !== "function"
      || typeof this.store.replaceReviewItems !== "function"
    ) {
      return currentSession;
    }

    const normalizedDraft = normalizeLiveDraft(currentSession.draftExtraction?.extractedData || {});
    if (JSON.stringify(currentSession.draftExtraction?.extractedData || {}) !== JSON.stringify(normalizedDraft)) {
      await this.store.updateDraftExtraction(sessionId, normalizedDraft, {
        source: "draft.sync.normalize",
      });
    }

    const requiredItems = buildRequiredReviewItems(currentSession, normalizedDraft);
    const mergedItems = mergeRequiredReviewItems(
      currentSession.draftExtraction?.reviewItems || [],
      requiredItems,
    );
    await this.store.replaceReviewItems(sessionId, mergedItems, {
      source: "draft.sync.reviewItems",
    });
    return this.store.get(sessionId);
  }

  isEmptySessionCapture(session) {
    return (session?.audio?.chunkCount || 0) === 0
      && (session?.transcript?.segments?.length || 0) === 0
      && !this.isMeaningfulTranscriptText(session?.transcript?.rawText || "")
      && !this.isMeaningfulTranscriptText(session?.transcript?.normalizedText || "");
  }

  isStaleSessionTimestamp(referenceTime) {
    const timestampMs = referenceTime ? new Date(referenceTime).getTime() : NaN;
    if (!Number.isFinite(timestampMs)) return true;
    return (Date.now() - timestampMs) > 15000;
  }

  isRecoverableLiveSession(session) {
    if (!session || session.status !== "live" || session.endedAt) return false;
    if (!this.isEmptySessionCapture(session)) return false;

    const referenceTime = session.startedAt || session.updatedAt;
    return this.isStaleSessionTimestamp(referenceTime);
  }

  isRecoverableDraftTransportSession(session) {
    if (!session || session.status !== "draft") return false;
    if (session.transport?.connectionState !== "connected") return false;
    if (!this.isEmptySessionCapture(session)) return false;

    const referenceTime = session.transport?.lastEventAt || session.updatedAt;
    return this.isStaleSessionTimestamp(referenceTime);
  }

  async normalizeRecoverableSession(session) {
    if (
      session
      && session.status === "draft"
      && session.startedAt
      && !session.endedAt
      && this.isEmptySessionCapture(session)
    ) {
      return this.store.update(session.id, {
        __source: "route.recoverable.draftWithStartedAt",
        startedAt: null,
        transport: {
          connectionState: session.transport?.connectionState || "idle",
          lastError: session.transport?.lastError || null,
          lastEventAt: new Date().toISOString(),
        },
      });
    }

    if (this.isRecoverableLiveSession(session)) {
      return this.store.update(session.id, {
        __source: "route.recoverable.staleLive",
        status: "draft",
        startedAt: null,
        transport: {
          connectionState: "idle",
          lastError: null,
          lastEventAt: new Date().toISOString(),
        },
      });
    }

    if (!this.isRecoverableDraftTransportSession(session)) return session;

    return this.store.update(session.id, {
      __source: "route.recoverable.draftTransport",
      transport: {
        connectionState: "idle",
        lastError: null,
        lastEventAt: new Date().toISOString(),
      },
    });
  }

  async requireAuth(req, res, authService) {
    try {
      const user = await authService.authenticateFromRequest(req);
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return null;
      }
      return user;
    } catch (error) {
      res.status(401).json({ error: error.message });
      return null;
    }
  }

  async loadSession(req, res, authService) {
    const user = await this.requireAuth(req, res, authService);
    if (!user) return null;

    const sessionId = req.params.sessionId;
    if (!sessionId) {
      res.status(400).json({ error: "sessionId is required" });
      return null;
    }

    const session = await this.store.get(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return null;
    }

    // Check ownership
    if (session.createdBy?.id !== user.id && user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return null;
    }

    return { session, user };
  }

  async ensureDocsRepository() {
    if (!this.docsRepository) {
      throw new Error("DocumentsRepository not configured");
    }

    await this.docsRepository.initialize();
    return this.docsRepository;
  }

  async upsertLiveDocumentExtraction(documentId, result = {}) {
    const docsRepository = await this.ensureDocsRepository();
    const currentExtraction = await docsRepository.findCurrentExtraction(documentId).catch(() => null);
    const allExtractions = currentExtraction
      ? [currentExtraction]
      : await docsRepository.findDocumentExtractions(documentId).catch(() => []);
    const targetExtraction = currentExtraction || allExtractions[0] || null;

    const extractionPayload = {
      status: "completed",
      agent_name: "live_conversation",
      agent_version: "1.0",
      extracted_data: result.extracted_data || {},
      dashboard_payload: result || {},
      meta: result.meta || {},
      presentation: result.presentation || {},
      stage1: result.stage1 || {},
      stage3: result.stage3 || {},
    };

    if (targetExtraction) {
      const updatedExtraction = await docsRepository.queryOne(
        `UPDATE ${docsRepository.documentExtractionsTableName}
         SET status = $1,
             agent_name = $2,
             agent_version = $3,
             extracted_data_jsonb = $4,
             dashboard_payload_jsonb = $5,
             meta_jsonb = $6,
             stage1_jsonb = $7,
             stage3_jsonb = $8,
             presentation_jsonb = $9
         WHERE id = $10
         RETURNING *`,
        [
          extractionPayload.status,
          extractionPayload.agent_name,
          extractionPayload.agent_version,
          docsRepository.toJSONB(extractionPayload.extracted_data),
          docsRepository.toJSONB(extractionPayload.dashboard_payload),
          docsRepository.toJSONB(extractionPayload.meta),
          docsRepository.toJSONB(extractionPayload.stage1),
          docsRepository.toJSONB(extractionPayload.stage3),
          docsRepository.toJSONB(extractionPayload.presentation),
          targetExtraction.id,
        ],
      );

      await docsRepository.updateDocument(documentId, {
        current_extraction_id: updatedExtraction.id,
      });
      return updatedExtraction;
    }

    const createdExtraction = await docsRepository.createDocumentExtraction({
      document_id: documentId,
      version_no: 1,
      ...extractionPayload,
    });
    await docsRepository.updateDocument(documentId, {
      current_extraction_id: createdExtraction.id,
    });
    return createdExtraction;
  }

  registerRoutes(app, authService) {
    app.post("/api/voice/live/sessions", async (req, res) => {
      const user = await this.requireAuth(req, res, authService);
      if (!user) return;

      try {
        const session = await this.store.create({
          linkedPatient: req.body.linkedPatient || "",
          encounterLabel: req.body.encounterLabel || "",
          createdBy: {
            id: user.id || user.username,
            username: user.username,
            role: user.role || "doctor",
          },
        });

        await this.store.logEvent(session.id, "session_created", {
          createdBy: user.username,
        });

        res.status(201).json(this.store.toPublicSession(session));
      } catch (error) {
        this.log("Create session error", { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    app.get("/api/voice/live/sessions", async (req, res) => {
      const user = await this.requireAuth(req, res, authService);
      if (!user) return;

      try {
        const filters = {};
        if (req.query.status) {
          filters.status = req.query.status.split(",");
        }
        // Only show user's own sessions unless admin
        if (user.role !== "admin") {
          filters.createdBy = user.id || user.username;
        }

        const sessions = await this.store.list(filters);
        const publicSessions = sessions.map((s) => this.store.toPublicSession(s));

        res.json({ sessions: publicSessions });
      } catch (error) {
        this.log("List sessions error", { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    app.get("/api/voice/live/sessions/:sessionId", async (req, res) => {
      const result = await this.loadSession(req, res, authService);
      if (!result) return;

      try {
        res.json(this.store.toPublicSession(result.session));
      } catch (error) {
        this.log("Get session error", { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    app.get("/api/voice/live/sessions/:sessionId/audio", async (req, res) => {
      const result = await this.loadSession(req, res, authService);
      if (!result) return;

      try {
        const session = result.session;
        const audioPath = session.audio?.combinedPath;
        if (!audioPath) {
          res.status(404).json({ error: "Saved recording not found" });
          return;
        }

        await fs.access(audioPath);

        const contentType = String(session.audio?.mimeType || "audio/webm").split(";")[0] || "audio/webm";
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "private, no-store");
        return res.sendFile(audioPath);
      } catch (error) {
        if (error && error.code === "ENOENT") {
          res.status(404).json({ error: "Saved recording not found" });
          return;
        }
        this.log("Get session audio error", { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    app.delete("/api/voice/live/sessions/:sessionId/audio", async (req, res) => {
      const result = await this.loadSession(req, res, authService);
      if (!result) return;

      try {
        const { session, user } = result;
        const updated = await this.store.deleteAudio(session.id);
        await this.store.logEvent(session.id, "recording_deleted", {
          deletedBy: user.username,
        });
        res.json(this.store.toPublicSession(updated || session));
      } catch (error) {
        this.log("Delete session audio error", { error: error.message, stack: error.stack });
        res.status(500).json({ error: error.message });
      }
    });

    app.post(
      "/api/voice/live/sessions/:sessionId/audio/final",
      express.raw({ type: () => true, limit: "100mb" }),
      async (req, res) => {
        const result = await this.loadSession(req, res, authService);
        if (!result) return;

        try {
          const { session, user } = result;
          if (session.createdBy?.id !== user.id && user.role !== "admin") {
            res.status(403).json({ error: "Forbidden" });
            return;
          }

          const body = req.body;
          const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body || []);
          if (!buffer || buffer.length === 0) {
            res.status(400).json({ error: "Final audio payload is empty" });
            return;
          }

          const mimeTypeHeader = String(req.headers["content-type"] || "").trim();
          const mimeType = mimeTypeHeader || session.audio?.mimeType || "audio/webm";
          const requestedDurationMs = Number(req.headers["x-live-duration-ms"]);
          const extension = this.getAudioExtension(mimeType);
          const audioDir = path.join(this.storageDir, "live_conversation_audio");
          await fs.mkdir(audioDir, { recursive: true });

          const audioPath = path.join(audioDir, `${session.id}${extension}`);
          await fs.writeFile(audioPath, buffer);

          await this.store.setFinalAudioAsset(session.id, {
            mimeType,
            combinedPath: audioPath,
            totalBytes: buffer.length,
            combinedSize: buffer.length,
            durationMs: Number.isFinite(requestedDurationMs) && requestedDurationMs > 0
              ? requestedDurationMs
              : undefined,
          }, {
            source: "route.audio.final",
          });

          await this.store.logEvent(session.id, "final_audio_uploaded", {
            mimeType,
            bytes: buffer.length,
          });
          console.log(`[LiveConversation][${session.id}] final_audio_uploaded`, {
            timestamp: new Date().toISOString(),
            mimeType,
            bytes: buffer.length,
            durationMs: Number.isFinite(requestedDurationMs) && requestedDurationMs > 0
              ? Math.round(requestedDurationMs)
              : null,
            audioFile: path.basename(audioPath),
          });

          res.status(204).end();
        } catch (error) {
          this.log("Upload final audio error", { error: error.message });
          res.status(500).json({ error: error.message });
        }
      },
    );

    app.patch("/api/voice/live/sessions/:sessionId", async (req, res) => {
      const result = await this.loadSession(req, res, authService);
      if (!result) return;

      try {
        const { session, user } = result;
        if (session.createdBy?.id !== user.id && user.role !== "admin") {
          res.status(403).json({ error: "Forbidden" });
          return;
        }

        const updates = {};
        if (req.body.linkedPatient !== undefined) updates.linkedPatient = req.body.linkedPatient;
        if (req.body.encounterLabel !== undefined) updates.encounterLabel = req.body.encounterLabel;

        if (Object.keys(updates).length > 0) {
          await this.store.update(session.id, {
            ...updates,
            __source: "route.session.patch",
          });
        }
        if (req.body.draftPatch && typeof req.body.draftPatch === "object") {
          await this.store.updateDraftExtraction(session.id, req.body.draftPatch, {
            source: "route.session.draftPatch",
          });
        }
        const updated = await this.syncStructuredReviewItems(session.id);
        res.json(this.store.toPublicSession(updated));
      } catch (error) {
        this.log("Update session error", { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    app.post("/api/voice/live/sessions/:sessionId/pause", async (req, res) => {
      const result = await this.loadSession(req, res, authService);
      if (!result) return;

      try {
        const { session } = result;
        if (session.status !== "live") {
          res.status(400).json({ error: "Session is not live" });
          return;
        }

        const updated = await this.store.setTransportState(session.id, {
          connectionState: "paused",
          lastError: null,
          lastEventAt: new Date().toISOString(),
        }, {
          status: "paused",
          source: "route.pause",
        });
        await this.store.logEvent(session.id, "session_paused");

        res.json(this.store.toPublicSession(updated));
      } catch (error) {
        this.log("Pause session error", { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    app.post("/api/voice/live/sessions/:sessionId/resume", async (req, res) => {
      const result = await this.loadSession(req, res, authService);
      if (!result) return;

      try {
        const { session } = result;
        if (session.status !== "paused") {
          res.status(400).json({ error: "Session is not paused" });
          return;
        }

        const updated = await this.store.setTransportState(session.id, {
          connectionState: "connected",
          lastError: null,
          lastEventAt: new Date().toISOString(),
        }, {
          status: "live",
          source: "route.resume",
        });
        await this.store.logEvent(session.id, "session_resumed");

        res.json(this.store.toPublicSession(updated));
      } catch (error) {
        this.log("Resume session error", { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    app.post("/api/voice/live/sessions/:sessionId/review", async (req, res) => {
      const result = await this.loadSession(req, res, authService);
      if (!result) return;

      try {
        const { session } = result;
        const { reviewItemId, resolution, editedValue } = req.body;
        const reviewItem = session.draftExtraction?.reviewItems?.find((item) => item.id === reviewItemId);

        if (!reviewItemId || !resolution) {
          res.status(400).json({ error: "reviewItemId and resolution are required" });
          return;
        }

        if (!["pending", "approved", "edited", "rejected"].includes(resolution)) {
          res.status(400).json({ error: "Invalid resolution" });
          return;
        }

        if (!reviewItem) {
          res.status(404).json({ error: "Review item not found" });
          return;
        }

        if (reviewItem.required && resolution !== "edited") {
          res.status(400).json({ error: "This field must be entered before finalizing." });
          return;
        }

        if (reviewItem.fieldPath && resolution === "edited") {
          let sessionPatch;
          let draftPatch;
          try {
            ({ sessionPatch, draftPatch } = parseRequiredFieldPatch(
              reviewItem.fieldPath,
              editedValue,
              session.draftExtraction?.extractedData || {},
            ));
          } catch (parseError) {
            res.status(400).json({ error: parseError.message });
            return;
          }
          if (Object.keys(sessionPatch).length > 0) {
            await this.store.update(session.id, {
              ...sessionPatch,
              __source: "review.resolve.sessionPatch",
            });
          }
          if (Object.keys(draftPatch).length > 0) {
            await this.store.updateDraftExtraction(session.id, draftPatch, {
              source: "review.resolve.draftPatch",
            });
          }
        }

        await this.store.resolveReviewItem(
          session.id,
          reviewItemId,
          resolution,
          editedValue,
          { source: "review.resolve" },
        );
        const updated = await this.syncStructuredReviewItems(session.id);

        await this.store.logEvent(session.id, "review_item_resolved", {
          reviewItemId,
          resolution,
        });

        res.json(this.store.toPublicSession(updated));
      } catch (error) {
        this.log("Review item error", { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    app.post("/api/voice/live/sessions/:sessionId/finalize", async (req, res) => {
      const result = await this.loadSession(req, res, authService);
      if (!result) return;

      try {
        let { session } = result;
        session = await this.syncStructuredReviewItems(session.id) || session;
        if (session.status === "finalized" && session.documentId) {
          res.json(this.store.toPublicSession(session));
          return;
        }
        if (session.status !== "review_required") {
          res.status(400).json({ error: "Session is not ready for finalization" });
          return;
        }

        const pendingReview = session.draftExtraction?.reviewItems?.filter(
          (r) => r.resolution === "pending",
        ) || [];
        if (pendingReview.length > 0) {
          res.status(400).json({
            error: "Cannot finalize with pending review items",
            pendingReview: pendingReview.length,
          });
          return;
        }

        const missingFields = listMissingRequiredFields(
          session,
          normalizeLiveDraft(session.draftExtraction?.extractedData || {}),
        );
        if (missingFields.length > 0) {
          res.status(400).json({
            error: "Cannot finalize until required demographics are completed",
            missingFields: missingFields.map((field) => field.title),
          });
          return;
        }

        const documentId = await this.createDashboardDocument(session);

        const updated = await this.store.finalize(session.id, documentId);
        await this.store.logEvent(session.id, "session_finalized", { documentId });

        res.json(this.store.toPublicSession(updated));
      } catch (error) {
        this.log("Finalize error", {
          sessionId: req.params.sessionId,
          error: error.message,
          code: error.code,
          stack: error.stack,
        });
        res.status(500).json({ error: error.message });
      }
    });

    app.delete("/api/voice/live/sessions/:sessionId", async (req, res) => {
      const result = await this.loadSession(req, res, authService);
      if (!result) return;

      try {
        const { session, user } = result;
        if (session.documentId || session.status === "finalized") {
          res.status(400).json({
            error: "Finalized visits require the explicit finalized delete action.",
          });
          return;
        }

        await this.store.logEvent(session.id, "session_deleted", {
          deletedBy: user.username,
        });
        await this.store.delete(session.id);
        res.json({ success: true });
      } catch (error) {
        this.log("Delete session error", { error: error.message, stack: error.stack });
        res.status(500).json({ error: error.message });
      }
    });

    app.delete("/api/voice/live/sessions/:sessionId/finalized-visit", async (req, res) => {
      const result = await this.loadSession(req, res, authService);
      if (!result) return;

      try {
        const { session, user } = result;
        const deletedDocumentId = session.documentId || null;

        if (deletedDocumentId) {
          const docsRepository = await this.ensureDocsRepository();
          await docsRepository.deleteDocument(deletedDocumentId).catch(() => false);
        }

        await this.store.logEvent(session.id, "finalized_session_deleted", {
          deletedBy: user.username,
          documentId: deletedDocumentId,
        });
        await this.store.delete(session.id);
        res.json({ success: true, documentId: deletedDocumentId });
      } catch (error) {
        this.log("Delete finalized session error", { error: error.message, stack: error.stack });
        res.status(500).json({ error: error.message });
      }
    });

    app.get("/api/voice/live/sessions/:sessionId/events", async (req, res) => {
      const result = await this.loadSession(req, res, authService);
      if (!result) return;

      try {
        const limit = Number(req.query.limit) || 100;
        const events = await this.store.getEvents(result.session.id, limit);
        res.json({ events });
      } catch (error) {
        this.log("Get events error", { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });
  }

  async createDashboardDocument(session) {
    const docsRepository = await this.ensureDocsRepository();

    const now = new Date().toISOString();
    const newDocument = buildLiveConversationDocument(session, { createdAt: now });
    const documentId = newDocument.id;
    const documentPayload = {
      name: newDocument.name,
      status: 'completed', // Live conversation documents are usually completed when finalized
      document_type: 'live_conversation',
      // The relational subtype enum does not define a live-conversation-specific subtype.
      document_subtype: 'unknown',
      source_kind: 'live_conversation',
      mime_type: 'application/json',
      size_bytes: 0, // Live conversation documents don't have a source file size
      sha256_hash: null,
      uploaded_at: newDocument.uploadedAt || now,
      processed_at: now,
      department: 'Live Conversation',
      linked_patient_label: newDocument.linkedPatient || null,
      encounter_label: newDocument.encounterLabel || null,
      error_message: null,
      error_code: null,
    };

    const existingDocument = await docsRepository.findDocumentById(documentId).catch(() => null);
    if (existingDocument) {
      await docsRepository.updateDocument(documentId, documentPayload);
    } else {
      try {
        await docsRepository.createDocument({
          id: documentId,
          ...documentPayload,
        });
      } catch (error) {
        if (error?.code === "23505") {
          await docsRepository.updateDocument(documentId, documentPayload);
        } else {
          throw error;
        }
      }
    }

    // Store extraction data if available
    if (newDocument.result && newDocument.result.extracted_data) {
      await this.upsertLiveDocumentExtraction(documentId, newDocument.result);
    }

    if (typeof this.store.syncLiveSessionAudioAsset === "function") {
      await this.store.syncLiveSessionAudioAsset(session).catch((error) => {
        this.log("Live session audio asset sync failed during finalize", {
          sessionId: session.id,
          error: error.message,
        });
      });
    }

    this.log("Document created in Postgres", { documentId });

    return documentId;
  }
}

module.exports = LiveConversationRoutes;
