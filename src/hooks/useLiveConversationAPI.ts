import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveConversationAudio } from "./useLiveConversationAudio";

export type LiveSpeakerRole = "doctor" | "patient" | "unknown";
export type LiveConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "paused" | "closed" | "error";
export type LiveCaptureState = "idle" | "starting" | "recording" | "paused" | "stopping" | "failed";
export type LiveSessionStatus = "draft" | "live" | "paused" | "review_required" | "finalizing" | "finalized" | "failed";
export type LiveReviewResolution = "pending" | "approved" | "edited" | "rejected";
export type LiveMedicationStatus = "draft" | "needs_review" | "current" | "prescribed" | "planned";

/**
 * Canonical UI phase for a live conversation encounter.
 * This is the single source of truth for all UI state rendering.
 * Derived from server session status, local recorder state, and transport state.
 */
export type LiveEncounterPhase =
  | "draft_ready"           // Ready to start capturing (session is draft)
  | "starting"             // Initializing microphone/connection
  | "capturing"            // Actively recording
  | "paused"               // Recording paused
  | "ending_upload"        // Stopping and uploading final audio
  | "transcribing"         // Processing transcript after upload
  | "review_ready"         // Ready for clinician review
  | "finalizing_document"  // Generating final document
  | "finalized"            // Complete and published
  | "failed";              // Error state

export type LiveDeviceOption = {
  id: string;
  label: string;
};

export type LiveTranscriptSegment = {
  id: string;
  speakerRole: LiveSpeakerRole;
  speakerLabel: string;
  startLabel: string;
  endLabel: string;
  text: string;
  confidence: number | null;
  flags: string[];
  status: "interim" | "final";
};

export type LiveReviewItem = {
  id: string;
  category: "transcript" | "medication" | "follow_up" | "demographics" | "vitals";
  severity: "low" | "medium" | "high";
  title: string;
  extractedValue: string;
  suggestedValue: string;
  resolution: LiveReviewResolution;
  editedValue?: string;
  required?: boolean;
  fieldPath?: string;
  placeholder?: string;
  inputType?: "text" | "number" | "select";
  options?: string[];
};

export type LiveDraftExtraction = {
  chiefComplaint: string;
  hpi: string;
  ros: string[];
  pastHistory: string[];
  assessment: string;
  diagnosis: string;
  symptoms: string[];
  medications: Array<{ name: string; instruction: string; status: LiveMedicationStatus }>;
  labs: string[];
  radiology: string[];
  procedures: string[];
  followUp: string[];
  plan: string[];
  patient: {
    name: string;
    age: number | null;
    gender: string;
  };
  vitals: {
    latest: {
      bp: {
        systolic: number | null;
        diastolic: number | null;
      };
      pulse: {
        value: number | null;
        unit: string;
      };
      temperature: {
        value: number | null;
        unit: string;
      };
      spo2: {
        value: number | null;
        unit: string;
      };
      weight: {
        value: number | null;
        unit: string;
      };
    };
  };
};

/**
 * Empty draft object to prevent null dereference crashes
 */
const EMPTY_DRAFT: LiveDraftExtraction = {
  chiefComplaint: "",
  hpi: "",
  ros: [],
  pastHistory: [],
  assessment: "",
  diagnosis: "",
  symptoms: [],
  medications: [],
  labs: [],
  radiology: [],
  procedures: [],
  followUp: [],
  plan: [],
  patient: {
    name: "",
    age: null,
    gender: "",
  },
  vitals: {
    latest: {
      bp: {
        systolic: null,
        diastolic: null,
      },
      pulse: {
        value: null,
        unit: "bpm",
      },
      temperature: {
        value: null,
        unit: "F",
      },
      spo2: {
        value: null,
        unit: "%",
      },
      weight: {
        value: null,
        unit: "kg",
      },
    },
  },
};

function normalizeText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeListItem(item: unknown): string {
  if (typeof item === "string") return item.trim();
  if (typeof item === "number" || typeof item === "boolean") return String(item);
  if (!item || typeof item !== "object") return "";

  const record = item as Record<string, unknown>;
  const directText = normalizeText(
    record.name
    ?? record.label
    ?? record.value
    ?? record.text
    ?? record.summary
    ?? record.reason
    ?? record.finding
    ?? record.description,
  ).trim();
  if (directText) return directText;

  const system = normalizeText(record.system ?? record.category ?? record.type).trim();
  const detail = normalizeText(record.result ?? record.status ?? record.note).trim();
  if (system && detail) return `${system}: ${detail}`;
  return system || detail;
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeListItem(item)).filter(Boolean);
  }

  if (typeof value === "string") {
    const text = value.trim();
    return text ? [text] : [];
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const groupedEntries: Array<[string, unknown]> = [
    ["positive", record.positive],
    ["positives", record.positives],
    ["negative", record.negative],
    ["negatives", record.negatives],
    ["items", record.items],
    ["list", record.list],
    ["history", record.history],
  ];

  const groupedValues = groupedEntries.flatMap(([groupLabel, groupValue]) =>
    normalizeStringList(groupValue).map((item) =>
      groupLabel === "positive" || groupLabel === "positives"
        ? `Positive: ${item}`
        : groupLabel === "negative" || groupLabel === "negatives"
          ? `Negative: ${item}`
          : item,
    ),
  );

  if (groupedValues.length > 0) {
    return groupedValues;
  }

  return Object.entries(record)
    .filter(([key]) => !["positive", "positives", "negative", "negatives", "items", "list", "history"].includes(key))
    .flatMap(([key, entryValue]) => {
      const items = normalizeStringList(entryValue);
      if (items.length === 0) return [];
      const keyLabel = key.replace(/_/g, " ").trim();
      return keyLabel ? items.map((item) => `${keyLabel}: ${item}`) : items;
    });
}

function normalizeMedications(value: unknown): LiveDraftExtraction["medications"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any) => {
      if (typeof item === "string") {
        const name = item.trim();
        return name ? { name, instruction: "", status: "draft" as const } : null;
      }
      if (!item || typeof item !== "object") return null;
      const rawStatus = normalizeText(item?.status).trim().toLowerCase();
      const status: LiveMedicationStatus = rawStatus === "needs_review"
        ? "needs_review"
        : rawStatus === "current"
          ? "current"
          : rawStatus === "prescribed"
            ? "prescribed"
            : rawStatus === "planned"
              ? "planned"
              : "draft";
      return {
        name: normalizeText(item?.name || item?.label || item?.medicine).trim(),
        instruction: normalizeListItem(item?.instruction) || normalizeText(item?.frequency).trim(),
        status,
      };
    })
    .filter((item): item is LiveDraftExtraction["medications"][number] => Boolean(item?.name));
}

function normalizeDraftExtraction(rawDraft: unknown): LiveDraftExtraction {
  const draft = rawDraft && typeof rawDraft === "object" ? rawDraft : {};
  const patient = (draft as any).patient && typeof (draft as any).patient === "object"
    ? (draft as any).patient
    : {};
  const vitals = (draft as any).vitals && typeof (draft as any).vitals === "object"
    ? (draft as any).vitals
    : {};
  const latest = vitals.latest && typeof vitals.latest === "object" ? vitals.latest : {};
  const bp = latest.bp && typeof latest.bp === "object" ? latest.bp : vitals.bp || {};
  const pulse = latest.pulse && typeof latest.pulse === "object" ? latest.pulse : vitals.pulse || {};
  const temperature = latest.temperature && typeof latest.temperature === "object" ? latest.temperature : vitals.temperature || {};
  const spo2 = latest.spo2 && typeof latest.spo2 === "object" ? latest.spo2 : vitals.spo2 || {};
  const weight = latest.weight && typeof latest.weight === "object" ? latest.weight : vitals.weight || {};

  return {
    chiefComplaint: normalizeText((draft as any).chiefComplaint ?? (draft as any).chief_complaint).trim(),
    hpi: normalizeText((draft as any).hpi ?? (draft as any).historyOfPresentIllness ?? (draft as any).history_of_present_illness).trim(),
    ros: normalizeStringList((draft as any).ros ?? (draft as any).reviewOfSystems ?? (draft as any).review_of_systems),
    pastHistory: normalizeStringList(
      (draft as any).pastHistory
      ?? (draft as any).past_history
      ?? (draft as any).pastMedicalHistory
      ?? (draft as any).past_medical_history
      ?? (draft as any).medicalHistory
      ?? (draft as any).medical_history
      ?? (draft as any).pmh
      ?? (draft as any).comorbidities,
    ),
    assessment: normalizeText((draft as any).assessment ?? (draft as any).diagnosis).trim(),
    diagnosis: normalizeText((draft as any).diagnosis).trim(),
    symptoms: normalizeStringList((draft as any).symptoms),
    medications: normalizeMedications((draft as any).medications),
    labs: normalizeStringList((draft as any).labs),
    radiology: normalizeStringList((draft as any).radiology),
    procedures: normalizeStringList((draft as any).procedures),
    followUp: normalizeStringList((draft as any).followUp ?? (draft as any).follow_up),
    plan: normalizeStringList((draft as any).plan),
    patient: {
      name: normalizeText(patient.name ?? (draft as any).patientName).trim(),
      age: normalizeNumber(patient.age),
      gender: normalizeText(patient.gender ?? (draft as any).gender).trim(),
    },
    vitals: {
      latest: {
        bp: {
          systolic: normalizeNumber(bp.systolic),
          diastolic: normalizeNumber(bp.diastolic),
        },
        pulse: {
          value: normalizeNumber((pulse as any).value ?? pulse),
          unit: normalizeText(pulse.unit) || EMPTY_DRAFT.vitals.latest.pulse.unit,
        },
        temperature: {
          value: normalizeNumber((temperature as any).value ?? temperature),
          unit: normalizeText(temperature.unit) || EMPTY_DRAFT.vitals.latest.temperature.unit,
        },
        spo2: {
          value: normalizeNumber((spo2 as any).value ?? spo2),
          unit: normalizeText(spo2.unit) || EMPTY_DRAFT.vitals.latest.spo2.unit,
        },
        weight: {
          value: normalizeNumber((weight as any).value ?? weight),
          unit: normalizeText(weight.unit) || EMPTY_DRAFT.vitals.latest.weight.unit,
        },
      },
    },
  };
}

function mergeDraftExtraction(
  currentDraft: LiveDraftExtraction | null | undefined,
  draftPatch: Partial<LiveDraftExtraction> | null | undefined,
): LiveDraftExtraction {
  const baseDraft = currentDraft || EMPTY_DRAFT;
  const patch = draftPatch || {};

  return normalizeDraftExtraction({
    ...baseDraft,
    ...patch,
    patient: {
      ...baseDraft.patient,
      ...(patch.patient || {}),
    },
    vitals: {
      ...baseDraft.vitals,
      ...(patch.vitals || {}),
      latest: {
        ...baseDraft.vitals.latest,
        ...(patch.vitals?.latest || {}),
        bp: {
          ...baseDraft.vitals.latest.bp,
          ...(patch.vitals?.latest?.bp || {}),
        },
        pulse: {
          ...baseDraft.vitals.latest.pulse,
          ...(patch.vitals?.latest?.pulse || {}),
        },
        temperature: {
          ...baseDraft.vitals.latest.temperature,
          ...(patch.vitals?.latest?.temperature || {}),
        },
        spo2: {
          ...baseDraft.vitals.latest.spo2,
          ...(patch.vitals?.latest?.spo2 || {}),
        },
        weight: {
          ...baseDraft.vitals.latest.weight,
          ...(patch.vitals?.latest?.weight || {}),
        },
      },
    },
  });
}

function normalizeTranscriptSegment(segment: any): LiveTranscriptSegment {
  return {
    id: String(segment?.id || `seg-${Math.random().toString(36).slice(2, 10)}`),
    speakerRole: segment?.speakerRole || "unknown",
    speakerLabel: segment?.speakerLabel || "Unknown",
    startLabel: segment?.startLabel || "",
    endLabel: segment?.endLabel || "",
    text: String(segment?.text || ""),
    confidence: typeof segment?.confidence === "number" ? segment.confidence : null,
    flags: Array.isArray(segment?.flags) ? segment.flags.filter((flag: unknown) => typeof flag === "string") : [],
    status: segment?.status === "interim" ? "interim" : "final",
  };
}

function deriveEncounterNumber(sessionId: string): string {
  const digits = String(sessionId || "").replace(/\D/g, "");
  if (!digits) return "EN000001";
  return `EN${digits.slice(-6).padStart(6, "0")}`;
}

function deriveEncounterLabel(sessionId: string, _encounterLabel: string): string {
  return deriveEncounterNumber(sessionId);
}

function normalizeTranscriptState(rawTranscript: any) {
  const normalizedSegments = Array.isArray(rawTranscript?.segments)
    ? rawTranscript.segments.map(normalizeTranscriptSegment)
    : [];

  return {
    ...rawTranscript,
    segments: normalizedSegments,
    rawText: String(rawTranscript?.rawText || ""),
    normalizedText: String(rawTranscript?.normalizedText || rawTranscript?.rawText || ""),
    speakers: Array.isArray(rawTranscript?.speakers) ? rawTranscript.speakers : [],
    quality: {
      overallConfidence: typeof rawTranscript?.quality?.overallConfidence === "number" ? rawTranscript.quality.overallConfidence : null,
      lowConfidenceSegmentCount: Number(rawTranscript?.quality?.lowConfidenceSegmentCount || 0),
      speakerAmbiguityCount: Number(rawTranscript?.quality?.speakerAmbiguityCount || 0),
      overlappingSpeechSuspected: Boolean(rawTranscript?.quality?.overlappingSpeechSuspected),
    },
    hasGap: Boolean(rawTranscript?.hasGap),
    interimText: String(rawTranscript?.interimText || ""),
  };
}

export type LiveConversationSession = {
  id: string;
  status: LiveSessionStatus;
  linkedPatient: string;
  encounterLabel: string;
  createdBy: { id: string; username: string; role: string };
  startedAt: string | null;
  updatedAt: string;
  endedAt: string | null;
  durationMs: number;
  documentId: string | null;
  audio: {
    mimeType: string;
    chunkCount: number;
    combinedPath?: string | null;
    durationMs?: number;
  };
  transcript: {
    segments: LiveTranscriptSegment[];
    rawText: string;
    normalizedText: string;
    speakers: Array<{ id: string; label: string; role: LiveSpeakerRole; confidence: number | null }>;
    quality: {
      overallConfidence: number | null;
      lowConfidenceSegmentCount: number;
      speakerAmbiguityCount: number;
      overlappingSpeechSuspected: boolean;
    };
    hasGap: boolean;
    interimText: string;
  };
  draftExtraction: {
    extractedData: LiveDraftExtraction | null;
    reviewItems: LiveReviewItem[];
    lastStableSegmentId: string | null;
  };
  error: string | null;
  transport: {
    connectionState: LiveConnectionState;
    lastError: string | null;
    lastEventAt: string | null;
  };
} & {
  // Computed/normalized fields for UI compatibility
  title: string;
  draft: {
    extractedData: LiveDraftExtraction | null;
    reviewItems: LiveReviewItem[];
  };
  recorder: {
    permission: PermissionState;
    deviceId: string | null;
    deviceLabel: string;
  };
};

const API_BASE = "/api/voice/live";

/**
 * Normalize the API response to include computed fields for UI compatibility
 */
function normalizeSession(session: any): LiveConversationSession {
  const baseSession = { ...session };
  const rawTranscript = baseSession.transcript || {};
  const linkedPatient = normalizeText(baseSession.linkedPatient);
  const normalizedDraftExtraction = normalizeDraftExtraction(baseSession.draftExtraction?.extractedData);
  const transcript = normalizeTranscriptState(rawTranscript);
  const encounterLabel = deriveEncounterLabel(baseSession.id || "", normalizeText(baseSession.encounterLabel));
  const reviewItems = Array.isArray(baseSession.draftExtraction?.reviewItems)
    ? baseSession.draftExtraction.reviewItems
    : [];

  return {
    ...baseSession,
    linkedPatient,
    encounterLabel,
    draftExtraction: {
      extractedData: normalizedDraftExtraction,
      reviewItems,
      lastStableSegmentId:
        typeof baseSession.draftExtraction?.lastStableSegmentId === "string"
          ? baseSession.draftExtraction.lastStableSegmentId
          : null,
    },
    // Computed title from patient and encounter
    get title() {
      return sessionTitle(
        linkedPatient || normalizedDraftExtraction.patient.name,
        encounterLabel,
      );
    },
    // Normalize transcript to add missing UI fields
    transcript,
    draft: {
      extractedData: normalizedDraftExtraction,
      reviewItems,
    },
    // Normalize audio/transport to recorder for UI - will be synced via effect
    recorder: {
      permission: "prompt",
      deviceId: null,
      deviceLabel: "",
    },
    audio: {
      mimeType: baseSession.audio?.mimeType || "audio/webm",
      chunkCount: Number(baseSession.audio?.chunkCount || 0),
      combinedPath: baseSession.audio?.combinedPath || null,
      durationMs: Number(baseSession.audio?.durationMs || 0),
    },
    transport: {
      connectionState: baseSession.transport?.connectionState || "idle",
      lastError: baseSession.transport?.lastError || null,
      lastEventAt: baseSession.transport?.lastEventAt || null,
    },
  };
}

async function apiFetch(endpoint: string, options?: RequestInit) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    const baseMessage = error.error || error.message || "API request failed";
    const detailParts: string[] = [];

    if (Array.isArray(error.missingFields) && error.missingFields.length > 0) {
      detailParts.push(`Missing: ${error.missingFields.join(", ")}`);
    }

    if (typeof error.pendingReview === "number" && error.pendingReview > 0) {
      detailParts.push(`Pending review items: ${error.pendingReview}`);
    }

    throw new Error(detailParts.length > 0 ? `${baseMessage}. ${detailParts.join(". ")}` : baseMessage);
  }

  return response.json();
}

export function formatLiveDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function sessionTitle(linkedPatient: string, encounterLabel: string): string {
  const patientLabel = normalizeText(linkedPatient).trim();
  const encounter = normalizeText(encounterLabel).trim();

  if (patientLabel) return patientLabel;
  if (encounter) return encounter;
  return "New conversation";
}

/**
 * Derive the canonical UI phase from server session status, local recorder state, and transport state.
 * This is the single source of truth for all UI rendering - no other state interpretation should happen.
 *
 * Priority order:
 * 1. Local recorder states - highest priority for user-initiated actions
 * 2. Server status - authoritative for post-capture phases
 * 3. Transport state refines the starting phase
 * 4. Transitional states for proper phase progression
 */
export function deriveCanonicalEncounterPhase(
  sessionStatus: LiveSessionStatus,
  captureState: LiveCaptureState,
  transportState: LiveConnectionState,
): LiveEncounterPhase {
  // Local recorder states - highest priority for user-initiated actions
  if (captureState === "starting") {
    return "starting";
  }

  if (captureState === "stopping") {
    return "ending_upload";
  }

  if (captureState === "recording") {
    return "capturing";
  }

  if (captureState === "paused") {
    return "paused";
  }

  // Post-recording transitional states
  // When capture is idle but we're transitioning from recording to review
  if (captureState === "idle" && sessionStatus === "live" && transportState === "closed") {
    return "transcribing";
  }

  // Server status - authoritative for stable post-capture phases
  if (sessionStatus === "failed") {
    return "failed";
  }

  if (sessionStatus === "finalized") {
    return "finalized";
  }

  if (sessionStatus === "review_required") {
    return "review_ready";
  }

  if (sessionStatus === "finalizing") {
    return "finalizing_document";
  }

  // Live status with idle recorder
  if (sessionStatus === "live" && captureState === "idle") {
    // If transport is connecting/reconnecting, we're starting
    if (transportState === "connecting" || transportState === "reconnecting") {
      return "starting";
    }
    // If we were connected but now idle, we're in transcribing phase
    if (transportState === "closed") {
      return "transcribing";
    }
    // FIX: If recorder is idle but status is live, we're transitioning (not capturing)
    // This happens during session end when we've uploaded but backend hasn't responded yet
    return "transcribing";
  }

  // Paused status with idle recorder means externally paused
  if (sessionStatus === "paused") {
    return "paused";
  }

  // Transport state refines starting phase - must come before draft check
  // This handles the bootstrap edge case where transport is connecting but session is still draft
  if ((sessionStatus === "draft" || sessionStatus === "live") &&
      (transportState === "connecting" || transportState === "reconnecting")) {
    return "starting";
  }

  // Draft status with idle recorder and disconnected transport = ready to start
  if (sessionStatus === "draft" && captureState === "idle" && transportState === "idle") {
    return "draft_ready";
  }

  // Default fallback
  return "draft_ready";
}

/**
 * Get human-readable display copy for the current encounter phase.
 * This replaces the multiple independent copy functions.
 */
export function getEncounterPhaseCopy(phase: LiveEncounterPhase, audioLevel: number) {
  switch (phase) {
    case "draft_ready":
      return {
        title: "Ready to capture",
        detail: "Press Start to let the browser use your default microphone, then speak normally.",
      };
    case "starting":
      return {
        title: "Connecting microphone",
        detail: "Preparing the stream. This takes a moment when a live visit starts.",
      };
    case "capturing":
      return {
        title: audioLevel > 0.06 ? "Listening. Voice detected." : "Listening to your microphone",
        detail: "Audio is being recorded. Transcript and note sections are generated after you end.",
      };
    case "paused":
      return {
        title: "Recording paused",
        detail: "Resume when you are ready to continue capturing audio.",
      };
    case "ending_upload":
      return {
        title: "Ending recording",
        detail: "Processing the final audio chunk and moving this visit into review.",
      };
    case "transcribing":
      return {
        title: "Processing transcript",
        detail: "Final audio is being processed before the review step opens.",
      };
    case "review_ready":
      return {
        title: "Recording complete",
        detail: "Transcript ready for review.",
      };
    case "finalizing_document":
      return {
        title: "Finalizing document",
        detail: "Generating final document and publishing to dashboard.",
      };
    case "finalized":
      return {
        title: "Published",
        detail: "Document has been published to the dashboard.",
      };
    case "failed":
      return {
        title: "Capture failed",
        detail: "An error occurred. Try starting a new session.",
      };
    default:
      return {
        title: "Ready to capture",
        detail: "Press Start to begin.",
      };
  }
}

/**
 * Get transcript panel empty state copy based on canonical phase.
 */
export function getTranscriptEmptyStateCopy(phase: LiveEncounterPhase, audioLevel: number) {
  switch (phase) {
    case "draft_ready":
      return {
        title: "Transcript will appear here",
        detail: "Press Start and speak. The transcript is generated after you end the recording.",
      };
    case "starting":
      return {
        title: "Preparing transcript",
        detail: "The transcript panel will stay empty until recording ends.",
      };
    case "capturing":
      return {
        title: audioLevel > 0.06 ? "Listening now" : "Waiting for speech",
        detail: "Audio is being captured. Transcript generation starts after End.",
      };
    case "paused":
      return {
        title: "Transcript paused",
        detail: "Resume recording to continue audio capture.",
      };
    case "ending_upload":
    case "transcribing":
      return {
        title: "Finishing transcript",
        detail: "Final audio is being processed before the review step opens.",
      };
    case "review_ready":
      return {
        title: "Transcript ready",
        detail: "Review the transcript and note sections before finalizing.",
      };
    default:
      return {
        title: "Transcript will appear here",
        detail: "Press Start and speak.",
      };
  }
}

/**
 * Check if recording is currently active (capturing or paused).
 */
export function isRecordingActive(phase: LiveEncounterPhase): boolean {
  return phase === "capturing" || phase === "paused";
}

/**
 * Check if session is in a post-recording phase (review, finalized).
 * Note: transcribing is NOT included - it's still processing without proper diarization.
 */
export function isPostRecording(phase: LiveEncounterPhase): boolean {
  return ["review_ready", "finalizing_document", "finalized"].includes(phase);
}

/**
 * Check if session can be deleted (not actively recording or finalizing).
 */
export function canDeleteVisit(phase: LiveEncounterPhase): boolean {
  return !["capturing", "paused", "ending_upload", "finalizing_document"].includes(phase);
}

function isActiveCaptureState(captureState: LiveCaptureState): boolean {
  return ["starting", "recording", "paused", "stopping"].includes(captureState);
}

function transcriptSignalScore(transcript: LiveConversationSession["transcript"] | undefined | null): number {
  if (!transcript) return 0;
  return String(transcript.normalizedText || transcript.rawText || "").trim().length
    + (Array.isArray(transcript.segments) ? transcript.segments.length * 120 : 0);
}

function draftSignalScore(draftExtraction: LiveConversationSession["draftExtraction"] | undefined | null): number {
  const draft = normalizeDraftExtraction(draftExtraction?.extractedData);
  return [
    draft.chiefComplaint,
    draft.hpi,
    draft.assessment,
    draft.diagnosis,
    draft.patient.name,
    draft.patient.gender,
    ...draft.ros,
    ...draft.pastHistory,
    ...draft.symptoms,
    ...draft.labs,
    ...draft.radiology,
    ...draft.procedures,
    ...draft.followUp,
    ...draft.plan,
    ...draft.medications.map((item) => `${item.name} ${item.instruction}`.trim()),
  ].reduce((score, value) => score + String(value || "").trim().length, 0)
    + (draft.patient.age ? 5 : 0)
    + (draft.vitals.latest.bp.systolic ? 5 : 0)
    + (draft.vitals.latest.bp.diastolic ? 5 : 0)
    + (draft.vitals.latest.pulse.value ? 5 : 0)
    + (draft.vitals.latest.temperature.value ? 5 : 0)
    + (draft.vitals.latest.spo2.value ? 5 : 0)
    + (draft.vitals.latest.weight.value ? 5 : 0)
    + (Array.isArray(draftExtraction?.reviewItems) ? draftExtraction.reviewItems.length * 20 : 0);
}

function draftContentSignalScore(draftExtraction: LiveConversationSession["draftExtraction"] | undefined | null): number {
  const draft = normalizeDraftExtraction(draftExtraction?.extractedData);
  return [
    draft.chiefComplaint,
    draft.hpi,
    draft.assessment,
    draft.diagnosis,
    draft.patient.name,
    draft.patient.gender,
    ...draft.ros,
    ...draft.pastHistory,
    ...draft.symptoms,
    ...draft.labs,
    ...draft.radiology,
    ...draft.procedures,
    ...draft.followUp,
    ...draft.plan,
    ...draft.medications.map((item) => `${item.name} ${item.instruction}`.trim()),
  ].reduce((score, value) => score + String(value || "").trim().length, 0)
    + (draft.patient.age ? 5 : 0)
    + (draft.vitals.latest.bp.systolic ? 5 : 0)
    + (draft.vitals.latest.bp.diastolic ? 5 : 0)
    + (draft.vitals.latest.pulse.value ? 5 : 0)
    + (draft.vitals.latest.temperature.value ? 5 : 0)
    + (draft.vitals.latest.spo2.value ? 5 : 0)
    + (draft.vitals.latest.weight.value ? 5 : 0);
}

function hasPostEndBackfillSignal(session: LiveConversationSession | undefined | null): boolean {
  if (!session) return false;
  return transcriptSignalScore(session.transcript) > 0
    || draftContentSignalScore(session.draftExtraction) > 0
    || session.status === "finalized"
    || session.status === "failed";
}

function resolveSelectedEncounterPhase(
  session: LiveConversationSession,
  captureState: LiveCaptureState,
  transportState: LiveConnectionState,
): LiveEncounterPhase {
  const phase = deriveCanonicalEncounterPhase(session.status, captureState, transportState);

  if (phase === "review_ready" && session.status === "review_required" && !hasPostEndBackfillSignal(session)) {
    return "transcribing";
  }

  return phase;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function mergeLoadedSessionWithLocal(
  normalized: LiveConversationSession,
  existing: LiveConversationSession | undefined,
  captureState: LiveCaptureState,
): LiveConversationSession {
  if (!existing) {
    return normalized;
  }

  const shouldPreserveLocalStatus = (
    existing.status === "finalizing"
    && !["review_required", "finalized", "failed"].includes(normalized.status)
  ) || (
    isActiveCaptureState(captureState)
    && ["draft", "live", "paused"].includes(existing.status)
    && normalized.status === "draft"
  );

  const nextTranscript = transcriptSignalScore(existing.transcript) > transcriptSignalScore(normalized.transcript)
    ? existing.transcript
    : normalized.transcript;
  const nextDraftExtraction = draftSignalScore(existing.draftExtraction) > draftSignalScore(normalized.draftExtraction)
    ? existing.draftExtraction
    : normalized.draftExtraction;
  const nextDraft = {
    extractedData: nextDraftExtraction.extractedData,
    reviewItems: nextDraftExtraction.reviewItems,
  };
  const shouldPreserveLocalStartedAt = Boolean(existing.startedAt) && (
    isActiveCaptureState(captureState)
    || ["live", "paused", "finalizing"].includes(existing.status)
  );

  return {
    ...normalized,
    status: shouldPreserveLocalStatus ? existing.status : normalized.status,
    startedAt: normalized.startedAt || (shouldPreserveLocalStartedAt ? existing.startedAt : null),
    endedAt: normalized.endedAt || existing.endedAt,
    durationMs: Math.max(Number(normalized.durationMs || 0), Number(existing.durationMs || 0)),
    audio: {
      ...normalized.audio,
      durationMs: Math.max(Number(normalized.audio?.durationMs || 0), Number(existing.audio?.durationMs || 0)),
    },
    transcript: nextTranscript,
    draftExtraction: nextDraftExtraction,
    draft: nextDraft,
    transport: (
      shouldPreserveLocalStatus
      && normalized.transport.connectionState === "idle"
      && existing.transport.connectionState !== "idle"
    )
      ? existing.transport
      : normalized.transport,
  };
}

export function useLiveConversationAPI() {
  const [sessions, setSessions] = useState<LiveConversationSession[]>([]);
  const sessionsRef = useRef<LiveConversationSession[]>([]);
  const loadSessionsRequestSeq = useRef(0);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startActionInProgressRef = useRef(false);
  const postEndRefreshTokensRef = useRef(new Map<string, { cancelled: boolean }>());

  // Keep sessionsRef in sync with sessions state for polling interval
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => () => {
    for (const token of postEndRefreshTokensRef.current.values()) {
      token.cancelled = true;
    }
    postEndRefreshTokensRef.current.clear();
  }, []);

  const applyRealtimeSessionUpdate = useCallback(
    (sessionId: string, updater: (session: LiveConversationSession) => LiveConversationSession) => {
      if (!sessionId) return;
      setSessions((prevSessions) =>
        prevSessions.map((session) => (session.id === sessionId ? updater(session) : session)),
      );
    },
    [],
  );

  const audio = useLiveConversationAudio({
    enableDebugLogs: process.env.NODE_ENV === "development",
    onTranscriptPartial: (sessionId, transcript) => {
      setError(null);
      applyRealtimeSessionUpdate(sessionId, (session) => ({
        ...session,
        transcript: normalizeTranscriptState(transcript),
      }));
    },
    onTranscriptFinal: (sessionId, segment) => {
      applyRealtimeSessionUpdate(sessionId, (session) => {
        const existing = session.transcript.segments.find((seg) => seg.id === segment.id);
        if (existing) {
          return session;
        }
        return {
          ...session,
          transcript: {
            ...session.transcript,
            segments: [...session.transcript.segments, normalizeTranscriptSegment(segment)],
            rawText: [session.transcript.rawText, segment.text].filter(Boolean).join(" ").trim(),
            normalizedText: [session.transcript.normalizedText, segment.text].filter(Boolean).join(" ").trim(),
          },
        };
      });
    },
    onDraftUpdated: (sessionId, draft) => {
      applyRealtimeSessionUpdate(sessionId, (session) => {
        const extractedData = mergeDraftExtraction(session.draft.extractedData, draft);
        return {
          ...session,
          draftExtraction: {
            ...session.draftExtraction,
            extractedData,
          },
          draft: {
            ...session.draft,
            extractedData,
          },
        };
      });
    },
    onSessionStateChange: (sessionId, status) => {
      const now = new Date().toISOString();
      if (status === "live" || status === "paused" || status === "review_required") {
        setError(null);
      }
      applyRealtimeSessionUpdate(sessionId, (session) => ({
        ...session,
        status: (
          session.status === "finalizing"
          && (status === "live" || status === "paused")
            ? "finalizing"
            : ["draft", "live", "paused", "review_required", "finalizing", "finalized", "failed"].includes(status)
              ? status
              : session.status
        ) as LiveSessionStatus,
        startedAt: status === "live" ? (session.startedAt || now) : session.startedAt,
        endedAt: status === "review_required" ? (session.endedAt || now) : session.endedAt,
        durationMs: status === "review_required" && session.startedAt
          ? Math.max(
            Number(session.durationMs || 0),
            Math.max(0, new Date(now).getTime() - new Date(session.startedAt).getTime()),
          )
          : session.durationMs,
        transport: {
          ...session.transport,
          connectionState:
            status === "live"
              ? "connected"
              : status === "paused"
                ? "paused"
                : status === "review_required"
                  ? "closed"
                  : session.transport.connectionState,
          lastError: null,
          lastEventAt: now,
        },
      }));

      if (status === "review_required") {
        void pollSessionBackfill(sessionId);
      }
    },
  });

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) || null;

  // Derive canonical phase for the selected session
  const selectedSessionPhase = selectedSession
    ? resolveSelectedEncounterPhase(selectedSession, audio.recorderState, audio.connectionState)
    : "draft_ready";

  const resolveRecorderState = useCallback((currentRecorder?: LiveConversationSession["recorder"]) => {
    const deviceLabel = audio.selectedDevice && audio.devices.length > 0
      ? (audio.devices.find((device) => device.deviceId === audio.selectedDevice)?.label || audio.selectedDevice)
      : currentRecorder?.deviceLabel || "";

    return {
      permission: audio.permissionState,
      deviceId: audio.selectedDevice,
      deviceLabel,
    };
  }, [audio.devices, audio.permissionState, audio.selectedDevice]);

  const applyOptimisticSessionPatch = useCallback((
    sessionId: string,
    patch: { linkedPatient?: string; encounterLabel?: string; draftPatch?: Partial<LiveDraftExtraction> },
  ) => {
    applyRealtimeSessionUpdate(sessionId, (session) => {
      const mergedDraft = patch.draftPatch
        ? mergeDraftExtraction(session.draft.extractedData, patch.draftPatch)
        : session.draft.extractedData;
      const nextLinkedPatient = patch.linkedPatient !== undefined ? patch.linkedPatient : session.linkedPatient;
      const nextEncounterLabel = patch.encounterLabel !== undefined ? patch.encounterLabel : session.encounterLabel;
      const derivedPatientName = mergedDraft?.patient?.name || "";

      return {
        ...session,
        linkedPatient: nextLinkedPatient,
        encounterLabel: nextEncounterLabel,
        title: sessionTitle(nextLinkedPatient || derivedPatientName, nextEncounterLabel),
        draftExtraction: patch.draftPatch
          ? {
            ...session.draftExtraction,
            extractedData: mergedDraft,
          }
          : session.draftExtraction,
        draft: patch.draftPatch
          ? {
            ...session.draft,
            extractedData: mergedDraft,
          }
          : session.draft,
      };
    });
  }, [applyRealtimeSessionUpdate]);

  const loadSessions = useCallback(async (): Promise<LiveConversationSession[]> => {
    const requestSeq = ++loadSessionsRequestSeq.current;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/sessions");
      const normalizedSessions = (data.sessions || []).map((session: any) => {
        const normalized = normalizeSession(session);
        const existing = sessionsRef.current.find((currentSession) => currentSession.id === normalized.id);
        const merged = mergeLoadedSessionWithLocal(normalized, existing, audio.recorderState);

        if (normalized.id === selectedSessionId) {
          return {
            ...merged,
            recorder: resolveRecorderState(existing?.recorder),
          };
        }

        if (existing) {
          return {
            ...merged,
            recorder: existing.recorder,
          };
        }

        return merged;
      });
      if (requestSeq !== loadSessionsRequestSeq.current) {
        return [];
      }
      setSessions(normalizedSessions);
      setSelectedSessionId((currentSelectedSessionId) => {
        if (currentSelectedSessionId && normalizedSessions.some((session) => session.id === currentSelectedSessionId)) {
          return currentSelectedSessionId;
        }
        return normalizedSessions[0]?.id || null;
      });
      return normalizedSessions;
    } catch (err) {
      if (requestSeq === loadSessionsRequestSeq.current) {
        setError(err instanceof Error ? err.message : "Failed to load sessions");
      }
      return [];
    } finally {
      if (requestSeq === loadSessionsRequestSeq.current) {
        setIsLoading(false);
      }
    }
  }, [audio.recorderState, resolveRecorderState, selectedSessionId]);

  const pollSessionBackfill = useCallback(async (sessionId: string) => {
    if (!sessionId) return;

    const previousToken = postEndRefreshTokensRef.current.get(sessionId);
    if (previousToken) {
      previousToken.cancelled = true;
    }

    const token = { cancelled: false };
    postEndRefreshTokensRef.current.set(sessionId, token);

    const startedAt = Date.now();
    const timeoutMs = 120000;
    const intervalMs = 2500;

    try {
      while (!token.cancelled && Date.now() - startedAt <= timeoutMs) {
        const loadedSessions = await loadSessions();
        const refreshedSession = loadedSessions.find((session) => session.id === sessionId)
          || sessionsRef.current.find((session) => session.id === sessionId);

        if (hasPostEndBackfillSignal(refreshedSession)) {
          break;
        }

        await wait(intervalMs);
      }
    } finally {
      if (postEndRefreshTokensRef.current.get(sessionId) === token) {
        postEndRefreshTokensRef.current.delete(sessionId);
      }
    }
  }, [loadSessions]);

  const applyServerSession = useCallback((sessionPayload: any) => {
    if (!sessionPayload?.id) return null;

    const normalized = normalizeSession(sessionPayload);
    setSessions((prevSessions) => {
      const existing = prevSessions.find((session) => session.id === normalized.id);
      const nextSession = {
        ...normalized,
        recorder: normalized.id === selectedSessionId
          ? resolveRecorderState(existing?.recorder)
          : existing?.recorder || normalized.recorder,
      };

      if (prevSessions.some((session) => session.id === normalized.id)) {
        return prevSessions.map((session) => (session.id === normalized.id ? nextSession : session));
      }
      return [nextSession, ...prevSessions];
    });

    return normalized;
  }, [audio.recorderState, resolveRecorderState, selectedSessionId]);

  const createSession = useCallback(async (params?: { linkedPatient?: string; encounterLabel?: string }) => {
    setIsLoading(true);
    setError(null);
    try {
      const safeParams =
        params && typeof params === "object" && !("nativeEvent" in params)
          ? {
              linkedPatient: typeof params.linkedPatient === "string" ? params.linkedPatient : undefined,
              encounterLabel: typeof params.encounterLabel === "string" ? params.encounterLabel : undefined,
            }
          : {};
      const data = await apiFetch("/sessions", {
        method: "POST",
        body: JSON.stringify(safeParams),
      });
      const normalized = normalizeSession(data);
      const optimisticSession = {
        ...normalized,
        recorder: resolveRecorderState(undefined),
      };

      setSessions((prevSessions) => [
        optimisticSession,
        ...prevSessions.filter((session) => session.id !== optimisticSession.id),
      ]);
      setSelectedSessionId(optimisticSession.id);
      await loadSessions();
      return normalized;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [loadSessions, resolveRecorderState, applyRealtimeSessionUpdate]);

  const updateSession = useCallback(async (sessionId: string, updates: { linkedPatient?: string; encounterLabel?: string; draftPatch?: Partial<LiveDraftExtraction> }) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      applyServerSession(data);
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update session");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [applyServerSession, loadSessions]);

  const pauseSession = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await apiFetch(`/sessions/${sessionId}/pause`, { method: "POST" });
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pause session");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [loadSessions]);

  const resumeSession = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await apiFetch(`/sessions/${sessionId}/resume`, { method: "POST" });
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resume session");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [loadSessions]);

  const resolveReviewItem = useCallback(async (sessionId: string, reviewItemId: string, resolution: LiveReviewResolution, editedValue?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/sessions/${sessionId}/review`, {
        method: "POST",
        body: JSON.stringify({ reviewItemId, resolution, editedValue }),
      });
      applyServerSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve review item");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [applyServerSession]);

  const finalizeSession = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/sessions/${sessionId}/finalize`, { method: "POST" });
      await loadSessions();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to finalize session");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [loadSessions]);

  const deleteSession = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await apiFetch(`/sessions/${sessionId}`, { method: "DELETE" });
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete session");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [loadSessions]);

  const deleteRecording = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await apiFetch(`/sessions/${sessionId}/audio`, { method: "DELETE" });
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete recording");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [loadSessions]);

  const deleteFinalizedVisit = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await apiFetch(`/sessions/${sessionId}/finalized-visit`, { method: "DELETE" });
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete finalized visit");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [loadSessions]);

  const startSession = useCallback(async (sessionId: string, deviceId?: string) => {
    setError(null);
    try {
      await audio.startSession(sessionId, deviceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start session");
      throw err;
    }
  }, [audio]);

  const pauseRecording = useCallback(() => {
    audio.pauseSession();
  }, [audio]);

  const resumeRecording = useCallback(() => {
    audio.resumeSession();
  }, [audio]);

  const endRecording = useCallback(async () => {
    await audio.endSession();
  }, [audio]);

  const disconnectAudio = useCallback(() => {
    audio.disconnect();
  }, [audio]);

  const hasPendingReview = (selectedSession?.draft?.reviewItems || [])
    .some((item) => item.resolution === "pending");

  useEffect(() => {
    loadSessions();

    // Poll for updates when a live/paused/review session is selected
    const interval = setInterval(() => {
      if (selectedSessionId) {
        // Use ref to get fresh sessions state, avoiding stale closure
        const currentSession = sessionsRef.current.find(s => s.id === selectedSessionId);
        if (
          currentSession
          && (
            ["live", "paused", "review_required"].includes(currentSession.status)
            || isActiveCaptureState(audio.recorderState)
          )
        ) {
          loadSessions();
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [audio.recorderState, loadSessions, selectedSessionId]);

  // Sync audio state to selected session's recorder field
  useEffect(() => {
    if (selectedSessionId) {
      setSessions((prevSessions) =>
        prevSessions.map((s) => {
          if (s.id === selectedSessionId) {
            const deviceLabel = audio.selectedDevice && audio.devices.length > 0
              ? (audio.devices.find(d => d.deviceId === audio.selectedDevice)?.label || audio.selectedDevice)
              : s.recorder.deviceLabel;
            const shouldForceLive = audio.recorderState === "recording"
              && !["review_required", "finalizing", "finalized"].includes(s.status);
            const shouldForcePaused = audio.recorderState === "paused"
              && !["review_required", "finalizing", "finalized"].includes(s.status);
            const shouldForceFinalizing = audio.recorderState === "stopping"
              && !["review_required", "finalized"].includes(s.status);
            const nextStatus = shouldForceLive
              ? "live"
              : shouldForcePaused
                ? "paused"
                : shouldForceFinalizing
                  ? "finalizing"
                : s.status;
            const startedAt = shouldForceLive ? (s.startedAt || new Date().toISOString()) : s.startedAt;
            const startedAtMs = startedAt ? new Date(startedAt).getTime() : NaN;
            const durationMs = shouldForceLive && Number.isFinite(startedAtMs)
              ? Math.max(Number(s.durationMs || 0), Math.max(0, Date.now() - startedAtMs))
              : s.durationMs;

            return {
              ...s,
              status: nextStatus,
              startedAt,
              durationMs,
              recorder: {
                ...s.recorder,
                permission: audio.permissionState,
                deviceId: audio.selectedDevice,
                deviceLabel,
              },
              transport: {
                ...s.transport,
                connectionState: shouldForceLive
                  ? "connected"
                  : shouldForcePaused
                    ? "paused"
                    : audio.connectionState,
              },
            };
          }
          return s;
        })
      );
    }
  }, [selectedSessionId, audio.permissionState, audio.selectedDevice, audio.devices, audio.connectionState, audio.recorderState]);

  useEffect(() => {
    if (
      !selectedSessionId
      || !(
        selectedSession?.status === "live"
        || audio.recorderState === "recording"
        || audio.recorderState === "starting"
      )
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      setSessions((prevSessions) =>
        prevSessions.map((session) => {
          if (session.id !== selectedSessionId || !session.startedAt) return session;

          const startedAtMs = new Date(session.startedAt).getTime();
          if (!Number.isFinite(startedAtMs)) return session;

          if (
            session.status !== "live"
            && audio.recorderState !== "recording"
            && audio.recorderState !== "starting"
          ) {
            return session;
          }

          return {
            ...session,
            durationMs: Math.max(Number(session.durationMs || 0), Math.max(0, Date.now() - startedAtMs)),
          };
        }),
      );
    }, 1000);

    return () => window.clearInterval(interval);
  }, [audio.recorderState, selectedSession?.status, selectedSessionId]);

  return {
    isPreview: false,
    isLoading,
    error,
    sessions,
    selectedSession,
    selectedSessionId,
    selectedSessionPhase,
    hasPendingReview,
    availableDevices: audio.devices.map((d) => ({ id: d.deviceId, label: d.label || d.deviceId })),
    createDraftSession: createSession,
    selectSession: setSelectedSessionId,
    returnToDraft: () => {
      const draft = sessions.find((s) => s.status === "draft");
      if (draft) {
        setSelectedSessionId(draft.id);
      } else {
        createSession();
      }
    },
    updateSelectedSession: async (patch: Partial<LiveConversationSession> & { draftPatch?: Partial<LiveDraftExtraction>; deviceId?: string }) => {
      if (selectedSessionId) {
        applyRealtimeSessionUpdate(selectedSessionId, (session) => {
          const derivedPatientName = session.draftExtraction?.extractedData?.patient?.name;
          const nextLinkedPatient = patch.linkedPatient !== undefined ? patch.linkedPatient : session.linkedPatient;
          const nextEncounterLabel = patch.encounterLabel !== undefined ? patch.encounterLabel : session.encounterLabel;
          return {
            ...session,
            linkedPatient: nextLinkedPatient,
            encounterLabel: nextEncounterLabel,
            title: sessionTitle(nextLinkedPatient || derivedPatientName, nextEncounterLabel),
            recorder: patch.deviceId !== undefined ? {
              ...session.recorder,
              deviceId: patch.deviceId,
            } : session.recorder,
            draftExtraction: patch.draftPatch
              ? {
                ...session.draftExtraction,
                extractedData: {
                  ...session.draftExtraction?.extractedData,
                  ...patch.draftPatch,
                },
              }
              : session.draftExtraction,
          };
        });
      }

      if (
        selectedSessionId
        && (
          patch.linkedPatient !== undefined
          || patch.encounterLabel !== undefined
          || patch.draftPatch !== undefined
        )
      ) {
        applyOptimisticSessionPatch(selectedSessionId, patch);
        await updateSession(selectedSessionId, {
          linkedPatient: patch.linkedPatient,
          encounterLabel: patch.encounterLabel,
          draftPatch: patch.draftPatch,
        });
      }
    },
    startSelectedSession: async () => {
      if (startActionInProgressRef.current) return;

      if (selectedSessionId) {
        startActionInProgressRef.current = true;
        try {
          const now = new Date().toISOString();
          applyRealtimeSessionUpdate(selectedSessionId, (session) => ({
            ...session,
            endedAt: null,
            transport: {
              ...session.transport,
              connectionState: "connecting",
              lastError: null,
              lastEventAt: now,
            },
          }));
          // Prefer session's selected device over audio hook's device
          const deviceId = selectedSession?.recorder?.deviceId || audio.selectedDevice || undefined;
          await startSession(selectedSessionId, deviceId);
          applyRealtimeSessionUpdate(selectedSessionId, (session) => ({
            ...session,
            status: "live",
            startedAt: session.startedAt || new Date().toISOString(),
            transport: {
              ...session.transport,
              connectionState: "connected",
              lastError: null,
              lastEventAt: new Date().toISOString(),
            },
          }));
          await loadSessions();
        } finally {
          startActionInProgressRef.current = false;
        }
      }
    },
    pauseSelectedSession: async () => {
      if (selectedSessionId) {
        await pauseSession(selectedSessionId);
        pauseRecording();
      }
    },
    resumeSelectedSession: async () => {
      if (selectedSessionId) {
        await resumeSession(selectedSessionId);
        resumeRecording();
      }
    },
    stopSelectedSession: async () => {
      if (selectedSessionId) {
        const now = new Date().toISOString();
        applyRealtimeSessionUpdate(selectedSessionId, (session) => {
          const startedAtMs = session.startedAt ? new Date(session.startedAt).getTime() : NaN;
          const durationMs = Number.isFinite(startedAtMs)
            ? Math.max(Number(session.durationMs || 0), Math.max(0, new Date(now).getTime() - startedAtMs))
            : Number(session.durationMs || 0);
          return {
            ...session,
            // Set to review_required immediately when user clicks stop
            status: "review_required",
            endedAt: now,
            durationMs,
            transport: {
              ...session.transport,
              lastError: null,
              lastEventAt: now,
            },
          };
        });
      }
      await endRecording();
      if (selectedSessionId) {
        void pollSessionBackfill(selectedSessionId);
      } else {
        await loadSessions();
      }
    },
    captureState: audio.recorderState,
    transportState: audio.connectionState,
    audioLevel: audio.audioLevel,
    disconnectAudio,
    resolveReviewItem: async (reviewItemId: string, resolution: LiveReviewResolution, editedValue?: string) => {
      if (selectedSessionId) {
        await resolveReviewItem(selectedSessionId, reviewItemId, resolution, editedValue);
      }
    },
    finalizeSelectedSession: async () => {
      if (selectedSessionId) {
        await finalizeSession(selectedSessionId);
      }
    },
    deleteSelectedRecording: async () => {
      if (selectedSessionId) {
        await deleteRecording(selectedSessionId);
      }
    },
    deleteSelectedFinalizedVisit: async () => {
      if (selectedSessionId) {
        await deleteFinalizedVisit(selectedSessionId);
      }
    },
    deleteSession,
    deleteRecording,
    deleteFinalizedVisit,
    refreshSessions: loadSessions,
  };
}
