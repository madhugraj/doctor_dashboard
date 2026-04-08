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
import SectionProvenanceBadge from "@/components/dashboard/SectionProvenanceBadge";
import ChatAssistantPanel from "@/components/dashboard/ChatAssistantPanel";
import { patientData, type DashboardPatientData } from "@/data/patientData";
import {
  API_BASE,
  extractProcessedDocumentResponse,
  fallbackDashboardData,
  getProcessedDocumentMrn,
  getProcessedDocumentPatientName,
  transformProcessedDocument,
  type ProcessedDocument,
} from "@/lib/processedDocuments";
import { ArrowLeft, ChevronLeft, ChevronRight, Printer, Mail, FileDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

type Section = null | "vitals" | "diagnosis" | "medications" | "labs" | "radiology" | "treatment" | "notes" | "discharge" | "followup";

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
  const [activeSection, setActiveSection] = useState<Section>(null);
  const [processedDocument, setProcessedDocument] = useState<ProcessedDocument | null>(null);
  const [processedQueue, setProcessedQueue] = useState<ProcessedDocument[]>([]);
  const [recordSearchOpen, setRecordSearchOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const documentId = searchParams.get("documentId");
  const d: DashboardPatientData = useMemo(
    () => (processedDocument?.result ? transformProcessedDocument(processedDocument) : fallbackDashboardData),
    [processedDocument],
  );
  const summaryCards = d.presentation?.summaryCards || {};
  const notesRail = d.presentation?.notesRail || [];

  const renderSummaryCardContent = (key: keyof typeof SUMMARY_CARD_CONFIG) => {
    const card = summaryCards[key];

    if (key === "vitals") {
      return (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[12px] text-slate-500">
            <span>BP</span>
            <span className="font-semibold text-slate-900">
              {d.vitals.latest.bloodPressure.systolic}/{d.vitals.latest.bloodPressure.diastolic}
              <span className="ml-1 text-[11px] font-medium text-slate-400">mmHg</span>
            </span>
          </div>
          <div className="flex items-center justify-between text-[12px] text-slate-500">
            <span>Pulse</span>
            <span className="font-semibold text-slate-900">{d.vitals.latest.heartRate.value} bpm</span>
          </div>
          <div className="flex items-center justify-between text-[12px] text-slate-500">
            <span>SpO2</span>
            <span className="font-semibold text-slate-900">{d.vitals.latest.spo2.value}%</span>
          </div>
          <div className="flex items-center justify-between text-[12px] text-slate-500">
            <span>Temp</span>
            <span className="font-semibold text-slate-900">{d.vitals.latest.temperature.value}°F</span>
          </div>
          <div className="pt-0.5">
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
        <div className="space-y-1.5">
          <p
            className="text-[14px] font-semibold leading-[1.32] text-slate-900"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {d.diagnosis.principal.description || card?.headlineMetric || "Diagnosis not available"}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
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
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[26px] font-semibold leading-none text-slate-900">{d.medications.active.length}</span>
            <span className="text-[12px] text-slate-500">active medications</span>
          </div>
          <div className="space-y-0.5 text-[12px] text-slate-600">
            {d.medications.active.slice(0, 2).map((med) => (
              <p key={med.name} className="truncate">
                {med.name}
              </p>
            ))}
            {d.medications.active.length === 0 ? <p>No active medications documented.</p> : null}
          </div>
        </div>
      );
    }

    if (key === "labs") {
      return (
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[26px] font-semibold leading-none text-slate-900">{d.labs.totalTests}</span>
            <span className="text-[12px] text-slate-500">{d.labs.hasResults ? "tests completed" : "tests ordered"}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {d.labs.abnormalCount > 0 ? <StatusBadge status="warning" label={`${d.labs.abnormalCount} abnormal`} /> : null}
            {d.labs.criticalCount > 0 ? <StatusBadge status="critical" label={`${d.labs.criticalCount} critical`} /> : null}
            {d.labs.abnormalCount === 0 && d.labs.criticalCount === 0 ? <StatusBadge status="normal" label="Normal" /> : null}
          </div>
          <p className="text-[12px] leading-5 text-slate-500">
            {card?.supportingPoints?.[0] || (d.labs.hasResults ? "Results available for review." : `${d.labs.pendingCount} investigations ordered.`)}
          </p>
        </div>
      );
    }

    if (key === "radiology") {
      return (
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[26px] font-semibold leading-none text-slate-900">{d.radiology.completedStudies}</span>
            <span className="text-[12px] text-slate-500">findings</span>
          </div>
          {d.radiology.criticalFindings > 0 ? <StatusBadge status="critical" label={`${d.radiology.criticalFindings} critical`} /> : <StatusBadge status="normal" label="Normal" />}
          <p className="text-[12px] leading-5 text-slate-500">
            {d.radiology.pendingStudies > 0 ? `${d.radiology.pendingStudies} pending imaging items documented.` : "No pending imaging documented."}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-1.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[26px] font-semibold leading-none text-slate-900">{d.treatment.activeManagement.length}</span>
          <span className="text-[12px] text-slate-500">plan items</span>
        </div>
        <p
          className="text-[13px] font-medium leading-5 text-slate-800"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {d.treatment.currentApproach}
        </p>
        <p className="text-[12px] leading-5 text-slate-500">{d.treatment.complicationsLabel}</p>
      </div>
    );
  };

  const handleBack = () => setActiveSection(null);

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

  if (activeSection === "vitals") return <PageWrapper>{dashboardToolbar}<VitalsDetail onBack={handleBack} data={d} />{assistantPanel}</PageWrapper>;
  if (activeSection === "diagnosis") return <PageWrapper>{dashboardToolbar}<DiagnosisDetail onBack={handleBack} data={d} />{assistantPanel}</PageWrapper>;
  if (activeSection === "medications") return <PageWrapper>{dashboardToolbar}<MedicationsDetail onBack={handleBack} data={d} />{assistantPanel}</PageWrapper>;
  if (activeSection === "labs") return <PageWrapper>{dashboardToolbar}<LabsDetail onBack={handleBack} data={d} />{assistantPanel}</PageWrapper>;
  if (activeSection === "radiology") return <PageWrapper>{dashboardToolbar}<RadiologyDetail onBack={handleBack} data={d} />{assistantPanel}</PageWrapper>;
  if (activeSection === "treatment") return <PageWrapper>{dashboardToolbar}<TreatmentDetail onBack={handleBack} data={d} />{assistantPanel}</PageWrapper>;
  if (activeSection === "notes") return <PageWrapper>{dashboardToolbar}<ClinicalNotesDetail onBack={handleBack} data={d} />{assistantPanel}</PageWrapper>;
  if (activeSection === "discharge") return <PageWrapper>{dashboardToolbar}<DischargeDetail onBack={handleBack} data={d} />{assistantPanel}</PageWrapper>;
  if (activeSection === "followup") return <PageWrapper>{dashboardToolbar}<FollowUpDetail onBack={handleBack} data={d} />{assistantPanel}</PageWrapper>;

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
                  ? `${loadError} Showing fallback sample dashboard.`
                  : `Showing processed output for ${processedDocument?.name || patientData.patient.name}.`}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(Object.keys(SUMMARY_CARD_CONFIG) as Array<keyof typeof SUMMARY_CARD_CONFIG>).map((key) => {
            const config = SUMMARY_CARD_CONFIG[key];
            const card = summaryCards[key];

            return (
              <SectionCard
                key={key}
                icon={<span className="text-base">{config.icon}</span>}
                title={card?.title || config.section}
                colorClass={config.colorClass}
                onClick={() => setActiveSection(config.section)}
                headerBadge={<SectionProvenanceBadge status={card?.provenanceStatus || d.provenance.sections[key].status} />}
              >
                {renderSummaryCardContent(key)}
              </SectionCard>
            );
          })}
        </div>

        <div className="section-card overflow-hidden border-slate-200 bg-white">
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
                onClick={() => setActiveSection("notes")}
              >
                Open
              </button>
            </div>
          </div>

          <div className="space-y-2.5 px-3.5 py-3">
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
                      <p className="text-[12px] font-semibold text-slate-800">{item.author || item.title}</p>
                      {item.timestamp ? <span className="text-[11px] text-slate-400">{item.timestamp}</span> : null}
                    </div>
                    <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.04em] text-slate-500">{item.title}</p>
                    <p className="mt-0.5 text-[12px] leading-5 text-slate-600">{item.body || "No summary available."}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SectionCard
          icon={<span className="text-base">📝</span>}
          title="Clinical Handover"
          colorClass="bg-[hsl(var(--section-notes))]"
          onClick={() => setActiveSection("notes")}
          headerBadge={<SectionProvenanceBadge status={d.provenance.sections.handover.status} />}
        >
          <p className="text-sm text-foreground"><span className="font-medium">{d.clinicalNotes.totalNotes}</span> Source Notes</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {d.clinicalNotes.handover?.overview || `Last Update: ${formatDateLabel(d.clinicalNotes.lastUpdate)}`}
          </p>
        </SectionCard>

        <SectionCard
          icon={<span className="text-base">📋</span>}
          title="Discharge Plan"
          colorClass="bg-[hsl(var(--section-discharge))]"
          onClick={() => setActiveSection("discharge")}
          headerBadge={<SectionProvenanceBadge status={d.provenance.sections.discharge.status} />}
        >
          <p className="text-sm text-foreground">Condition: <span className="font-medium">{d.dischargePlan.condition}</span></p>
          <p className="mt-1 text-xs text-muted-foreground">
            {d.dischargePlan.dietary.length + d.dischargePlan.activityRestrictions.doNot.length + d.dischargePlan.activityRestrictions.okToDo.length} documented instructions
          </p>
          <p className="text-xs text-muted-foreground">
            {d.dischargePlan.pendingItems.length} Pending • {d.dischargePlan.redFlags.length} Risks
          </p>
        </SectionCard>

        <SectionCard
          icon={<span className="text-base">📅</span>}
          title="Follow-Up"
          colorClass="bg-[hsl(var(--section-followup))]"
          onClick={() => setActiveSection("followup")}
          headerBadge={<SectionProvenanceBadge status={d.provenance.sections.followup.status} />}
        >
          <p className="text-sm text-foreground">Next: <span className="font-medium">{formatDateLabel(d.followUp[0]?.date)}</span></p>
          <p className="text-xs text-muted-foreground">{d.followUp[0]?.department || "Follow-up pending"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{d.followUp.length} appointments total</p>
        </SectionCard>
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
