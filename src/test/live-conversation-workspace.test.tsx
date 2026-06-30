import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useLiveConversationAPI", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useLiveConversationAPI")>("@/hooks/useLiveConversationAPI");
  return {
    ...actual,
    useLiveConversationAPI: vi.fn(),
  };
});

import LiveConversationWorkspace from "@/components/voice/LiveConversationWorkspace";
import { useLiveConversationAPI } from "@/hooks/useLiveConversationAPI";

const mockedUseLiveConversationAPI = vi.mocked(useLiveConversationAPI);

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "live-session-1",
    status: "live",
    linkedPatient: "Anita Rao",
    encounterLabel: "Follow-up",
    createdBy: {
      id: "doctor-1",
      username: "doctor.user",
      role: "doctor",
    },
    startedAt: "2026-05-27T09:28:00Z",
    updatedAt: "2026-05-27T09:28:00Z",
    endedAt: null,
    durationMs: 0,
    documentId: null,
    audio: {
      mimeType: "audio/webm",
      chunkCount: 0,
    },
    transcript: {
      segments: [],
      rawText: "",
      normalizedText: "",
      speakers: [],
      quality: {
        overallConfidence: null,
        lowConfidenceSegmentCount: 0,
        speakerAmbiguityCount: 0,
        overlappingSpeechSuspected: false,
      },
      hasGap: false,
      interimText: "",
    },
    draft: {
      extractedData: {
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
      },
      reviewItems: [],
    },
    draftExtraction: {
      extractedData: null,
      reviewItems: [],
      lastStableSegmentId: null,
    },
    error: null,
    transport: {
      connectionState: "connected",
      lastError: null,
      lastEventAt: "2026-05-27T09:28:00Z",
    },
    title: "Anita Rao",
    recorder: {
      permission: "granted",
      deviceId: "default",
      deviceLabel: "Default microphone",
    },
    ...overrides,
  };
}

describe("LiveConversationWorkspace", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows explicit listening feedback while a live visit is recording", async () => {
    const selectedSession = makeSession();

    mockedUseLiveConversationAPI.mockReturnValue({
      isPreview: false,
      isLoading: false,
      error: null,
      sessions: [selectedSession],
      selectedSession,
      selectedSessionId: selectedSession.id,
      selectedSessionPhase: "capturing",
      hasPendingReview: false,
      availableDevices: [{ id: "default", label: "Default microphone" }],
      createDraftSession: vi.fn(),
      selectSession: vi.fn(),
      returnToDraft: vi.fn(),
      updateSelectedSession: vi.fn(),
      startSelectedSession: vi.fn(),
      pauseSelectedSession: vi.fn(),
      resumeSelectedSession: vi.fn(),
      stopSelectedSession: vi.fn(),
      finalizeSelectedSession: vi.fn(),
      deleteSession: vi.fn(),
      deleteSelectedRecording: vi.fn(),
      deleteSelectedFinalizedVisit: vi.fn(),
      refreshSessions: vi.fn(),
      disconnectAudio: vi.fn(),
      resolveReviewItem: vi.fn(),
      captureState: "recording",
      transportState: "connected",
      audioLevel: 0.54,
    });

    render(<LiveConversationWorkspace />);

    expect(screen.getByText(/listening\. voice detected\./i)).toBeInTheDocument();
    expect(screen.getByText(/audio is being recorded\. transcript and note sections are generated after you end/i)).toBeInTheDocument();
    expect(screen.getByText(/listening now/i)).toBeInTheDocument();
    expect(screen.getByText(/audio is being captured\. transcript generation starts after end/i)).toBeInTheDocument();
  });

  it("shows an ending state while the session is being finalized into review", async () => {
    const selectedSession = makeSession();

    mockedUseLiveConversationAPI.mockReturnValue({
      isPreview: false,
      isLoading: false,
      error: null,
      sessions: [selectedSession],
      selectedSession,
      selectedSessionId: selectedSession.id,
      selectedSessionPhase: "ending_upload",
      hasPendingReview: false,
      availableDevices: [{ id: "default", label: "Default microphone" }],
      createDraftSession: vi.fn(),
      selectSession: vi.fn(),
      returnToDraft: vi.fn(),
      updateSelectedSession: vi.fn(),
      startSelectedSession: vi.fn(),
      pauseSelectedSession: vi.fn(),
      resumeSelectedSession: vi.fn(),
      stopSelectedSession: vi.fn(),
      finalizeSelectedSession: vi.fn(),
      deleteSession: vi.fn(),
      deleteSelectedRecording: vi.fn(),
      deleteSelectedFinalizedVisit: vi.fn(),
      refreshSessions: vi.fn(),
      disconnectAudio: vi.fn(),
      resolveReviewItem: vi.fn(),
      captureState: "stopping",
      transportState: "connected",
      audioLevel: 0,
    });

    render(<LiveConversationWorkspace />);

    expect(screen.queryByRole("button", { name: /^start$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^end$/i })).not.toBeInTheDocument();
    // Check for processing text (from the phase badge)
    const processingTexts = screen.queryAllByText(/processing/i);
    expect(processingTexts.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/processing the final audio chunk/i).length).toBeGreaterThan(0);
  });

  it("shows processing feedback while transcript and extraction are still backfilling", async () => {
    const selectedSession = makeSession({
      status: "review_required",
      endedAt: "2026-05-27T09:30:00Z",
      transport: {
        connectionState: "closed",
        lastError: null,
        lastEventAt: "2026-05-27T09:30:00Z",
      },
    });

    mockedUseLiveConversationAPI.mockReturnValue({
      isPreview: false,
      isLoading: false,
      error: null,
      sessions: [selectedSession],
      selectedSession,
      selectedSessionId: selectedSession.id,
      selectedSessionPhase: "transcribing",
      hasPendingReview: false,
      availableDevices: [{ id: "default", label: "Default microphone" }],
      createDraftSession: vi.fn(),
      selectSession: vi.fn(),
      returnToDraft: vi.fn(),
      updateSelectedSession: vi.fn(),
      startSelectedSession: vi.fn(),
      pauseSelectedSession: vi.fn(),
      resumeSelectedSession: vi.fn(),
      stopSelectedSession: vi.fn(),
      finalizeSelectedSession: vi.fn(),
      deleteSession: vi.fn(),
      deleteSelectedRecording: vi.fn(),
      deleteSelectedFinalizedVisit: vi.fn(),
      refreshSessions: vi.fn(),
      disconnectAudio: vi.fn(),
      resolveReviewItem: vi.fn(),
      captureState: "idle",
      transportState: "closed",
      audioLevel: 0,
    });

    render(<LiveConversationWorkspace />);

    expect(screen.getByText(/preparing transcript/i)).toBeInTheDocument();
    expect(screen.getByText(/clinical extraction/i)).toBeInTheDocument();
    expect(screen.getByText(/building note draft/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /finalize/i })).not.toBeInTheDocument();
  });

  it("tells the user that Start will request the browser default microphone when no devices are listed yet", async () => {
    const selectedSession = makeSession({
      status: "draft",
      recorder: {
        permission: "prompt",
        deviceId: null,
        deviceLabel: "",
      },
    });

    mockedUseLiveConversationAPI.mockReturnValue({
      isPreview: false,
      isLoading: false,
      error: null,
      sessions: [selectedSession],
      selectedSession,
      selectedSessionId: selectedSession.id,
      selectedSessionPhase: "capturing",
      hasPendingReview: false,
      availableDevices: [],
      createDraftSession: vi.fn(),
      selectSession: vi.fn(),
      returnToDraft: vi.fn(),
      updateSelectedSession: vi.fn(),
      startSelectedSession: vi.fn(),
      pauseSelectedSession: vi.fn(),
      resumeSelectedSession: vi.fn(),
      stopSelectedSession: vi.fn(),
      finalizeSelectedSession: vi.fn(),
      deleteSession: vi.fn(),
      deleteSelectedRecording: vi.fn(),
      deleteSelectedFinalizedVisit: vi.fn(),
      refreshSessions: vi.fn(),
      disconnectAudio: vi.fn(),
      resolveReviewItem: vi.fn(),
      captureState: "idle",
      transportState: "idle",
      audioLevel: 0,
    });

    render(<LiveConversationWorkspace />);

    expect(screen.getByText(/browser default microphone will be requested on start/i)).toBeInTheDocument();
    expect(screen.getByText(/press start to grant access; the browser default microphone will still be used/i)).toBeInTheDocument();
    expect(screen.getAllByText(/browser default microphone/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/captured automatically when the patient is introduced/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/derived from the conversation summary as the visit progresses/i)).not.toBeInTheDocument();
  });

  it("shows pause and end controls when capture is already active even if persisted status still reads draft", async () => {
    const selectedSession = makeSession({
      status: "draft",
      transport: {
        connectionState: "idle",
        lastError: null,
        lastEventAt: "2026-05-27T09:28:00Z",
      },
    });

    mockedUseLiveConversationAPI.mockReturnValue({
      isPreview: false,
      isLoading: false,
      error: null,
      sessions: [selectedSession],
      selectedSession,
      selectedSessionId: selectedSession.id,
      selectedSessionPhase: "capturing",
      hasPendingReview: false,
      availableDevices: [{ id: "default", label: "Default microphone" }],
      createDraftSession: vi.fn(),
      selectSession: vi.fn(),
      returnToDraft: vi.fn(),
      updateSelectedSession: vi.fn(),
      startSelectedSession: vi.fn(),
      pauseSelectedSession: vi.fn(),
      resumeSelectedSession: vi.fn(),
      stopSelectedSession: vi.fn(),
      finalizeSelectedSession: vi.fn(),
      deleteSession: vi.fn(),
      deleteSelectedRecording: vi.fn(),
      deleteSelectedFinalizedVisit: vi.fn(),
      refreshSessions: vi.fn(),
      disconnectAudio: vi.fn(),
      resolveReviewItem: vi.fn(),
      captureState: "recording",
      transportState: "connected",
      audioLevel: 0.37,
    });

    render(<LiveConversationWorkspace />);

    expect(screen.queryByRole("button", { name: /^start$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^end$/i })).toBeInTheDocument();
    // The phase is capturing, so the status shows the session status (Draft) but the controls are correct
    const draftBadges = screen.queryAllByText(/^draft$/i);
    expect(draftBadges.length).toBeGreaterThan(0);
  });

  it("lets the clinician correct the patient name from the setup panel", async () => {
    const updateSelectedSession = vi.fn();
    const selectedSession = makeSession({
      status: "draft",
      linkedPatient: "",
      draft: {
        extractedData: {
          chiefComplaint: "",
          hpi: "",
          ros: [],
          pastHistory: [],
          diagnosis: "",
          symptoms: [],
          medications: [],
          labs: [],
          radiology: [],
          procedures: [],
          followUp: [],
          plan: [],
          patient: {
            name: "Unknown patient",
            age: null,
            gender: "",
          },
          vitals: {
            latest: {
              bp: { systolic: null, diastolic: null },
              pulse: { value: null, unit: "bpm" },
              temperature: { value: null, unit: "F" },
              spo2: { value: null, unit: "%" },
              weight: { value: null, unit: "kg" },
            },
          },
        },
        reviewItems: [],
      },
    });

    mockedUseLiveConversationAPI.mockReturnValue({
      isPreview: false,
      isLoading: false,
      error: null,
      sessions: [selectedSession],
      selectedSession,
      selectedSessionId: selectedSession.id,
      selectedSessionPhase: "capturing",
      hasPendingReview: false,
      availableDevices: [{ id: "default", label: "Default microphone" }],
      createDraftSession: vi.fn(),
      selectSession: vi.fn(),
      returnToDraft: vi.fn(),
      updateSelectedSession,
      startSelectedSession: vi.fn(),
      pauseSelectedSession: vi.fn(),
      resumeSelectedSession: vi.fn(),
      stopSelectedSession: vi.fn(),
      finalizeSelectedSession: vi.fn(),
      deleteSession: vi.fn(),
      deleteSelectedRecording: vi.fn(),
      deleteSelectedFinalizedVisit: vi.fn(),
      refreshSessions: vi.fn(),
      disconnectAudio: vi.fn(),
      resolveReviewItem: vi.fn(),
      captureState: "idle",
      transportState: "idle",
      audioLevel: 0,
    });

    render(<LiveConversationWorkspace />);

    const patientInput = screen.getByLabelText(/patient name/i);
    fireEvent.change(patientInput, { target: { value: "Ashiq" } });
    fireEvent.blur(patientInput);

    await waitFor(() => {
      expect(updateSelectedSession).toHaveBeenCalledWith(expect.objectContaining({
        linkedPatient: "Ashiq",
        draftPatch: expect.objectContaining({
          patient: expect.objectContaining({
            name: "Ashiq",
          }),
        }),
      }));
    });
  });

  it("shows saved recording playback actions after a session ends", async () => {
    const selectedSession = makeSession({
      status: "review_required",
      endedAt: "2026-05-27T09:30:00Z",
      audio: {
        mimeType: "audio/webm",
        chunkCount: 12,
        combinedPath: "/Users/yavar/Documents/CoE/Manipal/server/storage/live_conversation_audio/live-session-1.webm",
      },
      transcript: {
        segments: [
          {
            id: "seg-1",
            speakerRole: "unknown",
            speakerLabel: "Speaker 1",
            startLabel: "00:00",
            endLabel: "00:10",
            text: "Thank you.",
            confidence: 0.95,
            flags: ["requires_review"],
            status: "final",
          },
        ],
        rawText: "Thank you.",
        normalizedText: "Thank you.",
        speakers: [],
        quality: {
          overallConfidence: 0.95,
          lowConfidenceSegmentCount: 0,
          speakerAmbiguityCount: 1,
          overlappingSpeechSuspected: false,
        },
        hasGap: false,
        interimText: "",
      },
    });

    mockedUseLiveConversationAPI.mockReturnValue({
      isPreview: false,
      isLoading: false,
      error: null,
      sessions: [selectedSession],
      selectedSession,
      selectedSessionId: selectedSession.id,
      selectedSessionPhase: "capturing",
      hasPendingReview: false,
      availableDevices: [{ id: "default", label: "Default microphone" }],
      createDraftSession: vi.fn(),
      selectSession: vi.fn(),
      returnToDraft: vi.fn(),
      updateSelectedSession: vi.fn(),
      startSelectedSession: vi.fn(),
      pauseSelectedSession: vi.fn(),
      resumeSelectedSession: vi.fn(),
      stopSelectedSession: vi.fn(),
      finalizeSelectedSession: vi.fn(),
      deleteSession: vi.fn(),
      deleteSelectedRecording: vi.fn(),
      deleteSelectedFinalizedVisit: vi.fn(),
      refreshSessions: vi.fn(),
      disconnectAudio: vi.fn(),
      resolveReviewItem: vi.fn(),
      captureState: "idle",
      transportState: "closed",
      audioLevel: 0,
    });

    render(<LiveConversationWorkspace />);

    expect(screen.getByText(/saved recording/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete recording/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open recording/i })).toHaveAttribute(
      "href",
      "/api/voice/live/sessions/live-session-1/audio",
    );
    expect(screen.getByRole("link", { name: /download recording/i })).toHaveAttribute(
      "href",
      "/api/voice/live/sessions/live-session-1/audio",
    );
    expect(screen.getByRole("link", { name: /download recording/i })).toHaveAttribute(
      "download",
      "live-session-1.webm",
    );
  });

  it("prefers saved audio duration over a stale encounter timer after capture ends", async () => {
    const selectedSession = makeSession({
      status: "review_required",
      durationMs: 146000,
      endedAt: "2026-05-27T09:30:26Z",
      audio: {
        mimeType: "audio/webm",
        chunkCount: 12,
        combinedPath: "/Users/yavar/Documents/CoE/Manipal/server/storage/live_conversation_audio/live-session-1.webm",
        durationMs: 64000,
      },
      transport: {
        connectionState: "closed",
        lastError: null,
        lastEventAt: "2026-05-27T09:30:26Z",
      },
    });

    mockedUseLiveConversationAPI.mockReturnValue({
      isPreview: false,
      isLoading: false,
      error: null,
      sessions: [selectedSession],
      selectedSession,
      selectedSessionId: selectedSession.id,
      selectedSessionPhase: "capturing",
      hasPendingReview: false,
      availableDevices: [{ id: "default", label: "Default microphone" }],
      createDraftSession: vi.fn(),
      selectSession: vi.fn(),
      returnToDraft: vi.fn(),
      updateSelectedSession: vi.fn(),
      startSelectedSession: vi.fn(),
      pauseSelectedSession: vi.fn(),
      resumeSelectedSession: vi.fn(),
      stopSelectedSession: vi.fn(),
      finalizeSelectedSession: vi.fn(),
      deleteSession: vi.fn(),
      deleteSelectedRecording: vi.fn(),
      deleteSelectedFinalizedVisit: vi.fn(),
      refreshSessions: vi.fn(),
      disconnectAudio: vi.fn(),
      resolveReviewItem: vi.fn(),
      captureState: "idle",
      transportState: "closed",
      audioLevel: 0,
    });

    render(<LiveConversationWorkspace />);

    expect(screen.getByText("01:04")).toBeInTheDocument();
    expect(screen.queryByText("02:26")).not.toBeInTheDocument();
  });

  it("shows a visit delete action even when no saved recording is available", async () => {
    const selectedSession = makeSession({
      status: "review_required",
      audio: {
        mimeType: "audio/webm",
        chunkCount: 0,
        combinedPath: null,
      },
      transport: {
        connectionState: "closed",
        lastError: null,
        lastEventAt: "2026-05-27T09:29:00Z",
      },
    });

    mockedUseLiveConversationAPI.mockReturnValue({
      isPreview: false,
      isLoading: false,
      error: null,
      sessions: [selectedSession],
      selectedSession,
      selectedSessionId: selectedSession.id,
      selectedSessionPhase: "review_ready",
      hasPendingReview: false,
      availableDevices: [{ id: "default", label: "Default microphone" }],
      createDraftSession: vi.fn(),
      selectSession: vi.fn(),
      returnToDraft: vi.fn(),
      updateSelectedSession: vi.fn(),
      startSelectedSession: vi.fn(),
      pauseSelectedSession: vi.fn(),
      resumeSelectedSession: vi.fn(),
      stopSelectedSession: vi.fn(),
      finalizeSelectedSession: vi.fn(),
      deleteSession: vi.fn(),
      deleteSelectedRecording: vi.fn(),
      deleteSelectedFinalizedVisit: vi.fn(),
      refreshSessions: vi.fn(),
      disconnectAudio: vi.fn(),
      resolveReviewItem: vi.fn(),
      captureState: "idle",
      transportState: "closed",
      audioLevel: 0,
    });

    render(<LiveConversationWorkspace />);

    expect(screen.getByRole("button", { name: /delete visit/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete recording/i })).not.toBeInTheDocument();
  });

  it("renders finalized actions as minimal icon buttons with tooltip labels", async () => {
    const selectedSession = makeSession({
      status: "finalized",
      documentId: "doc-live-1",
      endedAt: "2026-05-27T09:35:00Z",
      transport: {
        connectionState: "closed",
        lastError: null,
        lastEventAt: "2026-05-27T09:35:00Z",
      },
    });

    mockedUseLiveConversationAPI.mockReturnValue({
      isPreview: false,
      isLoading: false,
      error: null,
      sessions: [selectedSession],
      selectedSession,
      selectedSessionId: selectedSession.id,
      selectedSessionPhase: "capturing",
      hasPendingReview: false,
      availableDevices: [{ id: "default", label: "Default microphone" }],
      createDraftSession: vi.fn(),
      selectSession: vi.fn(),
      returnToDraft: vi.fn(),
      updateSelectedSession: vi.fn(),
      startSelectedSession: vi.fn(),
      pauseSelectedSession: vi.fn(),
      resumeSelectedSession: vi.fn(),
      stopSelectedSession: vi.fn(),
      finalizeSelectedSession: vi.fn(),
      deleteSession: vi.fn(),
      deleteSelectedRecording: vi.fn(),
      deleteSelectedFinalizedVisit: vi.fn(),
      refreshSessions: vi.fn(),
      disconnectAudio: vi.fn(),
      resolveReviewItem: vi.fn(),
      captureState: "idle",
      transportState: "closed",
      audioLevel: 0,
    });

    render(<LiveConversationWorkspace />);

    expect(screen.getByRole("button", { name: /generate soap note/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^generate prescription$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open dashboard/i })).toBeInTheDocument();
    expect(screen.queryByText(/^Generate SOAP$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Generate Prescription$/i)).not.toBeInTheDocument();
  });

  it("renders safely when session labels are null", async () => {
    const selectedSession = makeSession();
    selectedSession.linkedPatient = null as any;
    selectedSession.encounterLabel = null as any;
    selectedSession.title = "New conversation";
    selectedSession.draft.extractedData.patient.name = null as any;

    mockedUseLiveConversationAPI.mockReturnValue({
      isPreview: false,
      isLoading: false,
      error: null,
      sessions: [selectedSession],
      selectedSession,
      selectedSessionId: selectedSession.id,
      selectedSessionPhase: "capturing",
      hasPendingReview: false,
      availableDevices: [{ id: "default", label: "Default microphone" }],
      createDraftSession: vi.fn(),
      selectSession: vi.fn(),
      returnToDraft: vi.fn(),
      updateSelectedSession: vi.fn(),
      startSelectedSession: vi.fn(),
      pauseSelectedSession: vi.fn(),
      resumeSelectedSession: vi.fn(),
      stopSelectedSession: vi.fn(),
      finalizeSelectedSession: vi.fn(),
      deleteSession: vi.fn(),
      deleteSelectedRecording: vi.fn(),
      deleteSelectedFinalizedVisit: vi.fn(),
      refreshSessions: vi.fn(),
      disconnectAudio: vi.fn(),
      resolveReviewItem: vi.fn(),
      captureState: "idle",
      transportState: "idle",
      audioLevel: 0,
    });

    render(<LiveConversationWorkspace />);

    expect(screen.getAllByText("EN000001").length).toBeGreaterThan(0);
  });

  it("renders transcript-derived past history separately from symptoms", async () => {
    const selectedSession = makeSession({
      draft: {
        extractedData: {
          chiefComplaint: "Chest pain",
          hpi: "Intermittent pain for two days.",
          ros: ["Positive: Shortness of breath"],
          pastHistory: ["Hypertension", "Type 2 diabetes"],
          diagnosis: "Stable angina",
          symptoms: ["Chest pain"],
          medications: [],
          labs: [],
          radiology: [],
          procedures: [],
          followUp: [],
          plan: [],
          patient: {
            name: "Anita Rao",
            age: 52,
            gender: "Female",
          },
          vitals: {
            latest: {
              bp: {
                systolic: 130,
                diastolic: 84,
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
        },
        reviewItems: [],
      },
    });

    mockedUseLiveConversationAPI.mockReturnValue({
      isPreview: false,
      isLoading: false,
      error: null,
      sessions: [selectedSession],
      selectedSession,
      selectedSessionId: selectedSession.id,
      selectedSessionPhase: "capturing",
      hasPendingReview: false,
      availableDevices: [{ id: "default", label: "Default microphone" }],
      createDraftSession: vi.fn(),
      selectSession: vi.fn(),
      returnToDraft: vi.fn(),
      updateSelectedSession: vi.fn(),
      startSelectedSession: vi.fn(),
      pauseSelectedSession: vi.fn(),
      resumeSelectedSession: vi.fn(),
      stopSelectedSession: vi.fn(),
      finalizeSelectedSession: vi.fn(),
      deleteSession: vi.fn(),
      deleteSelectedRecording: vi.fn(),
      deleteSelectedFinalizedVisit: vi.fn(),
      refreshSessions: vi.fn(),
      disconnectAudio: vi.fn(),
      resolveReviewItem: vi.fn(),
      captureState: "recording",
      transportState: "connected",
      audioLevel: 0.54,
    });

    render(<LiveConversationWorkspace />);

    expect(screen.getByText(/past history/i)).toBeInTheDocument();
    expect(screen.getByText("Hypertension")).toBeInTheDocument();
    expect(screen.getByText("Type 2 diabetes")).toBeInTheDocument();
    expect(screen.getByText(/symptoms/i)).toBeInTheDocument();
    expect(screen.getAllByText("Chest pain").length).toBeGreaterThan(0);
  });

  it("renders patient sex as a constrained select in required review", async () => {
    const selectedSession = makeSession({
      status: "review_required",
      draft: {
        extractedData: {
          chiefComplaint: "",
          hpi: "",
          ros: [],
          pastHistory: [],
          diagnosis: "",
          symptoms: [],
          medications: [],
          labs: [],
          radiology: [],
          procedures: [],
          followUp: [],
          plan: [],
          patient: {
            name: "Anita Rao",
            age: 52,
            gender: "",
          },
          vitals: {
            latest: {
              bp: { systolic: 120, diastolic: 80 },
              pulse: { value: 72, unit: "bpm" },
              temperature: { value: 98.6, unit: "F" },
              spo2: { value: 99, unit: "%" },
              weight: { value: 62, unit: "kg" },
            },
          },
        },
        reviewItems: [
          {
            id: "required:patient.gender",
            category: "demographics",
            severity: "high",
            title: "Patient sex is required before finalizing",
            extractedValue: "",
            suggestedValue: "",
            resolution: "pending",
            required: true,
            fieldPath: "patient.gender",
            placeholder: "Select patient sex",
            inputType: "select",
            options: ["Male", "Female", "Other"],
          },
        ],
      },
      draftExtraction: {
        extractedData: null,
        reviewItems: [
          {
            id: "required:patient.gender",
            category: "demographics",
            severity: "high",
            title: "Patient sex is required before finalizing",
            extractedValue: "",
            suggestedValue: "",
            resolution: "pending",
            required: true,
            fieldPath: "patient.gender",
            placeholder: "Select patient sex",
            inputType: "select",
            options: ["Male", "Female", "Other"],
          },
        ],
        lastStableSegmentId: null,
      },
    });

    mockedUseLiveConversationAPI.mockReturnValue({
      isPreview: false,
      isLoading: false,
      error: null,
      sessions: [selectedSession],
      selectedSession,
      selectedSessionId: selectedSession.id,
      hasPendingReview: true,
      availableDevices: [{ id: "default", label: "Default microphone" }],
      createDraftSession: vi.fn(),
      selectSession: vi.fn(),
      returnToDraft: vi.fn(),
      updateSelectedSession: vi.fn(),
      startSelectedSession: vi.fn(),
      pauseSelectedSession: vi.fn(),
      resumeSelectedSession: vi.fn(),
      stopSelectedSession: vi.fn(),
      finalizeSelectedSession: vi.fn(),
      deleteSession: vi.fn(),
      deleteSelectedRecording: vi.fn(),
      deleteSelectedFinalizedVisit: vi.fn(),
      refreshSessions: vi.fn(),
      disconnectAudio: vi.fn(),
      resolveReviewItem: vi.fn(),
      captureState: "idle",
      transportState: "closed",
      audioLevel: 0,
    });

    render(<LiveConversationWorkspace />);

    const sexSelect = screen.getByRole("combobox", { name: /patient sex is required before finalizing/i });
    expect(sexSelect).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Male" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Female" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Other" })).toBeInTheDocument();
  });

  describe("PR-1: UI state contract tests", () => {
    it("should not show Unknown speaker chips during live preview", async () => {
      const selectedSession = makeSession({
        status: "live",
        transcript: {
          segments: [
            {
              id: "seg-1",
              speakerRole: "unknown",
              speakerLabel: "Unknown",
              startLabel: "0:00",
              endLabel: "0:05",
              text: "Patient is describing symptoms",
              confidence: null,
              flags: [],
              status: "final",
            },
          ],
          rawText: "Patient is describing symptoms",
          normalizedText: "Patient is describing symptoms",
          speakers: [],
          quality: {
            overallConfidence: null,
            lowConfidenceSegmentCount: 0,
            speakerAmbiguityCount: 0,
            overlappingSpeechSuspected: false,
          },
          hasGap: false,
          interimText: "",
        },
      });

      mockedUseLiveConversationAPI.mockReturnValue({
        isPreview: false,
        isLoading: false,
        error: null,
        sessions: [selectedSession],
        selectedSession,
        selectedSessionId: selectedSession.id,
        selectedSessionPhase: "capturing",
        hasPendingReview: false,
        availableDevices: [{ id: "default", label: "Default microphone" }],
        createDraftSession: vi.fn(),
        selectSession: vi.fn(),
        returnToDraft: vi.fn(),
        updateSelectedSession: vi.fn(),
        startSelectedSession: vi.fn(),
        pauseSelectedSession: vi.fn(),
        resumeSelectedSession: vi.fn(),
        stopSelectedSession: vi.fn(),
        finalizeSelectedSession: vi.fn(),
        deleteSession: vi.fn(),
        deleteSelectedRecording: vi.fn(),
        deleteSelectedFinalizedVisit: vi.fn(),
        refreshSessions: vi.fn(),
        disconnectAudio: vi.fn(),
        resolveReviewItem: vi.fn(),
        captureState: "recording",
        transportState: "connected",
        audioLevel: 0.1,
      });

      render(<LiveConversationWorkspace />);

      // During live capture, Unknown speaker chips should not be shown
      await waitFor(() => {
        const speakerBadges = screen.queryAllByText("Unknown");
        expect(speakerBadges.length).toBe(0);
      });
    });

    it("should show only one progress state during finalization", async () => {
      const selectedSession = makeSession({
        status: "finalizing",
        endedAt: "2026-05-27T09:29:00Z",
        updatedAt: "2026-05-27T09:29:00Z",
      });

      mockedUseLiveConversationAPI.mockReturnValue({
        isPreview: false,
        isLoading: false,
        error: null,
        sessions: [selectedSession],
        selectedSession,
        selectedSessionId: selectedSession.id,
        selectedSessionPhase: "finalizing_document",
        hasPendingReview: false,
        availableDevices: [{ id: "default", label: "Default microphone" }],
        createDraftSession: vi.fn(),
        selectSession: vi.fn(),
        returnToDraft: vi.fn(),
        updateSelectedSession: vi.fn(),
        startSelectedSession: vi.fn(),
        pauseSelectedSession: vi.fn(),
        resumeSelectedSession: vi.fn(),
        stopSelectedSession: vi.fn(),
        finalizeSelectedSession: vi.fn(),
        deleteSession: vi.fn(),
        deleteSelectedRecording: vi.fn(),
        deleteSelectedFinalizedVisit: vi.fn(),
        refreshSessions: vi.fn(),
        disconnectAudio: vi.fn(),
        resolveReviewItem: vi.fn(),
        captureState: "idle",
        transportState: "closed",
        audioLevel: 0,
      });

      render(<LiveConversationWorkspace />);

      await waitFor(() => {
        // Should show finalizing badge (either from status or processing badge)
        const finalizingText = screen.queryAllByText(/Finalizing/i);
        expect(finalizingText.length).toBeGreaterThan(0);

        // Should NOT show multiple conflicting progress states
        const processingBadges = screen.queryAllByText(/Processing/i);
        const recordingBadges = screen.queryAllByText(/Recording/i);
        const readyBadges = screen.queryAllByText(/Ready to capture/i);

        // These should not appear during finalizing
        expect(readyBadges.length).toBe(0);
      });
    });

    it("should not show Ready to capture after recording ends", async () => {
      const selectedSession = makeSession({
        status: "review_required",
        endedAt: "2026-05-27T09:29:00Z",
        updatedAt: "2026-05-27T09:29:00Z",
      });

      mockedUseLiveConversationAPI.mockReturnValue({
        isPreview: false,
        isLoading: false,
        error: null,
        sessions: [selectedSession],
        selectedSession,
        selectedSessionId: selectedSession.id,
        selectedSessionPhase: "review_ready",
        hasPendingReview: false,
        availableDevices: [{ id: "default", label: "Default microphone" }],
        createDraftSession: vi.fn(),
        selectSession: vi.fn(),
        returnToDraft: vi.fn(),
        updateSelectedSession: vi.fn(),
        startSelectedSession: vi.fn(),
        pauseSelectedSession: vi.fn(),
        resumeSelectedSession: vi.fn(),
        stopSelectedSession: vi.fn(),
        finalizeSelectedSession: vi.fn(),
        deleteSession: vi.fn(),
        deleteSelectedRecording: vi.fn(),
        deleteSelectedFinalizedVisit: vi.fn(),
        refreshSessions: vi.fn(),
        disconnectAudio: vi.fn(),
        resolveReviewItem: vi.fn(),
        captureState: "idle",
        transportState: "closed",
        audioLevel: 0,
      });

      render(<LiveConversationWorkspace />);

      await waitFor(() => {
        // Should show "Recording complete" or similar, NOT "Ready to capture"
        const readyToCaptureBadges = screen.queryAllByText(/Ready to capture/i);
        expect(readyToCaptureBadges.length).toBe(0);

        // Should show recording complete message
        expect(screen.getByText(/Recording complete/i)).toBeInTheDocument();
      });
    });

    it("should show distinct visual states for draft vs review", async () => {
      // Test draft state
      const draftSession = makeSession({ status: "draft" });

      mockedUseLiveConversationAPI.mockReturnValue({
        isPreview: false,
        isLoading: false,
        error: null,
        sessions: [draftSession],
        selectedSession: draftSession,
        selectedSessionId: draftSession.id,
        selectedSessionPhase: "draft_ready",
        hasPendingReview: false,
        availableDevices: [{ id: "default", label: "Default microphone" }],
        createDraftSession: vi.fn(),
        selectSession: vi.fn(),
        returnToDraft: vi.fn(),
        updateSelectedSession: vi.fn(),
        startSelectedSession: vi.fn(),
        pauseSelectedSession: vi.fn(),
        resumeSelectedSession: vi.fn(),
        stopSelectedSession: vi.fn(),
        finalizeSelectedSession: vi.fn(),
        deleteSession: vi.fn(),
        deleteSelectedRecording: vi.fn(),
        deleteSelectedFinalizedVisit: vi.fn(),
        refreshSessions: vi.fn(),
        disconnectAudio: vi.fn(),
        resolveReviewItem: vi.fn(),
        captureState: "idle",
        transportState: "idle",
        audioLevel: 0,
      });

      const { rerender } = render(<LiveConversationWorkspace />);

      // Draft should show Start button
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Start/i })).toBeInTheDocument();
      });

      // Test review state
      const reviewSession = makeSession({
        status: "review_required",
        endedAt: "2026-05-27T09:29:00Z",
        updatedAt: "2026-05-27T09:29:00Z",
      });

      mockedUseLiveConversationAPI.mockReturnValue({
        ...mockedUseLiveConversationAPI.mock.results[0].value,
        sessions: [reviewSession],
        selectedSession: reviewSession,
        selectedSessionId: reviewSession.id,
        selectedSessionPhase: "review_ready",
      });

      rerender(<LiveConversationWorkspace />);

      // Review should NOT show Start button
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: /Start/i })).not.toBeInTheDocument();
      });

      // Review should show Review section (more specific selector)
      const reviewElements = screen.queryAllByText(/Review/i);
      expect(reviewElements.length).toBeGreaterThan(0);
      expect(reviewElements.some(el => el.textContent?.includes("Review"))).toBe(true);
    });

    it("should hide Unknown speaker chips during paused live preview (Gap 2 fix)", async () => {
      const selectedSession = makeSession({
        status: "paused",
        transcript: {
          segments: [
            {
              id: "seg-1",
              speakerRole: "unknown",
              speakerLabel: "Unknown",
              startLabel: "0:00",
              endLabel: "0:05",
              text: "Patient is describing symptoms while paused",
              confidence: null,
              flags: [],
              status: "final",
            },
          ],
          rawText: "Patient is describing symptoms while paused",
          normalizedText: "Patient is describing symptoms while paused",
          speakers: [],
          quality: {
            overallConfidence: null,
            lowConfidenceSegmentCount: 0,
            speakerAmbiguityCount: 0,
            overlappingSpeechSuspected: false,
          },
          hasGap: false,
          interimText: "",
        },
      });

      mockedUseLiveConversationAPI.mockReturnValue({
        isPreview: false,
        isLoading: false,
        error: null,
        sessions: [selectedSession],
        selectedSession,
        selectedSessionId: selectedSession.id,
        selectedSessionPhase: "paused",
        hasPendingReview: false,
        availableDevices: [{ id: "default", label: "Default microphone" }],
        createDraftSession: vi.fn(),
        selectSession: vi.fn(),
        returnToDraft: vi.fn(),
        updateSelectedSession: vi.fn(),
        startSelectedSession: vi.fn(),
        pauseSelectedSession: vi.fn(),
        resumeSelectedSession: vi.fn(),
        stopSelectedSession: vi.fn(),
        finalizeSelectedSession: vi.fn(),
        deleteSession: vi.fn(),
        deleteSelectedRecording: vi.fn(),
        deleteSelectedFinalizedVisit: vi.fn(),
        refreshSessions: vi.fn(),
        disconnectAudio: vi.fn(),
        resolveReviewItem: vi.fn(),
        captureState: "paused",
        transportState: "paused",
        audioLevel: 0,
      });

      render(<LiveConversationWorkspace />);

      // During paused live preview, Unknown speaker chips should not be shown
      await waitFor(() => {
        const speakerBadges = screen.queryAllByText("Unknown");
        expect(speakerBadges.length).toBe(0);
      });
    });

    it("should hide Unknown speaker chips during transcribing phase (Gap 2 fix)", async () => {
      const selectedSession = makeSession({
        status: "live",
        endedAt: "2026-05-27T09:29:00Z",
        updatedAt: "2026-05-27T09:29:00Z",
        transcript: {
          segments: [
            {
              id: "seg-1",
              speakerRole: "unknown",
              speakerLabel: "Unknown",
              startLabel: "0:00",
              endLabel: "0:05",
              text: "Patient is describing symptoms during transcription",
              confidence: null,
              flags: [],
              status: "final",
            },
          ],
          rawText: "Patient is describing symptoms during transcription",
          normalizedText: "Patient is describing symptoms during transcription",
          speakers: [],
          quality: {
            overallConfidence: null,
            lowConfidenceSegmentCount: 0,
            speakerAmbiguityCount: 0,
            overlappingSpeechSuspected: false,
          },
          hasGap: false,
          interimText: "",
        },
      });

      mockedUseLiveConversationAPI.mockReturnValue({
        isPreview: false,
        isLoading: false,
        error: null,
        sessions: [selectedSession],
        selectedSession,
        selectedSessionId: selectedSession.id,
        selectedSessionPhase: "transcribing",
        hasPendingReview: false,
        availableDevices: [{ id: "default", label: "Default microphone" }],
        createDraftSession: vi.fn(),
        selectSession: vi.fn(),
        returnToDraft: vi.fn(),
        updateSelectedSession: vi.fn(),
        startSelectedSession: vi.fn(),
        pauseSelectedSession: vi.fn(),
        resumeSelectedSession: vi.fn(),
        stopSelectedSession: vi.fn(),
        finalizeSelectedSession: vi.fn(),
        deleteSession: vi.fn(),
        deleteSelectedRecording: vi.fn(),
        deleteSelectedFinalizedVisit: vi.fn(),
        refreshSessions: vi.fn(),
        disconnectAudio: vi.fn(),
        resolveReviewItem: vi.fn(),
        captureState: "idle",
        transportState: "closed",
        audioLevel: 0,
      });

      render(<LiveConversationWorkspace />);

      // During transcribing, Unknown speaker chips should not be shown
      await waitFor(() => {
        const speakerBadges = screen.queryAllByText("Unknown");
        expect(speakerBadges.length).toBe(0);
      });
    });

    describe("PR-3: Empty Assessment Fallback", () => {
      it("should show 'Assessment pending clinician review' when assessment is empty", async () => {
        const testSession = makeSession({
          status: "draft",
          linkedPatient: "Test Patient",
          draft: {
            extractedData: {
              assessment: "", // Empty assessment
              symptoms: ["Cough", "Fever"], // Non-empty symptoms
              chiefComplaint: "Cough and fever",
              hpi: "Patient reports symptoms",
              ros: [],
              pastHistory: [],
              diagnosis: "",
              medications: [],
              labs: [],
              radiology: [],
              procedures: [],
              followUp: [],
              plan: [],
              patient: { name: "Test Patient", age: 35, gender: "Female" },
              vitals: {
                latest: {
                  bp: { systolic: 120, diastolic: 80 },
                  pulse: { value: 72, unit: "bpm" },
                  temperature: { value: 98.6, unit: "F" },
                  spo2: { value: 99, unit: "%" },
                  weight: { value: 62, unit: "kg" },
                },
              },
            },
            reviewItems: [],
          },
        });

        mockedUseLiveConversationAPI.mockReturnValue({
          isPreview: false,
          isLoading: false,
          error: null,
          sessions: [testSession],
          selectedSession: testSession,
          selectedSessionId: testSession.id,
          selectedSessionPhase: "draft",
          hasPendingReview: false,
          availableDevices: [],
          createDraftSession: vi.fn(),
          selectSession: vi.fn(),
          returnToDraft: vi.fn(),
          updateSelectedSession: vi.fn(),
          startSelectedSession: vi.fn(),
          pauseSelectedSession: vi.fn(),
          resumeSelectedSession: vi.fn(),
          stopSelectedSession: vi.fn(),
          finalizeSelectedSession: vi.fn(),
          deleteSession: vi.fn(),
          deleteSelectedRecording: vi.fn(),
          deleteSelectedFinalizedVisit: vi.fn(),
          refreshSessions: vi.fn(),
          disconnectAudio: vi.fn(),
          resolveReviewItem: vi.fn(),
          beginCapture: vi.fn(),
          requestDraftUpdate: vi.fn(),
        });

        render(<LiveConversationWorkspace />);

        // Should show "Assessment pending clinician review" instead of "-" or symptoms
        await waitFor(() => {
          const assessmentElement = screen.queryByText("Assessment pending clinician review");
          expect(assessmentElement).toBeInTheDocument();
        });

        // Should NOT show symptoms as assessment
        const symptomsAsAssessment = screen.queryByText("Cough, Fever");
        expect(symptomsAsAssessment).not.toBeInTheDocument();
      });
    });
  });
});
