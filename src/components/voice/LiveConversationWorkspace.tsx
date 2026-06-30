import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  AudioLines,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Edit3,
  ExternalLink,
  FileCheck2,
  FileText,
  LayoutDashboard,
  Loader2,
  Mic,
  PauseCircle,
  Pill,
  PlayCircle,
  Plus,
  RadioTower,
  ShieldAlert,
  Square,
  TimerReset,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  formatLiveDuration,
  sessionTitle,
  useLiveConversationAPI,
  getEncounterPhaseCopy,
  getTranscriptEmptyStateCopy,
  isRecordingActive,
  isPostRecording,
  canDeleteVisit,
  type LiveDraftExtraction,
  type LiveConversationSession,
  type LiveReviewItem,
  type LiveReviewResolution,
  type LiveTranscriptSegment,
  type LiveEncounterPhase,
} from "@/hooks/useLiveConversationAPI";
import type { ConnectionState, MediaRecorderState } from "@/hooks/useLiveConversationAudio";

const PRIMARY_TEAL_BUTTON =
  "border-teal-600 bg-teal-600 text-white hover:border-teal-700 hover:bg-teal-700";
const SECONDARY_TEAL_BUTTON =
  "border-teal-200 bg-teal-50 text-teal-800 hover:border-teal-300 hover:bg-teal-100";
const ICON_ACTION_BUTTON =
  "h-9 w-9 rounded-full border border-teal-200 bg-teal-50 text-teal-700 shadow-sm hover:border-teal-300 hover:bg-teal-100 hover:text-teal-800";

function trimText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatTimestamp(value: string | null) {
  if (!value) return "Not started";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(status: LiveConversationSession["status"]) {
  if (status === "finalized") return "border-transparent bg-emerald-50 text-emerald-700";
  if (status === "failed") return "border-transparent bg-rose-50 text-rose-700";
  if (status === "review_required") return "border-transparent bg-amber-50 text-amber-800";
  if (status === "paused") return "border-transparent bg-sky-50 text-sky-700";
  if (status === "finalizing") return "border-transparent bg-indigo-50 text-indigo-700";
  if (status === "live") return "border-transparent bg-teal-50 text-teal-700";
  return "border-transparent bg-slate-100 text-slate-700";
}

function statusLabel(status: LiveConversationSession["status"]) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Get display label and tone for the canonical encounter phase.
 * This replaces the raw session.status badge with phase-aware UI.
 */
function phaseDisplay(phase: LiveEncounterPhase): { label: string; tone: string } {
  switch (phase) {
    case "draft_ready":
      return { label: "Draft", tone: "border-transparent bg-slate-100 text-slate-700" };
    case "starting":
      return { label: "Starting", tone: "border-transparent bg-sky-50 text-sky-700" };
    case "capturing":
      return { label: "Live", tone: "border-transparent bg-teal-50 text-teal-700" };
    case "paused":
      return { label: "Paused", tone: "border-transparent bg-sky-50 text-sky-700" };
    case "ending_upload":
      return { label: "Ending", tone: "border-transparent bg-indigo-50 text-indigo-700" };
    case "transcribing":
      return { label: "Processing", tone: "border-transparent bg-indigo-50 text-indigo-700" };
    case "review_ready":
      return { label: "Review", tone: "border-transparent bg-amber-50 text-amber-800" };
    case "finalizing_document":
      return { label: "Finalizing", tone: "border-transparent bg-indigo-50 text-indigo-700" };
    case "finalized":
      return { label: "Published", tone: "border-transparent bg-emerald-50 text-emerald-700" };
    case "failed":
      return { label: "Failed", tone: "border-transparent bg-rose-50 text-rose-700" };
    default:
      return { label: "Unknown", tone: "border-transparent bg-slate-100 text-slate-700" };
  }
}

function speakerTone(role: LiveTranscriptSegment["speakerRole"]) {
  if (role === "doctor") return "border-transparent bg-teal-50 text-teal-700";
  if (role === "patient") return "border-transparent bg-sky-50 text-sky-700";
  return "border-transparent bg-slate-100 text-slate-700";
}

function severityTone(severity: LiveReviewItem["severity"]) {
  if (severity === "high") return "border-transparent bg-rose-50 text-rose-700";
  if (severity === "medium") return "border-transparent bg-amber-50 text-amber-800";
  return "border-transparent bg-sky-50 text-sky-700";
}

function speakerAccent(role: LiveTranscriptSegment["speakerRole"]) {
  if (role === "doctor") return "bg-teal-500";
  if (role === "patient") return "bg-sky-500";
  return "bg-slate-300";
}

function autoPatientLabel(session: LiveConversationSession) {
  return [session.linkedPatient, session.draft.extractedData.patient.name]
    .map(trimText)
    .find(Boolean)
    || "";
}

function autoEncounterLabel(session: LiveConversationSession) {
  const explicit = trimText(session.encounterLabel);
  if (explicit) return explicit;
  const digits = String(session.id || "").replace(/\D/g, "");
  return `EN${(digits.slice(-6) || "000001").padStart(6, "0")}`;
}

function countSetupFields(session: LiveConversationSession) {
  return [
    autoPatientLabel(session).length > 0,
    autoEncounterLabel(session).length > 0,
    session.recorder.permission === "granted",
  ].filter(Boolean).length;
}

function countDraftSections(session: LiveConversationSession) {
  const draft = session.draft.extractedData;
  return [
    draft.chiefComplaint,
    draft.hpi,
    draft.ros?.length || 0,
    draft.pastHistory?.length || 0,
    draft.assessment,
    draft.symptoms.length,
    draft.patient.name || draft.patient.age || draft.patient.gender,
    draft.vitals.latest.bp.systolic || draft.vitals.latest.pulse.value || draft.vitals.latest.temperature.value || draft.vitals.latest.spo2.value || draft.vitals.latest.weight.value,
    draft.medications.length,
    draft.labs.length + draft.radiology.length + draft.procedures.length,
    draft.followUp.length,
    draft.plan.length,
  ].filter(Boolean).length;
}

function countPendingReview(session: LiveConversationSession) {
  return session.draft.reviewItems.filter((item) => item.resolution === "pending").length;
}

function permissionLabel(permission: LiveConversationSession["recorder"]["permission"]) {
  if (permission === "granted") return "Mic ready";
  if (permission === "denied") return "Mic denied";
  return "Mic pending";
}

function formatVitalNumber(value: number | null, unit = "") {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) return "";
  return `${value}${unit ? ` ${unit}` : ""}`;
}

function formatBloodPressure(systolic: number | null, diastolic: number | null) {
  if (!systolic || !diastolic) return "";
  return `${systolic}/${diastolic} mmHg`;
}

function liveCaptureCopy(captureState: MediaRecorderState, transportState: ConnectionState, audioLevel: number) {
  if (captureState === "stopping") {
    return {
      title: "Ending recording",
      detail: "Processing the final audio chunk and moving this visit into review.",
    };
  }

  if (captureState === "paused") {
    return {
      title: "Recording paused",
      detail: "Resume when you are ready to continue capturing audio.",
    };
  }

  if (captureState === "starting" || transportState === "connecting" || transportState === "reconnecting") {
    return {
      title: "Connecting microphone",
      detail: "Preparing the stream. This takes a moment when a live visit starts.",
    };
  }

  if (captureState === "recording" && transportState === "connected") {
    return {
      title: audioLevel > 0.06 ? "Listening. Voice detected." : "Listening to your microphone",
      detail: "Audio is being recorded. Transcript and notes are generated after you end.",
    };
  }

  return {
    title: "Ready to capture",
    detail: "Press Start to let the browser use your default microphone, then speak normally.",
  };
}

function transcriptEmptyCopy(captureState: MediaRecorderState, transportState: ConnectionState, audioLevel: number) {
  if (captureState === "stopping") {
    return {
      title: "Finishing transcript",
      detail: "Final audio is being processed before the review step opens.",
    };
  }

  if (captureState === "paused") {
    return {
      title: "Transcript paused",
      detail: "Resume recording to continue audio capture.",
    };
  }

  if (captureState === "starting" || transportState === "connecting" || transportState === "reconnecting") {
    return {
      title: "Preparing transcript",
      detail: "The transcript panel will stay empty until recording ends.",
    };
  }

  if (captureState === "recording" && transportState === "connected") {
    return {
      title: audioLevel > 0.06 ? "Listening now" : "Waiting for speech",
      detail: "Audio is being captured. Transcript generation starts after End.",
    };
  }

  return {
    title: "Transcript will appear here",
    detail: "Press Start and speak. The transcript is generated after you end the recording.",
  };
}

function bloodPressureInputValue(systolic: number | null, diastolic: number | null) {
  if (!systolic || !diastolic) return "";
  return `${systolic}/${diastolic}`;
}

function vitalInputValue(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) return "";
  return String(value);
}

function AudioLevelMeter({
  audioLevel,
  isActive,
}: {
  audioLevel: number;
  isActive: boolean;
}) {
  const bars = [0.04, 0.08, 0.12, 0.18, 0.24, 0.32, 0.42, 0.56];

  return (
    <div className="flex items-end gap-1" aria-label="Microphone level">
      {bars.map((threshold, index) => (
        <span
          key={threshold}
          className={cn(
            "w-1.5 rounded-full transition-colors",
            isActive
              ? audioLevel >= threshold
                ? "bg-teal-500"
                : "bg-teal-100"
              : "bg-slate-200",
          )}
          style={{ height: `${12 + (index * 3)}px` }}
        />
      ))}
    </div>
  );
}

function ProcessingProgressState({
  title,
  detail,
  steps,
}: {
  title: string;
  detail: string;
  steps: string[];
}) {
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
      <div className="flex items-start gap-3">
        <div className="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-indigo-200 bg-white text-indigo-700 shadow-sm">
          <span className="absolute h-10 w-10 animate-ping rounded-full bg-indigo-200 opacity-40" />
          <Loader2 className="relative h-4.5 w-4.5 animate-spin" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-medium text-slate-900">{title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">{detail}</p>
          </div>
          <div className="grid gap-2">
            {steps.map((step, index) => (
              <div key={step} className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-indigo-500"
                  style={{ animationDelay: `${index * 180}ms` }}
                />
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white">
                  <span
                    className="block h-full w-2/3 animate-pulse rounded-full bg-indigo-300"
                    style={{ animationDelay: `${index * 180}ms` }}
                  />
                </div>
                <span className="w-24 shrink-0 truncate text-xs font-medium text-indigo-800 sm:w-32">
                  {step}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RecordingIndicator({ isRecording, hasAudio }: { isRecording: boolean; hasAudio: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {/* Pulsing microphone icon */}
      <div className="relative">
        <div
          className={cn(
            "absolute inset-0 rounded-full bg-teal-400 opacity-20 transition-all duration-300",
            isRecording && "animate-ping"
          )}
        />
        <div
          className={cn(
            "relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300",
            isRecording
              ? hasAudio
                ? "bg-teal-500 text-white"
                : "bg-teal-100 text-teal-600"
              : "bg-slate-100 text-slate-400",
          )}
        >
          <Mic className="h-5 w-5" />
        </div>
      </div>

      {/* Audio wave animation */}
      {isRecording && (
        <div className="flex items-center gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={cn(
                "w-1 bg-teal-500 rounded-full transition-all duration-150",
                hasAudio ? "animate-pulse" : "opacity-30",
              )}
              style={{
                height: hasAudio
                  ? `${8 + Math.sin((Date.now() / 100 + i) * 2) * 8 + Math.random() * 20}px`
                  : "4px",
                animationDelay: `${i * 50}ms`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AudioPlayer({
  audioUrl,
  onDurationChange,
}: {
  audioUrl: string;
  onDurationChange?: (durationMs: number) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-600">
          <PlayCircle className="h-3.5 w-3.5" />
        </div>
        <audio
          key={audioUrl}
          controls
          className="h-8 flex-1 min-w-0"
          preload="metadata"
          src={audioUrl}
          onLoadedMetadata={(event) => {
            const durationSeconds = event.currentTarget.duration;
            if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
              onDurationChange?.(Math.round(durationSeconds * 1000));
            }
          }}
          onDurationChange={(event) => {
            const durationSeconds = event.currentTarget.duration;
            if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
              onDurationChange?.(Math.round(durationSeconds * 1000));
            }
          }}
        >
          Your browser does not support audio playback.
        </audio>
      </div>
    </div>
  );
}

function RecordingPanel({
  session,
  onDeleteRecording,
  onAudioDurationDetected,
}: {
  session: LiveConversationSession;
  onDeleteRecording: (sessionId: string) => Promise<void>;
  onAudioDurationDetected?: (sessionId: string, durationMs: number) => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const hasAudioPlayback = Boolean(
    session.audio?.combinedPath
    && ["review_required", "finalizing", "finalized"].includes(session.status),
  );

  if (!hasAudioPlayback) return null;

  const audioFileName = session.audio?.combinedPath?.split(/[\\/]/).pop() || null;
  const audioUrl = `/api/voice/live/sessions/${encodeURIComponent(session.id)}/audio`;

  const handleDelete = async () => {
    const confirmed = window.confirm(`Delete the saved recording for ${sessionTitle(session.linkedPatient, session.encounterLabel)}? The transcript draft and visit will be kept.`);
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await onDeleteRecording(session.id);
      toast.success("Recording deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete recording.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className="self-start border-slate-200/80 bg-white shadow-sm">
      <CardContent className="space-y-2 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium text-slate-900">Saved Recording</CardTitle>
          <div className="flex items-center gap-1">
            <Button asChild type="button" variant="ghost" size="icon" className="h-8 w-8 text-slate-600 hover:bg-slate-100 hover:text-slate-900" title="Open recording">
              <a href={audioUrl} target="_blank" rel="noreferrer" aria-label="Open recording">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
            <Button asChild type="button" variant="ghost" size="icon" className="h-8 w-8 text-slate-600 hover:bg-slate-100 hover:text-slate-900" title="Download recording">
              <a href={audioUrl} download={audioFileName || `${session.id}.webm`} aria-label="Download recording">
                <Download className="h-4 w-4" />
              </a>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              title="Delete recording"
              aria-label="Delete recording"
              disabled={isDeleting}
              onClick={() => {
                void handleDelete();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <AudioPlayer
          audioUrl={audioUrl}
          onDurationChange={(durationMs) => {
            onAudioDurationDetected?.(session.id, durationMs);
          }}
        />
      </CardContent>
    </Card>
  );
}

function SessionList({
  sessions,
  selectedSessionId,
  selectedSessionStatus,
  onSelectSession,
  onCreateDraftSession,
  isCollapsed = false,
  onToggleCollapse,
}: {
  sessions: LiveConversationSession[];
  selectedSessionId: string | null;
  selectedSessionStatus: LiveConversationSession["status"];
  onSelectSession: (sessionId: string) => void;
  onCreateDraftSession: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const activeSessions = sessions.filter((session) =>
    ["draft", "live", "paused", "review_required", "finalizing"].includes(session.status),
  );
  const finalizedSessions = sessions.filter((session) => session.status === "finalized");
  const attentionSessions = sessions.filter((session) => session.status === "failed");

  const renderRow = (session: LiveConversationSession, subtitle: string) => (
    <button
      key={session.id}
      type="button"
      className={`w-full overflow-hidden rounded-2xl border px-3 py-3 text-left transition-colors ${
        session.id === selectedSessionId
          ? "border-teal-300 bg-teal-50/70 shadow-sm"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70"
      }`}
      onClick={() => onSelectSession(session.id)}
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-medium leading-5 text-slate-900">{session.title}</p>
          </div>
          <Badge className={cn("shrink-0 whitespace-nowrap", statusTone(session.status))}>
            {statusLabel(session.status)}
          </Badge>
        </div>
        <p className="break-words text-xs leading-5 text-slate-500">{subtitle}</p>
        <p className="text-[11px] text-slate-400">{formatTimestamp(session.updatedAt)}</p>
      </div>
    </button>
  );

  const renderDisclosure = (
    label: string,
    items: LiveConversationSession[],
    subtitle: (session: LiveConversationSession) => string,
  ) => {
    if (items.length === 0) return null;

    return (
      <details className="group rounded-2xl border border-slate-200 bg-slate-50/60">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3">
          <p className="text-xs font-medium text-slate-900">{label}</p>
          <Badge variant="outline">{items.length}</Badge>
        </summary>
        <div className="space-y-2 border-t border-slate-200/80 p-3">
          {items.map((session) => renderRow(session, subtitle(session)))}
        </div>
      </details>
    );
  };

  return (
    <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm xl:sticky xl:top-5 xl:self-start">
      <CardHeader className="border-b border-slate-200/80 pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base text-slate-900">Visits</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              onClick={onToggleCollapse}
              title={isCollapsed ? "Expand visits panel" : "Collapse visits panel"}
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
            {["review_required", "finalizing", "finalized", "failed"].includes(selectedSessionStatus) ? (
              <Button
                size="icon"
                className={PRIMARY_TEAL_BUTTON}
                onClick={() => onCreateDraftSession()}
                aria-label="Create new visit"
                title="Create new visit"
              >
                <Plus className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      {!isCollapsed && (
        <CardContent className="grid gap-4 p-4">
          <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">In progress</p>
            <Badge variant="outline">{activeSessions.length}</Badge>
          </div>
          {activeSessions.length > 0 ? (
            <div className="space-y-2">
              {activeSessions.map((session) =>
                renderRow(session, autoEncounterLabel(session) || statusLabel(session.status)),
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm text-slate-500">
              No session
            </div>
          )}
          </section>
          {renderDisclosure(
            "Completed",
            finalizedSessions,
            (session) => [autoPatientLabel(session), autoEncounterLabel(session)].filter(Boolean).join(" · ") || "Dashboard ready",
          )}
          {renderDisclosure(
            "Interrupted",
            attentionSessions,
            (session) => session.error || "Recovery required",
          )}
        </CardContent>
      )}
    </Card>
  );
}

function ControlBar({
  session,
  resolvedAudioDurationMs,
  onStart,
  onPause,
  onResume,
  onStop,
  onDeleteVisit,
  phase,
  audioLevel,
}: {
  session: LiveConversationSession;
  resolvedAudioDurationMs?: number | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onDeleteVisit: () => Promise<void>;
  phase: LiveEncounterPhase;
  audioLevel: number;
}) {
  const captureCopy = getEncounterPhaseCopy(phase, audioLevel);
  const isRecording = isRecordingActive(phase);
  const hasAudio = audioLevel > 0.06;
  const [isDeletingVisit, setIsDeletingVisit] = useState(false);
  const canDeleteCurrentVisit = canDeleteVisit(phase);
  const deleteVisitLabel = session.status === "finalized" ? "Delete finalized visit" : "Delete visit";
  const [displayNowMs, setDisplayNowMs] = useState(() => Date.now());
  const startedAtMs = session.startedAt ? new Date(session.startedAt).getTime() : NaN;
  const endedAtMs = session.endedAt ? new Date(session.endedAt).getTime() : NaN;
  const stabilizedDurationMs = Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs)
    ? Math.max(Number(session.durationMs || 0), Math.max(0, endedAtMs - startedAtMs))
    : Number(session.durationMs || 0);
  const persistedAudioDurationMs = Number(session.audio?.durationMs || 0);
  const completedAudioDurationMs = Number.isFinite(Number(resolvedAudioDurationMs)) && Number(resolvedAudioDurationMs) > 0
    ? Number(resolvedAudioDurationMs)
    : persistedAudioDurationMs > 0
      ? persistedAudioDurationMs
      : null;
  const displayedDurationMs = phase === "capturing" && Number.isFinite(startedAtMs) && !Number.isFinite(endedAtMs)
    ? Math.max(stabilizedDurationMs, Math.max(0, displayNowMs - startedAtMs))
    : completedAudioDurationMs ?? stabilizedDurationMs;

  useEffect(() => {
    // Only run timer during active recording, not during upload/transcript processing
    if (phase !== "capturing" || !session.startedAt) return undefined;

    setDisplayNowMs(Date.now());
    const interval = window.setInterval(() => {
      setDisplayNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [phase, session.startedAt]);

  const handleDeleteVisit = async () => {
    const deleteMessage = session.status === "finalized"
      ? `Delete ${sessionTitle(session.linkedPatient, session.encounterLabel)} and its finalized dashboard document?`
      : `Delete ${sessionTitle(session.linkedPatient, session.encounterLabel)}? This will remove the visit, transcript draft, review items, and saved audio.`;
    const confirmed = window.confirm(deleteMessage);
    if (!confirmed) return;

    setIsDeletingVisit(true);
    try {
      await onDeleteVisit();
      toast.success(session.status === "finalized" ? "Finalized visit deleted." : "Visit deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete visit.");
    } finally {
      setIsDeletingVisit(false);
    }
  };

  return (
    <Card className="self-start overflow-hidden border-slate-200/80 bg-white shadow-sm">
      <CardContent className="space-y-3 px-4 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Encounter</p>
            <h3 className="truncate text-xl font-semibold tracking-tight text-slate-900">{session.title}</h3>
            {[autoPatientLabel(session), autoEncounterLabel(session)].filter(Boolean).length > 0 ? (
              <p className="text-sm text-slate-600">
                {[autoPatientLabel(session), autoEncounterLabel(session)].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {/* Use canonical phase for status badge instead of raw session.status */}
              {phase === "ending_upload" || phase === "finalizing_document" || phase === "transcribing" ? (
                <Badge className={`gap-1.5 ${phaseDisplay(phase).tone}`}>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {phaseDisplay(phase).label}
                </Badge>
              ) : (
                <Badge className={phaseDisplay(phase).tone}>
                  {phaseDisplay(phase).label}
                </Badge>
              )}
              <Badge variant="outline">
                <TimerReset className="mr-1 h-3.5 w-3.5" />
                {formatLiveDuration(displayedDurationMs)}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {(phase === "draft_ready" || phase === "failed") ? (
              <Button className={PRIMARY_TEAL_BUTTON} onClick={onStart} disabled={phase === "starting"}>
                <Mic className="mr-2 h-4 w-4" />
                {phase === "starting" ? "Starting..." : phase === "failed" ? "Restart" : "Start"}
              </Button>
            ) : null}
            {phase === "capturing" ? (
              <Button className={SECONDARY_TEAL_BUTTON} onClick={onPause}>
                <PauseCircle className="mr-2 h-4 w-4" />
                Pause
              </Button>
            ) : null}
            {phase === "paused" ? (
              <Button className={SECONDARY_TEAL_BUTTON} onClick={onResume}>
                <PlayCircle className="mr-2 h-4 w-4" />
                Resume
              </Button>
            ) : null}
            {phase === "capturing" || phase === "paused" ? (
              <Button className={PRIMARY_TEAL_BUTTON} onClick={onStop} disabled={phase === "ending_upload"}>
                <Square className="mr-2 h-4 w-4" />
                {phase === "ending_upload" ? "Ending..." : "End"}
              </Button>
            ) : null}
            {canDeleteCurrentVisit ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                title={deleteVisitLabel}
                aria-label={deleteVisitLabel}
                disabled={isDeletingVisit}
                onClick={() => {
                  void handleDeleteVisit();
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>

        {/* Recording status with visual indicator */}
        <div className={cn(
          "rounded-2xl border p-3 transition-colors",
          isRecording
            ? hasAudio
              ? "border-teal-200 bg-teal-50/80"
              : "border-slate-200 bg-slate-50/80"
            : "border-slate-200/80 bg-slate-50/80"
        )}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900">{captureCopy.title}</p>
              <p className="text-xs leading-5 text-slate-500">{captureCopy.detail}</p>
            </div>
            <div className="flex items-center gap-4">
              <RecordingIndicator isRecording={isRecording} hasAudio={hasAudio} />
              <AudioLevelMeter audioLevel={audioLevel} isActive={isRecording} />
            </div>
          </div>
        </div>

        {session.error ? (
          <div className="rounded-xl border border-rose-100 bg-rose-50/80 px-3 py-2 text-sm text-rose-900">
            {session.error}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TranscriptPanel({
  session,
  phase,
  audioLevel,
}: {
  session: LiveConversationSession;
  phase: LiveEncounterPhase;
  audioLevel: number;
}) {
  const emptyTranscriptCopy = getTranscriptEmptyStateCopy(phase, audioLevel);
  const isLiveCapture = phase === "capturing";
  const isFinalizingCapture = phase === "ending_upload" || phase === "finalizing_document";
  const isPreparingTranscript = phase === "ending_upload" || phase === "transcribing";
  const hasAudio = audioLevel > 0.06;

  return (
    <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm">
      <CardHeader className="border-b border-slate-200/80 pb-2.5">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base text-slate-900">Transcript</CardTitle>
          <div className="flex items-center gap-2">
            {isLiveCapture && (
              <Badge className="border-transparent bg-teal-100 text-teal-800">
                <span className="relative mr-1.5 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-600" />
                </span>
                Recording
              </Badge>
            )}
            {isFinalizingCapture ? (
              <Badge className="border-transparent bg-indigo-100 text-indigo-800">
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {phase === "ending_upload" ? "Processing" : "Finalizing"}
              </Badge>
            ) : null}
            {phase === "transcribing" ? (
              <Badge className="border-transparent bg-indigo-100 text-indigo-800">
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Transcribing
              </Badge>
            ) : null}
            {session.transcript.hasGap ? (
              <Badge className="border-transparent bg-amber-50 text-amber-800">Gap</Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[500px] xl:h-[560px] 2xl:h-[620px]">
          <div className="space-y-3 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,1))] p-4">
            {session.transcript.segments.length === 0 && !session.transcript.interimText ? (
              <div className={cn(
                "flex min-h-[140px] items-center justify-center rounded-xl border transition-colors",
                isPreparingTranscript
                  ? "border-indigo-100 bg-white p-4"
                  : isLiveCapture
                  ? hasAudio
                    ? "border-teal-200 bg-teal-50/50 p-6"
                    : "border-slate-200 bg-white p-6"
                  : "border-dashed border-slate-200 bg-white p-6"
              )}>
                {isPreparingTranscript ? (
                  <div className="w-full">
                    <ProcessingProgressState
                      title="Preparing transcript"
                      detail="Final audio is being processed. Transcript and note sections will appear here as soon as they are ready."
                      steps={["Audio upload", "Transcription", "Clinical extraction"]}
                    />
                  </div>
                ) : (
                  <div className="space-y-4 text-center">
                    {isLiveCapture && (
                      <div className="mx-auto flex justify-center">
                        <RecordingIndicator isRecording={isLiveCapture} hasAudio={hasAudio} />
                      </div>
                    )}
                    {isFinalizingCapture ? (
                      <div className="mx-auto flex justify-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700">
                          <Loader2 className="h-4.5 w-4.5 animate-spin" />
                        </div>
                      </div>
                    ) : null}
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-700">{emptyTranscriptCopy.title}</p>
                      <p className="text-sm text-slate-500">{emptyTranscriptCopy.detail}</p>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {session.transcript.segments.map((segment) => (
              <article
                key={segment.id}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors ${
                  segment.flags.includes("low_confidence")
                    ? "border-amber-200 ring-1 ring-amber-100"
                    : "border-slate-200/80"
                }`}
              >
                <div className="flex">
                  <div className={`w-1.5 shrink-0 ${speakerAccent(segment.speakerRole)}`} />
                  <div className="min-w-0 flex-1 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Hide Unknown speaker chips during live preview (capturing, paused, ending, transcribing)
                          Show Doctor/Patient chips during review/finalized
                          Condition: show badge if post-recording phase OR role is not unknown */}
                      {(isPostRecording(phase) || segment.speakerRole !== "unknown") && (
                        <Badge className={speakerTone(segment.speakerRole)}>{segment.speakerLabel}</Badge>
                      )}
                      <span className="text-xs font-medium text-slate-500">
                        <Clock3 className="mr-1 inline h-3.5 w-3.5" />
                        {segment.startLabel} - {segment.endLabel}
                      </span>
                      {segment.flags.includes("low_confidence") ? (
                        <Badge className="border-transparent bg-amber-50 text-amber-800">Low confidence</Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-800">{segment.text}</p>
                    {segment.flags.filter((flag) => flag !== "low_confidence").length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {segment.flags.filter((flag) => flag !== "low_confidence").map((flag) => (
                          <Badge
                            key={flag}
                            className="border-transparent bg-slate-100 text-slate-700"
                          >
                            {flag.replace(/_/g, " ")}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}

            {session.transcript.interimText ? (
              <article className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/70 p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-transparent bg-sky-100 text-sky-800">Live</Badge>
                  <Badge className="border-slate-200 bg-slate-100 text-slate-700">Speaker</Badge>
                  <AudioLines className="h-3.5 w-3.5 text-slate-500" />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-800">{session.transcript.interimText}</p>
              </article>
            ) : null}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function SetupPanel({
  session,
  onUpdate,
  availableDevices,
}: {
  session: LiveConversationSession;
  onUpdate: (patch: { linkedPatient?: string; encounterLabel?: string; deviceId?: string; draftPatch?: Partial<LiveDraftExtraction> }) => void | Promise<void>;
  availableDevices: Array<{ id: string; label: string }>;
}) {
  const isLocked = session.status === "finalized";
  const deviceBadgeLabel = session.recorder.deviceLabel
    || (session.recorder.permission === "denied" ? "Microphone blocked" : "Browser default microphone");
  const detectedPatient = autoPatientLabel(session);
  const detectedEncounter = autoEncounterLabel(session);
  const [patientNameInput, setPatientNameInput] = useState(detectedPatient);
  const [encounterLabelInput, setEncounterLabelInput] = useState(detectedEncounter);
  const microphoneHelpText = session.recorder.permission === "denied"
    ? "Microphone access is blocked in the browser. Allow microphone access for this site and refresh."
    : availableDevices.length === 0
      ? "No microphone is listed yet. Press Start to grant access; the browser default microphone will still be used."
      : "You can leave this unchanged to keep using the browser default microphone.";

  useEffect(() => {
    setPatientNameInput(detectedPatient);
  }, [detectedPatient, session.id]);

  useEffect(() => {
    setEncounterLabelInput(detectedEncounter);
  }, [detectedEncounter, session.id]);

  useEffect(() => {
    if (isLocked) return undefined;
    const normalizedName = patientNameInput.trim();
    if (normalizedName === detectedPatient) return undefined;

    const timeoutId = window.setTimeout(() => {
      void onUpdate({
        linkedPatient: normalizedName,
        draftPatch: {
          patient: {
            ...session.draft.extractedData.patient,
            name: normalizedName,
          },
        },
      });
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [detectedPatient, isLocked, onUpdate, patientNameInput, session.draft.extractedData.patient]);

  useEffect(() => {
    if (isLocked) return undefined;
    const normalizedEncounter = encounterLabelInput.trim();
    if (normalizedEncounter === detectedEncounter) return undefined;

    const timeoutId = window.setTimeout(() => {
      void onUpdate({ encounterLabel: normalizedEncounter });
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [detectedEncounter, encounterLabelInput, isLocked, onUpdate]);

  const commitPatientName = () => {
    const normalizedName = patientNameInput.trim();
    if (normalizedName === detectedPatient) return;
    void onUpdate({
      linkedPatient: normalizedName,
      draftPatch: {
        patient: {
          ...session.draft.extractedData.patient,
          name: normalizedName,
        },
      },
    });
  };

  const commitEncounterLabel = () => {
    const normalizedEncounter = encounterLabelInput.trim();
    if (normalizedEncounter === detectedEncounter) return;
    void onUpdate({ encounterLabel: normalizedEncounter });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
          <label htmlFor={`live-patient-name-${session.id}`} className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
            Patient name
          </label>
          <Input
            id={`live-patient-name-${session.id}`}
            value={patientNameInput}
            onChange={(event) => setPatientNameInput(event.target.value)}
            onBlur={commitPatientName}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitPatientName();
              }
            }}
            placeholder="Enter patient name"
            className="mt-2 border-slate-200 bg-white"
            disabled={isLocked}
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
          <label htmlFor={`live-encounter-label-${session.id}`} className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
            Encounter label
          </label>
          <Input
            id={`live-encounter-label-${session.id}`}
            value={encounterLabelInput}
            onChange={(event) => setEncounterLabelInput(event.target.value)}
            onBlur={commitEncounterLabel}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitEncounterLabel();
              }
            }}
            placeholder="Enter encounter label"
            className="mt-2 border-slate-200 bg-white"
            disabled={isLocked}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Mic</label>
        {availableDevices.length > 0 ? (
          <select
            value={session.recorder.deviceId || availableDevices[0]?.id || ""}
            onChange={(event) => onUpdate({ deviceId: event.target.value })}
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-50"
            disabled={isLocked}
          >
            {availableDevices.map((device) => (
              <option key={device.id} value={device.id}>
                {typeof device.label === 'string' ? device.label : JSON.stringify(device.label)}
              </option>
            ))}
          </select>
        ) : (
          <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
            Browser default microphone will be requested on Start
          </div>
        )}
        <p className="text-xs leading-5 text-slate-500">{microphoneHelpText}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge className="border-transparent bg-slate-100 text-slate-700">
          {permissionLabel(session.recorder.permission)}
        </Badge>
        <Badge className="border-transparent bg-slate-100 text-slate-700">
          {deviceBadgeLabel}
        </Badge>
      </div>
    </div>
  );
}

function DraftPanel({
  session,
  phase,
  onSaveOptionalVitals,
}: {
  session: LiveConversationSession;
  phase: LiveEncounterPhase;
  onSaveOptionalVitals: (draftPatch: Partial<LiveDraftExtraction>) => Promise<void> | void;
}) {
  const draft = session.draft.extractedData;
  const pendingReview = countPendingReview(session);
  const draftCount = countDraftSections(session);
  const isPreparingNotes = (phase === "ending_upload" || phase === "transcribing") && draftCount === 0;
  const medications = draft.medications.map((item) => {
    const instruction = typeof item.instruction === 'string'
      ? item.instruction
      : typeof item.instruction === 'object' && item.instruction
        ? JSON.stringify(item.instruction)
        : String(item.instruction || '');
    return `${item.name}${instruction ? ' · ' + instruction : ''}`;
  });
  const workup = [...draft.labs, ...draft.radiology, ...draft.procedures].map(item =>
    typeof item === 'string' ? item : typeof item === 'object' ? JSON.stringify(item) : String(item)
  );
  const planItems = [...draft.plan, ...draft.followUp].map(item =>
    typeof item === 'string' ? item : typeof item === 'object' ? JSON.stringify(item) : String(item)
  );
  const [optionalVitals, setOptionalVitals] = useState(() => ({
    bp: bloodPressureInputValue(draft.vitals.latest.bp.systolic, draft.vitals.latest.bp.diastolic),
    pulse: vitalInputValue(draft.vitals.latest.pulse.value),
    temperature: vitalInputValue(draft.vitals.latest.temperature.value),
    spo2: vitalInputValue(draft.vitals.latest.spo2.value),
    weight: vitalInputValue(draft.vitals.latest.weight.value),
  }));
  const [isSavingVitals, setIsSavingVitals] = useState(false);
  const demographics = [
    session.linkedPatient || draft.patient.name,
    draft.patient.age ? `Age: ${draft.patient.age}` : "",
    draft.patient.gender ? `Sex: ${draft.patient.gender}` : "",
  ].map(item => typeof item === 'string' ? item : String(item)).filter(Boolean);
  const vitals = [
    formatBloodPressure(draft.vitals.latest.bp.systolic, draft.vitals.latest.bp.diastolic)
      ? `Blood pressure: ${formatBloodPressure(draft.vitals.latest.bp.systolic, draft.vitals.latest.bp.diastolic)}`
      : "",
    formatVitalNumber(draft.vitals.latest.pulse.value, draft.vitals.latest.pulse.unit)
      ? `Pulse: ${formatVitalNumber(draft.vitals.latest.pulse.value, draft.vitals.latest.pulse.unit)}`
      : "",
    formatVitalNumber(draft.vitals.latest.temperature.value, draft.vitals.latest.temperature.unit)
      ? `Temperature: ${formatVitalNumber(draft.vitals.latest.temperature.value, draft.vitals.latest.temperature.unit)}`
      : "",
    formatVitalNumber(draft.vitals.latest.spo2.value, draft.vitals.latest.spo2.unit)
      ? `SpO2: ${formatVitalNumber(draft.vitals.latest.spo2.value, draft.vitals.latest.spo2.unit)}`
      : "",
    formatVitalNumber(draft.vitals.latest.weight.value, draft.vitals.latest.weight.unit)
      ? `Weight: ${formatVitalNumber(draft.vitals.latest.weight.value, draft.vitals.latest.weight.unit)}`
      : "",
  ].filter(Boolean);
  const vitalsLocked = session.status === "finalizing" || session.status === "finalized";

  useEffect(() => {
    setOptionalVitals({
      bp: bloodPressureInputValue(draft.vitals.latest.bp.systolic, draft.vitals.latest.bp.diastolic),
      pulse: vitalInputValue(draft.vitals.latest.pulse.value),
      temperature: vitalInputValue(draft.vitals.latest.temperature.value),
      spo2: vitalInputValue(draft.vitals.latest.spo2.value),
      weight: vitalInputValue(draft.vitals.latest.weight.value),
    });
  }, [
    session.id,
    session.updatedAt,
    draft.vitals.latest.bp.systolic,
    draft.vitals.latest.bp.diastolic,
    draft.vitals.latest.pulse.value,
    draft.vitals.latest.temperature.value,
    draft.vitals.latest.spo2.value,
    draft.vitals.latest.weight.value,
  ]);

  const handleSaveVitals = async () => {
    const latestPatch: Record<string, unknown> = {};
    const draftPatch: Partial<LiveDraftExtraction> = {
      vitals: {
        latest: latestPatch as LiveDraftExtraction["vitals"]["latest"],
      },
    };

    const bpMatch = optionalVitals.bp.trim().match(/(\d{2,3})\s*(?:\/|over)\s*(\d{2,3})/i);
    if (bpMatch) {
      latestPatch.bp = {
        systolic: Number(bpMatch[1]),
        diastolic: Number(bpMatch[2]),
      };
    }

    const pulse = Number(optionalVitals.pulse);
    if (Number.isFinite(pulse) && pulse > 0) {
      latestPatch.pulse = {
        value: pulse,
        unit: draft.vitals.latest.pulse.unit || "bpm",
      };
    }

    const temperature = Number(optionalVitals.temperature);
    if (Number.isFinite(temperature) && temperature > 0) {
      latestPatch.temperature = {
        value: temperature,
        unit: draft.vitals.latest.temperature.unit || "F",
      };
    }

    const spo2 = Number(optionalVitals.spo2);
    if (Number.isFinite(spo2) && spo2 > 0) {
      latestPatch.spo2 = {
        value: spo2,
        unit: draft.vitals.latest.spo2.unit || "%",
      };
    }

    const weight = Number(optionalVitals.weight);
    if (Number.isFinite(weight) && weight > 0) {
      latestPatch.weight = {
        value: weight,
        unit: draft.vitals.latest.weight.unit || "kg",
      };
    }

    if (Object.keys(latestPatch).length === 0) {
      toast.error("Enter at least one vital to save.");
      return;
    }

    try {
      setIsSavingVitals(true);
      await onSaveOptionalVitals(draftPatch);
      toast.success("Vitals saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save vitals.");
    } finally {
      setIsSavingVitals(false);
    }
  };

  const NoteSection = ({ title, items }: { title: string; items: string[] }) => (
    <div className="border-t border-slate-200/80 pt-3 first:border-t-0 first:pt-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-300">-</p>
      )}
    </div>
  );

  if (isPreparingNotes) {
    return (
      <ProcessingProgressState
        title="Building note draft"
        detail="The transcript is being converted into clinical sections. Extracted findings will fill this panel automatically."
        steps={["Transcript", "Problem list", "Orders and plan"]}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-700">
            <UserRound className="h-4 w-4" />
            <p className="text-[11px] uppercase tracking-[0.18em]">Encounter note</p>
          </div>
          {pendingReview > 0 ? (
            <Badge className="border-transparent bg-amber-50 text-amber-800">{pendingReview}</Badge>
          ) : null}
        </div>
        <div className="mt-3 border-t border-slate-200/80 pt-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Assessment</p>
          <p className="mt-2 text-sm text-slate-900">{draft.assessment || "Assessment pending clinician review"}</p>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
        <NoteSection title="Demographics" items={demographics} />
        <NoteSection title="Chief Complaint" items={draft.chiefComplaint ? [draft.chiefComplaint] : []} />
        <NoteSection title="HPI" items={draft.hpi ? [draft.hpi] : []} />
        <NoteSection title="ROS" items={(draft.ros || []).map(item =>
          typeof item === 'string' ? item : typeof item === 'object' ? JSON.stringify(item) : String(item)
        )} />
        <NoteSection title="Past History" items={(draft.pastHistory || []).map(item =>
          typeof item === 'string' ? item : typeof item === 'object' ? JSON.stringify(item) : String(item)
        )} />
        <NoteSection title="Vitals" items={vitals} />
        <NoteSection title="Symptoms" items={draft.symptoms.map(item =>
          typeof item === 'string' ? item : typeof item === 'object' ? JSON.stringify(item) : String(item)
        )} />
        <NoteSection title="Medications" items={medications} />
        <NoteSection title="Orders" items={workup} />
        <NoteSection title="Plan" items={planItems} />
        <div className="border-t border-slate-200/80 pt-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Optional vitals entry</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Vitals are captured from the conversation when available. Add or correct anything here only if needed.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Input
              value={optionalVitals.bp}
              onChange={(event) => setOptionalVitals((current) => ({ ...current, bp: event.target.value }))}
              placeholder="Blood pressure 120/80"
              disabled={vitalsLocked || isSavingVitals}
            />
            <Input
              value={optionalVitals.pulse}
              onChange={(event) => setOptionalVitals((current) => ({ ...current, pulse: event.target.value }))}
              placeholder="Pulse"
              disabled={vitalsLocked || isSavingVitals}
            />
            <Input
              value={optionalVitals.temperature}
              onChange={(event) => setOptionalVitals((current) => ({ ...current, temperature: event.target.value }))}
              placeholder="Temperature"
              disabled={vitalsLocked || isSavingVitals}
            />
            <Input
              value={optionalVitals.spo2}
              onChange={(event) => setOptionalVitals((current) => ({ ...current, spo2: event.target.value }))}
              placeholder="SpO2"
              disabled={vitalsLocked || isSavingVitals}
            />
            <Input
              value={optionalVitals.weight}
              onChange={(event) => setOptionalVitals((current) => ({ ...current, weight: event.target.value }))}
              placeholder="Weight"
              disabled={vitalsLocked || isSavingVitals}
            />
          </div>
          {!vitalsLocked ? (
            <div className="mt-3">
              <Button className={SECONDARY_TEAL_BUTTON} onClick={() => void handleSaveVitals()} disabled={isSavingVitals}>
                {isSavingVitals ? "Saving..." : "Save optional vitals"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReviewPanel({
  session,
  canFinalize,
  onResolveReviewItem,
  onFinalize,
  onReturnToDraft,
}: {
  session: LiveConversationSession;
  canFinalize: boolean;
  onResolveReviewItem: (reviewItemId: string, resolution: LiveReviewResolution, editedValue?: string) => void;
  onFinalize: () => void;
  onReturnToDraft: () => void;
}) {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [requiredEdits, setRequiredEdits] = useState<Record<string, string>>({});

  if (session.status === "finalized") {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-4 text-sm text-emerald-900">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-transparent bg-emerald-100 text-emerald-800">Published</Badge>
            <Badge variant="outline">Document {session.documentId}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {session.documentId && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={ICON_ACTION_BUTTON}
                    aria-label="Generate SOAP Note"
                    title="Generate SOAP Note"
                    onClick={() => {
                      window.location.href = `/soap/${session.documentId}`;
                    }}
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Generate SOAP Note</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {session.documentId && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={ICON_ACTION_BUTTON}
                    aria-label="Generate Prescription"
                    title="Generate Prescription"
                    onClick={() => {
                      window.location.href = `/prescription/${session.documentId}`;
                    }}
                  >
                    <Pill className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Generate Prescription</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={ICON_ACTION_BUTTON}
                  aria-label="Open Dashboard"
                  title="Open Dashboard"
                  onClick={() => {
                    if (session.documentId) {
                      window.location.href = `/dashboard?documentId=${session.documentId}`;
                    }
                  }}
                >
                  <LayoutDashboard className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Open Dashboard</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button className={SECONDARY_TEAL_BUTTON} onClick={onReturnToDraft}>
            Back to voice workspace
          </Button>
        </div>
      </div>
    );
  }

  if (!["review_required", "finalizing"].includes(session.status)) {
    return <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-400">-</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-900">Review</p>
        <Button className={PRIMARY_TEAL_BUTTON} onClick={onFinalize} disabled={!canFinalize || session.status === "finalizing"}>
          <FileCheck2 className="mr-2 h-4 w-4" />
          {session.status === "finalizing" ? "Finalizing..." : "Finalize"}
        </Button>
      </div>

      {!canFinalize ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
          <ShieldAlert className="h-4 w-4" />
          <p className="font-medium">Review required</p>
        </div>
      ) : null}

      {session.draft.reviewItems.map((item) => {
        const isEditing = editingItemId === item.id;
        const requiredValue = requiredEdits[item.id] ?? item.editedValue ?? item.suggestedValue ?? "";
        return (
          <article key={item.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={severityTone(item.severity)}>{item.severity}</Badge>
              <Badge variant="outline">{item.category.replace(/_/g, " ")}</Badge>
              <Badge variant="outline">{item.resolution}</Badge>
              {item.required ? <Badge variant="outline">required</Badge> : null}
            </div>
            <p className="mt-3 text-sm font-medium text-slate-900">{item.title}</p>
            <p className="mt-2 text-sm text-slate-600">{item.editedValue || item.suggestedValue || "Enter manually"}</p>

            {item.required ? (
              <div className="mt-3 space-y-3">
                {item.inputType === "select" && Array.isArray(item.options) && item.options.length > 0 ? (
                  <select
                    value={requiredValue}
                    onChange={(event) => {
                      setRequiredEdits((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }));
                    }}
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
                    aria-label={item.title}
                  >
                    <option value="">{item.placeholder || "Select value"}</option>
                    {item.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type={item.inputType === "number" ? "number" : "text"}
                    value={requiredValue}
                    onChange={(event) => {
                      setRequiredEdits((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }));
                    }}
                    placeholder={item.placeholder || "Enter value"}
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    className={PRIMARY_TEAL_BUTTON}
                    onClick={async () => {
                      await onResolveReviewItem(item.id, "edited", requiredValue);
                      setRequiredEdits((current) => {
                        const next = { ...current };
                        delete next[item.id];
                        return next;
                      });
                    }}
                    disabled={!requiredValue.trim()}
                  >
                    <CheckCheck className="mr-2 h-4 w-4" />
                    Save
                  </Button>
                </div>
              </div>
            ) : isEditing ? (
              <div className="mt-3 space-y-3">
                <Input
                  value={editingValue}
                  onChange={(event) => setEditingValue(event.target.value)}
                  placeholder="Edit extracted value"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    className={PRIMARY_TEAL_BUTTON}
                    onClick={async () => {
                      await onResolveReviewItem(item.id, "edited", editingValue);
                      setEditingItemId(null);
                      setEditingValue("");
                    }}
                  >
                    <CheckCheck className="mr-2 h-4 w-4" />
                    Save
                  </Button>
                  <Button
                    className={SECONDARY_TEAL_BUTTON}
                    onClick={() => {
                      setEditingItemId(null);
                      setEditingValue("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button className={PRIMARY_TEAL_BUTTON} onClick={() => onResolveReviewItem(item.id, "approved")}>
                  <CheckCheck className="mr-2 h-4 w-4" />
                  Approve
                </Button>
                <Button
                  className={SECONDARY_TEAL_BUTTON}
                  onClick={() => {
                    setEditingItemId(item.id);
                    setEditingValue(item.editedValue || item.suggestedValue);
                  }}
                >
                  <Edit3 className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button className={SECONDARY_TEAL_BUTTON} onClick={() => onResolveReviewItem(item.id, "rejected")}>
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </Button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function ContextPanel({
  session,
  phase,
  onUpdateSession,
  hasPendingReview,
  onResolveReviewItem,
  onFinalize,
  onReturnToDraft,
  availableDevices,
}: {
  session: LiveConversationSession;
  phase: LiveEncounterPhase;
  onUpdateSession: (patch: { linkedPatient?: string; encounterLabel?: string; deviceId?: string; draftPatch?: Partial<LiveDraftExtraction> }) => void | Promise<void>;
  hasPendingReview: boolean;
  onResolveReviewItem: (reviewItemId: string, resolution: LiveReviewResolution, editedValue?: string) => Promise<void> | void;
  onFinalize: () => void;
  onReturnToDraft: () => void;
  availableDevices: Array<{ id: string; label: string }>;
}) {
  const setupCount = countSetupFields(session);
  const draftCount = countDraftSections(session);
  const pendingReviewCount = countPendingReview(session);
  const isReviewSectionVisible = session.status === "finalized"
    || session.status === "finalizing"
    || (session.status === "review_required" && phase !== "ending_upload" && phase !== "transcribing");
  const openSections = [
    "setup",
    "draft",
    ...(isReviewSectionVisible
      ? ["review"]
      : []),
  ];

  const SectionTrigger = ({
    icon,
    label,
    value,
    tone = "slate",
  }: {
    icon: React.ReactNode;
    label: string;
    value?: string;
    tone?: "slate" | "amber" | "teal";
  }) => (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
          tone === "amber" && "border-amber-200 bg-amber-50 text-amber-800",
          tone === "teal" && "border-teal-200 bg-teal-50 text-teal-700",
          tone === "slate" && "border-slate-200 bg-slate-100 text-slate-700",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{label}</p>
      </div>
      {value ? (
        <Badge variant="outline" className="ml-auto">
          {value}
        </Badge>
      ) : null}
    </div>
  );

  return (
    <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm xl:sticky xl:top-5 xl:self-start">
      <CardContent className="p-0">
        <Accordion type="multiple" defaultValue={openSections} className="px-4">
          <AccordionItem value="setup" className="border-slate-200/80">
            <AccordionTrigger className="py-4 hover:no-underline">
              <SectionTrigger
                icon={<Mic className="h-4 w-4" />}
                label="Encounter"
                value={`${setupCount}/3`}
                tone="teal"
              />
            </AccordionTrigger>
            <AccordionContent className="pt-0">
              <SetupPanel session={session} onUpdate={onUpdateSession} availableDevices={availableDevices} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="draft" className="border-slate-200/80">
            <AccordionTrigger className="py-4 hover:no-underline">
              <SectionTrigger
                icon={<FileCheck2 className="h-4 w-4" />}
                label="Note"
                value={draftCount > 0 ? String(draftCount) : undefined}
              />
            </AccordionTrigger>
            <AccordionContent className="pt-0">
              <DraftPanel
                session={session}
                phase={phase}
                onSaveOptionalVitals={async (draftPatch) => {
                  await onUpdateSession({ draftPatch });
                }}
              />
            </AccordionContent>
          </AccordionItem>

          {isReviewSectionVisible ? (
            <AccordionItem value="review" className="border-slate-200/80">
              <AccordionTrigger className="py-4 hover:no-underline">
                <SectionTrigger
                  icon={<ShieldAlert className="h-4 w-4" />}
                  label="Review"
                  value={session.status === "finalized" ? "Done" : String(pendingReviewCount)}
                  tone={pendingReviewCount > 0 ? "amber" : "slate"}
                />
              </AccordionTrigger>
              <AccordionContent className="pt-0">
                <ReviewPanel
                  session={session}
                  canFinalize={!hasPendingReview}
                  onResolveReviewItem={onResolveReviewItem}
                  onFinalize={onFinalize}
                  onReturnToDraft={onReturnToDraft}
                />
              </AccordionContent>
            </AccordionItem>
          ) : null}
        </Accordion>
      </CardContent>
    </Card>
  );
}

export default function LiveConversationWorkspace() {
  const [isVisitsCollapsed, setIsVisitsCollapsed] = useState(false);
  const [audioDurationMsBySessionId, setAudioDurationMsBySessionId] = useState<Record<string, number>>({});
  const {
    sessions,
    selectedSession,
    selectedSessionId,
    selectedSessionPhase,
    hasPendingReview,
    isLoading,
    error,
    availableDevices,
    createDraftSession,
    selectSession,
    returnToDraft,
    updateSelectedSession,
    startSelectedSession,
    pauseSelectedSession,
    resumeSelectedSession,
    stopSelectedSession,
    resolveReviewItem,
    finalizeSelectedSession,
    deleteSession,
    deleteSelectedRecording,
    deleteSelectedFinalizedVisit,
    refreshSessions,
    captureState,
    transportState,
    audioLevel,
  } = useLiveConversationAPI();

  const handleAudioDurationDetected = (sessionId: string, durationMs: number) => {
    if (!sessionId || !Number.isFinite(durationMs) || durationMs <= 0) return;
    setAudioDurationMsBySessionId((current) => {
      if (current[sessionId] === durationMs) return current;
      return {
        ...current,
        [sessionId]: durationMs,
      };
    });
  };

  const runSessionAction = async (action: () => Promise<void>, fallbackMessage: string) => {
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : fallbackMessage);
    }
  };

  if (!selectedSession) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-slate-500">{isLoading ? "Loading live conversations..." : "No session selected"}</p>
          {!isLoading ? (
            <Button
              className="mt-4 border-teal-600 bg-teal-600 text-white hover:border-teal-700 hover:bg-teal-700"
              onClick={() => createDraftSession()}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Session
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Ambient capture</p>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">Live conversation</h2>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      )}

      <div className={`grid items-start gap-5 ${isVisitsCollapsed ? "xl:grid-cols-[0px_minmax(0,1fr)_400px] 2xl:grid-cols-[0px_minmax(0,1fr)_430px]" : "xl:grid-cols-[248px_minmax(0,1fr)_400px] 2xl:grid-cols-[248px_minmax(0,1fr)_430px]"}`}>
        <SessionList
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          selectedSessionStatus={selectedSession.status}
          onSelectSession={selectSession}
          onCreateDraftSession={createDraftSession}
          isCollapsed={isVisitsCollapsed}
          onToggleCollapse={() => setIsVisitsCollapsed(!isVisitsCollapsed)}
        />

        <div className="grid content-start gap-4 self-start">
          <ControlBar
            session={selectedSession}
            resolvedAudioDurationMs={audioDurationMsBySessionId[selectedSession.id] || selectedSession.audio?.durationMs || null}
            onStart={() => {
              void runSessionAction(startSelectedSession, "Unable to start live conversation.");
            }}
            onPause={() => {
              void runSessionAction(pauseSelectedSession, "Unable to pause live conversation.");
            }}
            onResume={() => {
              void runSessionAction(resumeSelectedSession, "Unable to resume live conversation.");
            }}
            onStop={() => {
              void runSessionAction(stopSelectedSession, "Unable to end live conversation.");
            }}
            onDeleteVisit={selectedSession.status === "finalized" ? deleteSelectedFinalizedVisit : async () => {
              if (selectedSessionId) {
                await deleteSession(selectedSessionId);
              }
            }}
            phase={selectedSessionPhase}
            audioLevel={audioLevel}
          />
          <RecordingPanel
            session={selectedSession}
            onDeleteRecording={deleteSelectedRecording}
            onAudioDurationDetected={handleAudioDurationDetected}
          />
          <TranscriptPanel
            session={selectedSession}
            phase={selectedSessionPhase}
            audioLevel={audioLevel}
          />
        </div>

        <ContextPanel
          session={selectedSession}
          phase={selectedSessionPhase}
          onUpdateSession={updateSelectedSession}
          hasPendingReview={hasPendingReview}
          onResolveReviewItem={resolveReviewItem}
          onFinalize={() => {
            void runSessionAction(finalizeSelectedSession, "Unable to finalize the visit.");
          }}
          onReturnToDraft={returnToDraft}
          availableDevices={availableDevices}
        />
      </div>
    </div>
  );
}
