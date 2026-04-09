import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PatientHeader from "@/components/dashboard/PatientHeader";
import SectionCard from "@/components/dashboard/SectionCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import VitalsDetail from "@/components/dashboard/VitalsDetail";
import DiagnosisDetail from "@/components/dashboard/DiagnosisDetail";
import MedicationsDetail from "@/components/dashboard/MedicationsDetail";
import LabsDetail from "@/components/dashboard/LabsDetail";
import RadiologyDetail from "@/components/dashboard/RadiologyDetail";
import TreatmentDetail from "@/components/dashboard/TreatmentDetail";
import ClinicalNotesDetail from "@/components/dashboard/ClinicalNotesDetail";
import DischargeDetail from "@/components/dashboard/DischargeDetail";
import FollowUpDetail from "@/components/dashboard/FollowUpDetail";
import PendingItemsDetail from "@/components/dashboard/PendingItemsDetail";
import RiskWatchDetail from "@/components/dashboard/RiskWatchDetail";
import ChatAssistantPanel from "@/components/dashboard/ChatAssistantPanel";
import type { DashboardPatientData } from "@/data/patientData";
import {
  API_BASE,
  extractProcessedDocumentResponse,
  getProcessedDocumentMrn,
  getProcessedDocumentPatientName,
  transformProcessedDocument,
  type ProcessedDocument,
} from "@/lib/processedDocuments";
import { ArrowLeft, ChevronLeft, ChevronRight, Printer, Mail, FileDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

type Section = null | "vitals" | "diagnosis" | "medications" | "labs" | "radiology" | "treatment" | "notes" | "discharge" | "followup" | "pending" | "riskwatch";
const SECTIONS = new Set<Exclude<Section, null>>([
  "vitals",
  "diagnosis",
  "medications",
  "labs",
  "radiology",
  "treatment",
  "notes",
  "discharge",
  "followup",
  "pending",
  "riskwatch",
]);

const formatStatusLabel = (value: string) =>
  value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const formatDateLabel = (value?: string) => {
  if (!value) return "Not scheduled";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const clampLines = (lines: number) => ({
  display: "-webkit-box",
  WebkitLineClamp: lines,
  WebkitBoxOrient: "vertical" as const,
  overflow: "hidden",
});

const CARD_VALUE_CLASS = "text-[20px] font-semibold leading-none text-slate-900";
const CARD_LABEL_CLASS = "text-[11px] font-medium text-slate-500";
const CARD_TEXT_CLASS = "text-[12px] leading-5 text-slate-600";
const CARD_META_CLASS = "text-[11px] text-slate-500";

const SUMMARY_CARD_CONFIG: Record<
  "vitals" | "diagnosis" | "medications" | "labs" | "radiology" | "treatment",
  { icon: string; colorClass: string; section: Exclude<Section, null> }
> = {
  vitals: { icon: "📊", colorClass: "bg-[hsl(var(--section-vitals))]", section: "vitals" },
  diagnosis: { icon: "🩺", colorClass: "bg-[hsl(var(--section-diagnosis))]", section: "diagnosis" },
  medications: { icon: "💊", colorClass: "bg-[hsl(var(--section-medications))]", section: "medications" },
  labs: { icon: "🔬", colorClass: "bg-[hsl(var(--section-labs))]", section: "labs" },
  radiology: { icon: "🫀", colorClass: "bg-[hsl(var(--section-radiology))]", section: "radiology" },
  treatment: { icon: "🏥", colorClass: "bg-[hsl(var(--section-treatment))]", section: "treatment" },
};

const NOTE_PRIORITY_STYLES: Record<"normal" | "warning" | "critical", string> = {
  normal: "bg-blue-500",
  warning: "bg-amber-500",
  critical: "bg-rose-500",
};

const Index = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [processedDocument, setProcessedDocument] = useState<ProcessedDocument | null>(null);
  const [processedQueue, setProcessedQueue] = useState<ProcessedDocument[]>([]);
  const [recordSearchOpen, setRecordSearchOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const documentId = searchParams.get("documentId");
  const activeSectionParam = searchParams.get("section");
  const activeSection: Section = activeSectionParam && SECTIONS.has(activeSectionParam as Exclude<Section, null>)
    ? (activeSectionParam as Exclude<Section, null>)
    : null;
  const d: DashboardPatientData | null = useMemo(
    () => (processedDocument?.result ? transformProcessedDocument(processedDocument) : null),
    [processedDocument],
  );
  const summaryCards = d?.presentation?.summaryCards || {};
  const notesRail = d?.presentation?.notesRail || [];
  const careGapsCard = summaryCards.care_gaps;
  const riskWatchCard = summaryCards.risk_watch;

  const renderSummaryCardContent = (key: keyof typeof SUMMARY_CARD_CONFIG) => {
    const card = summaryCards[key];

    if (key === "vitals") {
      return (
        <div className="flex h-full flex-col justify-between gap-1 overflow-hidden">
          <div className="space-y-1">
            <div className={`flex items-center justify-between ${CARD_META_CLASS}`}>
              <span>BP</span>
              <span className="font-semibold text-slate-900">
              {d.vitals.latest.bloodPressure.systolic}/{d.vitals.latest.bloodPressure.diastolic}
                <span className="ml-1 text-[11px] font-medium text-slate-400">mmHg</span>
              </span>
            </div>
            <div className={`flex items-center justify-between ${CARD_META_CLASS}`}>
              <span>Pulse</span>
              <span className="font-semibold text-slate-900">{d.vitals.latest.heartRate.value} bpm</span>
            </div>
            <div className={`flex items-center justify-between ${CARD_META_CLASS}`}>
              <span>SpO2</span>
              <span className="font-semibold text-slate-900">{d.vitals.latest.spo2.value}%</span>
            </div>
            <div className={`flex items-center justify-between ${CARD_META_CLASS}`}>
              <span>Temp</span>
              <span className="font-semibold text-slate-900">{d.vitals.latest.temperature.value}°F</span>
            </div>
          </div>
          <div>
            <StatusBadge
              status={((card?.status || "neutral") === "info" ? "neutral" : card?.status || "neutral") as "normal" | "warning" | "critical" | "neutral"}
              label={formatStatusLabel(card?.status || "neutral")}
            />
          </div>
        </div>
      );
    }

    if (key === "diagnosis") {
      return (
        <div className="flex h-full flex-col justify-between gap-1 overflow-hidden">
          <p
            className="text-[13px] font-semibold leading-[1.4] text-slate-900"
            style={clampLines(3)}
          >
            {d.diagnosis.principal.description || card?.headlineMetric || "Diagnosis not available"}
          </p>
          <div className={`flex flex-wrap items-center gap-1.5 ${CARD_META_CLASS}`}>
            {d.diagnosis.principal.code ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-500">
                {d.diagnosis.principal.code}
              </span>
            ) : null}
            {d.diagnosis.secondary.length > 0 ? <span>+{d.diagnosis.secondary.length} secondary</span> : null}
          </div>
        </div>
      );
    }

    if (key === "medications") {
      return (
        <div className="flex h-full flex-col justify-between gap-1 overflow-hidden">
          <div className="flex items-baseline gap-1.5">
            <span className={CARD_VALUE_CLASS}>{d.medications.active.length}</span>
            <span className={CARD_LABEL_CLASS}>active medications</span>
          </div>
          <div className="space-y-0.5">
            {d.medications.active.slice(0, 2).map((med) => (
              <p key={med.name} className={CARD_TEXT_CLASS}>
                {med.name}
              </p>
            ))}
            {d.medications.active.length === 0 ? <p className={CARD_TEXT_CLASS}>No active medications documented.</p> : null}
          </div>
        </div>
      );
    }

    if (key === "labs") {
      return (
        <div className="flex h-full flex-col justify-between gap-1 overflow-hidden">
          <div className="flex items-baseline gap-1.5">
            <span className={CARD_VALUE_CLASS}>{d.labs.totalTests}</span>
            <span className={CARD_LABEL_CLASS}>{d.labs.hasResults ? "tests completed" : "tests ordered"}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {d.labs.abnormalCount > 0 ? <StatusBadge status="warning" label={`${d.labs.abnormalCount} abnormal`} /> : null}
            {d.labs.criticalCount > 0 ? <StatusBadge status="critical" label={`${d.labs.criticalCount} critical`} /> : null}
            {d.labs.abnormalCount === 0 && d.labs.criticalCount === 0 ? <StatusBadge status="normal" label="Normal" /> : null}
          </div>
          <p className={CARD_TEXT_CLASS} style={clampLines(2)}>
            {card?.supportingPoints?.[0] || (d.labs.hasResults ? "Results available for review." : `${d.labs.pendingCount} investigations ordered.`)}
          </p>
        </div>
      );
    }

    if (key === "radiology") {
      return (
        <div className="flex h-full flex-col justify-between gap-1 overflow-hidden">
          <div className="flex items-baseline gap-1.5">
            <span className={CARD_VALUE_CLASS}>{d.radiology.completedStudies}</span>
            <span className={CARD_LABEL_CLASS}>findings</span>
          </div>
          {d.radiology.criticalFindings > 0 ? <StatusBadge status="critical" label={`${d.radiology.criticalFindings} critical`} /> : <StatusBadge status="normal" label="Normal" />}
          <p className={CARD_TEXT_CLASS} style={clampLines(2)}>
            {d.radiology.pendingStudies > 0 ? `${d.radiology.pendingStudies} pending imaging items documented.` : "No pending imaging documented."}
          </p>
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col justify-between gap-1 overflow-hidden">
        <div className="flex items-baseline gap-1.5">
          <span className={CARD_VALUE_CLASS}>{d.treatment.activeManagement.length}</span>
          <span className={CARD_LABEL_CLASS}>plan items</span>
        </div>
        <p
          className="text-[12px] font-medium leading-5 text-slate-800"
          style={clampLines(2)}
        >
          {d.treatment.currentApproach}
        </p>
        <p className={CARD_META_CLASS} style={clampLines(1)}>{d.treatment.complicationsLabel}</p>
      </div>
    );
  };

  const updateSection = (section: Section) => {
    const params = new URLSearchParams(searchParams);
    if (section) params.set("section", section);
    else params.delete("section");
    navigate(`/dashboard${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const handleBack = () => updateSection(null);

  useEffect(() => {
    if (!documentId) {
      navigate("/", { replace: true });
    }
  }, [documentId, navigate]);

  useEffect(() => {
    fetch(`${API_BASE}/documents`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load processed queue.");
        }

        return response.json();
      })
      .then((payload) => {
        const queue = (payload.documents ?? []).filter((document: ProcessedDocument) => document.status === "processed");
        setProcessedQueue(queue);
      })
      .catch(() => {
        setProcessedQueue([]);
      });
  }, [documentId]);

  useEffect(() => {
    if (!documentId) {
      setProcessedDocument(null);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    fetch(`${API_BASE}/documents/${documentId}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load processed dashboard document.");
        }

        return response.json();
      })
      .then((payload) => {
        if (!cancelled) {
          setProcessedDocument(extractProcessedDocumentResponse(payload));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load processed document.");
          setProcessedDocument(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const currentProcessedIndex = processedQueue.findIndex((document) => document.id === documentId);
  const previousProcessedDocument = currentProcessedIndex > 0 ? processedQueue[currentProcessedIndex - 1] : null;
  const nextProcessedDocument =
    currentProcessedIndex >= 0 && currentProcessedIndex < processedQueue.length - 1
      ? processedQueue[currentProcessedIndex + 1]
      : null;

  const openProcessedDocument = (id: string | null | undefined) => {
    if (!id) return;
    navigate(`/dashboard?documentId=${id}`);
  };

  const handleExportChartNote = async () => {
    if (!documentId) return;

    setIsExporting(true);
    try {
      // Request PDF export directly from server
      const response = await fetch(`${API_BASE}/documents/${documentId}/chart-note/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to generate chart note PDF");
      }

      // Get the PDF blob
      const pdfBlob = await response.blob();

      // Download the PDF
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chart-note-${documentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export chart note:", error);
      alert(error instanceof Error ? error.message : "Failed to generate chart note. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const dashboardToolbar = (
    <div className="mb-5 rounded-[22px] border border-slate-200 bg-white px-4 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="mb-3 flex items-center justify-between">
        <img src="/manipal-logo.png" alt="Manipal Hospitals" className="h-7" />
        <img src="/yavar-logo.png" alt="Powered by Yavar.ai" className="h-4 opacity-50" />
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50"
            onClick={() => (activeSection ? handleBack() : navigate("/"))}
          >
            <ArrowLeft className="h-4 w-4" />
            {activeSection ? "Summary" : "Queue"}
          </button>
          <span className="hidden text-slate-300 sm:inline">|</span>
          <div className="min-w-0">
            <h1 className="truncate text-[24px] font-semibold leading-none text-slate-900">Clinical Chartboard</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {documentId && processedQueue.length > 0 && (
            <>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                {currentProcessedIndex >= 0 ? currentProcessedIndex + 1 : 1}/{processedQueue.length}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-full border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 disabled:border-slate-200 disabled:bg-white disabled:text-slate-300"
                onClick={() => openProcessedDocument(previousProcessedDocument?.id)}
                disabled={!previousProcessedDocument}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                className="h-9 w-9 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400"
                onClick={() => openProcessedDocument(nextProcessedDocument?.id)}
                disabled={!nextProcessedDocument}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
          <Popover open={recordSearchOpen} onOpenChange={setRecordSearchOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-full border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                aria-label="Search records"
              >
                <Search className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[360px] p-0">
              <Command>
                <CommandInput placeholder="Search by MRN, patient, or PDF name" />
                <CommandList>
                  <CommandEmpty>No matching processed records.</CommandEmpty>
                  <CommandGroup heading="Processed Records">
                    {processedQueue.map((document) => {
                      const patientName = getProcessedDocumentPatientName(document) || "Patient not available";
                      const mrn = getProcessedDocumentMrn(document) || "MRN unavailable";

                      return (
                        <CommandItem
                          key={document.id}
                          value={`${document.name} ${patientName} ${mrn}`}
                          onSelect={() => {
                            setRecordSearchOpen(false);
                            openProcessedDocument(document.id);
                          }}
                        >
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-slate-900">{patientName}</span>
                            <span className="text-xs text-slate-500">{mrn}</span>
                            <span className="text-xs text-slate-500">{document.name}</span>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <button className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600" title="Print">
            <Printer className="w-4 h-4" />
          </button>
          <button className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600" title="Email">
            <Mail className="w-4 h-4" />
          </button>
          <button
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 disabled:opacity-50"
            title="Export Chart Note"
            onClick={handleExportChartNote}
            disabled={isExporting || !documentId}
          >
            <FileDown className={`w-4 h-4 ${isExporting ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );

  const assistantPanel = (
    <ChatAssistantPanel
      documentId={documentId}
      currentSection={activeSection}
      processedDocument={processedDocument}
    />
  );

  if (!documentId) return null;

  if (isLoading && !d) {
    return (
      <PageWrapper>
        {dashboardToolbar}
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading processed document...
        </div>
      </PageWrapper>
    );
  }

  if (!d) {
    return (
      <PageWrapper>
        {dashboardToolbar}
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6">
          <h2 className="text-base font-semibold text-rose-900">Processed document unavailable</h2>
          <p className="mt-2 text-sm text-rose-700">
            {loadError || "This processed record could not be loaded."}
          </p>
          <div className="mt-4">
            <Button onClick={() => navigate("/")} className="bg-rose-600 text-white hover:bg-rose-700">
              Back to Queue
            </Button>
          </div>
        </div>
      </PageWrapper>
    );
  }

  if (activeSection === "vitals") return <PageWrapper>{dashboardToolbar}<VitalsDetail onBack={handleBack} data={d} />{assistantPanel}</PageWrapper>;
  if (activeSection === "diagnosis") return <PageWrapper>{dashboardToolbar}<DiagnosisDetail onBack={handleBack} data={d} />{assistantPanel}</PageWrapper>;
  if (activeSection === "medications") return <PageWrapper>{dashboardToolbar}<MedicationsDetail onBack={handleBack} data={d} />{assistantPanel}</PageWrapper>;
  if (activeSection === "labs") return <PageWrapper>{dashboardToolbar}<LabsDetail onBack={handleBack} data={d} />{assistantPanel}</PageWrapper>;
  if (activeSection === "radiology") return <PageWrapper>{dashboardToolbar}<RadiologyDetail onBack={handleBack} data={d} />{assistantPanel}</PageWrapper>;
  if (activeSection === "treatment") return <PageWrapper>{dashboardToolbar}<TreatmentDetail onBack={handleBack} data={d} />{assistantPanel}</PageWrapper>;
  if (activeSection === "notes") return <PageWrapper>{dashboardToolbar}<ClinicalNotesDetail onBack={handleBack} data={d} />{assistantPanel}</PageWrapper>;
  if (activeSection === "discharge") return <PageWrapper>{dashboardToolbar}<DischargeDetail onBack={handleBack} data={d} />{assistantPanel}</PageWrapper>;
  if (activeSection === "followup") return <PageWrapper>{dashboardToolbar}<FollowUpDetail onBack={handleBack} data={d} />{assistantPanel}</PageWrapper>;
  if (activeSection === "pending") return <PageWrapper>{dashboardToolbar}<PendingItemsDetail onBack={handleBack} data={d} />{assistantPanel}</PageWrapper>;
  if (activeSection === "riskwatch") return <PageWrapper>{dashboardToolbar}<RiskWatchDetail onBack={handleBack} data={d} />{assistantPanel}</PageWrapper>;

  return (
    <PageWrapper>
      {dashboardToolbar}

      {documentId && (
        <div className="mb-4 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              {isLoading
                ? "Loading processed document..."
                : loadError
                  ? loadError
                  : `Showing processed output for ${processedDocument?.name || "processed document"}.`}
            </div>
            {processedDocument?.agentInfo && (
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Agent:</span>
                  <span className="font-medium">{processedDocument.agentInfo.name}</span>
                  <span className="text-muted-foreground">v{processedDocument.agentInfo.version}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Tokens:</span>
                  <span className="font-medium">{processedDocument.agentInfo.tokensUsed?.toLocaleString() || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Confidence:</span>
                  <span className={`font-medium ${
                    processedDocument.agentInfo.validation?.confidence_level === 'high' ? 'text-emerald-600' :
                    processedDocument.agentInfo.validation?.confidence_level === 'medium' ? 'text-amber-600' :
                    'text-rose-600'
                  }`}>
                    {processedDocument.agentInfo.validation?.confidence_level || 'N/A'}
                  </span>
                </div>
                {processedDocument.agentInfo.steps && (
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Steps:</span>
                    <span className="font-medium">{processedDocument.agentInfo.steps.length}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <PatientHeader data={d} />

      <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:auto-rows-[156px] xl:grid-cols-3">
          {(Object.keys(SUMMARY_CARD_CONFIG) as Array<keyof typeof SUMMARY_CARD_CONFIG>).map((key) => {
            const config = SUMMARY_CARD_CONFIG[key];
            const card = summaryCards[key];

            return (
              <SectionCard
                key={key}
                icon={<span className="text-base">{config.icon}</span>}
                title={card?.title || config.section}
                colorClass={config.colorClass}
                onClick={() => updateSection(config.section)}
              >
                {renderSummaryCardContent(key)}
              </SectionCard>
            );
          })}

          <SectionCard
            icon={<span className="text-base">🧩</span>}
            title={careGapsCard?.title || "Care Gaps"}
            colorClass="bg-[hsl(var(--section-pending))]"
            onClick={() => updateSection("pending")}
          >
            <div className="flex h-full flex-col justify-between gap-1 overflow-hidden">
              <div className="flex items-baseline gap-1.5">
                <span className={CARD_VALUE_CLASS}>{careGapsCard?.headlineMetric || "0"}</span>
                <span className={CARD_LABEL_CLASS}>{careGapsCard?.secondaryLine || "open care gaps"}</span>
              </div>
              <p className="text-[12px] font-medium text-slate-800" style={clampLines(1)}>
                {careGapsCard?.supportingPoints?.[0] || "No unresolved continuity gaps"}
              </p>
              <p className={CARD_META_CLASS} style={clampLines(1)}>
                {careGapsCard?.supportingPoints?.[1] || "All key follow-through items are covered"}
              </p>
            </div>
          </SectionCard>

        <SectionCard
          icon={<span className="text-base">📋</span>}
          title="Discharge Plan"
          colorClass="bg-[hsl(var(--section-discharge))]"
          onClick={() => updateSection("discharge")}
          >
            <div className="flex h-full flex-col justify-between gap-1 overflow-hidden">
              <p className="text-[12px] font-medium text-slate-800" style={clampLines(1)}>Condition: <span className="font-semibold text-slate-900">{d.dischargePlan.condition}</span></p>
              <p className={CARD_TEXT_CLASS} style={clampLines(2)}>
                {d.dischargePlan.dietary.length + d.dischargePlan.activityRestrictions.doNot.length + d.dischargePlan.activityRestrictions.okToDo.length} documented instructions
              </p>
              <p className={CARD_META_CLASS} style={clampLines(1)}>
                {d.dischargePlan.pendingItems.length} Pending • {d.dischargePlan.redFlags.length} Risks
              </p>
            </div>
          </SectionCard>

          <SectionCard
            icon={<span className="text-base">🛡️</span>}
            title={riskWatchCard?.title || "Risk Watch"}
            colorClass="bg-rose-100"
            onClick={() => updateSection("riskwatch")}
          >
            <div className="flex h-full flex-col justify-between gap-1 overflow-hidden">
              <div className="flex items-baseline gap-1.5">
                <span className={CARD_VALUE_CLASS}>{riskWatchCard?.headlineMetric || "0"}</span>
                <span className={CARD_LABEL_CLASS}>{riskWatchCard?.secondaryLine || "stable watch"}</span>
              </div>
              <p className="text-[12px] font-medium text-slate-800" style={clampLines(1)}>
                {riskWatchCard?.supportingPoints?.[0] || d.riskWatch.items.slice(0, 2).map((item) => item.summary).join(" · ") || "No active clinical watch items documented"}
              </p>
              <p className={CARD_META_CLASS} style={clampLines(1)}>
                {riskWatchCard?.supportingPoints?.[1] || (d.riskWatch.ewsScore != null ? `EWS ${d.riskWatch.ewsScore}` : "No early warning score documented")}
              </p>
            </div>
          </SectionCard>

          <SectionCard
            icon={<span className="text-base">📅</span>}
            title="Next Appointment"
            colorClass="bg-[hsl(var(--section-followup))]"
            onClick={() => updateSection("followup")}
          >
            <div className="flex h-full flex-col justify-between gap-1 overflow-hidden">
              <div className="flex items-baseline gap-1.5">
                <span className={CARD_VALUE_CLASS}>{formatDateLabel(d.followUp[0]?.date)}</span>
              </div>
              <p className="text-[12px] font-medium text-slate-800" style={clampLines(1)}>
                {d.followUp[0]?.department || "Not scheduled"}
              </p>
              <p className={CARD_META_CLASS} style={clampLines(1)}>
                {d.followUp.length > 0 ? `${d.followUp.length} appointment${d.followUp.length > 1 ? "s" : ""} planned` : "Needs scheduling"}
              </p>
            </div>
          </SectionCard>
        </div>

        <div className="section-card flex min-h-[420px] flex-col overflow-hidden border-slate-200 bg-white xl:h-[492px] xl:min-h-[492px]">
          <div className="border-b border-slate-100 px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-base">📝</div>
                <div>
                  <h3 className="text-[13px] font-semibold text-slate-900">Notes</h3>
                <p className="text-[11px] text-slate-400">{notesRail.length} today</p>
                </div>
              </div>
              <button
                className="text-[11px] font-medium text-blue-600 transition-colors hover:text-blue-700"
                onClick={() => updateSection("notes")}
              >
                Open
              </button>
            </div>
          </div>

          <div className="space-y-2.5 px-3.5 py-3 flex-1 overflow-y-auto">
            {notesRail.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center">
                <p className="text-sm font-medium text-slate-600">No source-backed notes yet</p>
                <p className="mt-1 text-xs text-slate-400">Reprocess the document to populate the notes rail.</p>
              </div>
            ) : (
              notesRail.map((item, index) => (
                <div key={`${item.title}-${item.timestamp}-${index}`} className="flex gap-2.5">
                  <div className="flex flex-col items-center pt-1">
                    <span className={`h-2 w-2 rounded-full ${NOTE_PRIORITY_STYLES[item.priority]}`} />
                    {index < notesRail.length - 1 ? <span className="mt-2 h-full w-px bg-slate-200" /> : null}
                  </div>
                  <div className="min-w-0 pb-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-[12px] font-medium text-slate-800">{item.author || item.title}</p>
                      {item.timestamp ? <span className="text-[11px] text-slate-400">{item.timestamp}</span> : null}
                    </div>
                    <p className="mt-0.5 text-[11px] uppercase tracking-[0.04em] text-slate-500">{item.title}</p>
                    <p className="mt-0.5 text-[12px] leading-5 text-slate-600">{item.body || "No summary available."}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {assistantPanel}
    </PageWrapper>
  );
};

const PageWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-background">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      {children}
    </div>
  </div>
);

export default Index;
