import { useMemo } from "react";
import type { DashboardPatientData } from "@/data/patientData";
import {
  ArrowLeft,
  AlertCircle,
  Beaker,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  Activity,
  Radiation,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import ProvenancePanel from "./ProvenancePanel";

interface PendingItemsDetailProps {
  onBack: () => void;
  data: DashboardPatientData;
}

interface PendingItem {
  id: string;
  category: "labs" | "radiology" | "medications" | "followup" | "notes" | "discharge";
  title: string;
  description: string;
  status: "pending" | "scheduled" | "complete" | "attention_needed";
  priority: "low" | "medium" | "high";
  date?: string;
  sourceNote?: string;
}

const categoryOrder: PendingItem["category"][] = ["discharge", "labs", "radiology", "followup", "medications", "notes"];

const categoryConfig = {
  labs: { icon: Beaker, iconTone: "text-blue-700", iconBg: "bg-blue-50", label: "Labs" },
  radiology: { icon: Radiation, iconTone: "text-cyan-700", iconBg: "bg-cyan-50", label: "Imaging" },
  medications: { icon: Activity, iconTone: "text-emerald-700", iconBg: "bg-emerald-50", label: "Medication" },
  followup: { icon: Calendar, iconTone: "text-teal-700", iconBg: "bg-teal-50", label: "Follow-Up" },
  notes: { icon: FileText, iconTone: "text-slate-700", iconBg: "bg-slate-100", label: "Notes" },
  discharge: { icon: AlertCircle, iconTone: "text-amber-700", iconBg: "bg-amber-50", label: "Discharge" },
} satisfies Record<PendingItem["category"], { icon: typeof Beaker; iconTone: string; iconBg: string; label: string }>;

const statusConfig = {
  pending: { icon: Circle, tone: "text-amber-700 bg-amber-50 border-amber-200", label: "Pending" },
  scheduled: { icon: Clock, tone: "text-sky-700 bg-sky-50 border-sky-200", label: "Scheduled" },
  complete: { icon: CheckCircle2, tone: "text-emerald-700 bg-emerald-50 border-emerald-200", label: "Complete" },
  attention_needed: { icon: AlertCircle, tone: "text-rose-700 bg-rose-50 border-rose-200", label: "Attention" },
} satisfies Record<PendingItem["status"], { icon: typeof Circle; tone: string; label: string }>;

const priorityOrder = { high: 0, medium: 1, low: 2 };
const statusOrder = { attention_needed: 0, pending: 1, scheduled: 2, complete: 3 };

const clampLines = (lines: number) => ({
  display: "-webkit-box",
  WebkitLineClamp: lines,
  WebkitBoxOrient: "vertical" as const,
  overflow: "hidden",
});

const PendingItemsDetail = ({ onBack, data }: PendingItemsDetailProps) => {
  const pendingItems = useMemo(() => {
    const items: PendingItem[] = [];

    (data.labs.pending || []).forEach((lab, index) => {
      const dateMatch = lab.match(/Expected:\s*([^,\n]+)/i);
      items.push({
        id: `lab-${index}`,
        category: "labs",
        title: lab.split("-")[0]?.trim() || lab.split("Expected")[0]?.trim() || "Lab investigation",
        description: lab,
        status: "pending",
        priority: "medium",
        date: dateMatch ? dateMatch[1].trim() : undefined,
      });
    });

    (data.labs.investigations || []).forEach((investigation, index) => {
      if (/pending|awaited|ordered|scheduled/i.test(investigation.toLowerCase())) {
        items.push({
          id: `investigation-${index}`,
          category: "labs",
          title: investigation.length > 48 ? `${investigation.slice(0, 48)}...` : investigation,
          description: investigation,
          status: "pending",
          priority: "medium",
        });
      }
    });

    (data.radiology.pending || []).forEach((study, index) => {
      const dateMatch = study.match(/Scheduled:\s*([^,\n]+)/i);
      items.push({
        id: `radiology-${index}`,
        category: "radiology",
        title: study.split("-")[0]?.trim() || study.split("Scheduled")[0]?.trim() || "Imaging study",
        description: study,
        status: "scheduled",
        priority: "high",
        date: dateMatch ? dateMatch[1].trim() : undefined,
      });
    });

    if (data.medications.active.length > 0) {
      const interactionClear = data.medications.interactionCheck?.includes("No significant interactions");
      items.push({
        id: "med-reconciliation",
        category: "medications",
        title: "Medication reconciliation",
        description: `${data.medications.active.length} active medications • ${data.medications.allergies.length} allergies documented`,
        status: interactionClear ? "complete" : "attention_needed",
        priority: data.medications.allergies.length > 0 && !interactionClear ? "high" : "medium",
        sourceNote: interactionClear ? "Interactions reviewed" : "Verification recommended",
      });
    }

    data.followUp.forEach((appointment, index) => {
      items.push({
        id: `followup-${index}`,
        category: "followup",
        title: appointment.department || "Follow-up",
        description: `with ${appointment.physician || "Specialist"}`,
        status: "scheduled",
        priority: "medium",
        date: appointment.date ? `${appointment.date}${appointment.time ? ` at ${appointment.time}` : ""}` : undefined,
        sourceNote: appointment.purpose,
      });
    });

    data.clinicalNotes.notes.forEach((note, noteIndex) => {
      (note.pending_items || []).forEach((item, itemIndex) => {
        items.push({
          id: `note-${noteIndex}-${itemIndex}`,
          category: "notes",
          title: note.type || "Clinical note",
          description: item,
          status: "pending",
          priority: "medium",
          sourceNote: `From ${note.author || "Clinical Team"}${note.date ? ` · ${note.date}` : ""}`,
        });
      });
    });

    (data.dischargePlan.pendingItems || []).forEach((item, index) => {
      items.push({
        id: `discharge-${index}`,
        category: "discharge",
        title: "Discharge action",
        description: item,
        status: "pending",
        priority: "high",
      });
    });

    return items.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return statusOrder[a.status] - statusOrder[b.status];
    });
  }, [data]);

  const groupedItems = useMemo(
    () =>
      categoryOrder
        .map((category) => ({
          category,
          items: pendingItems.filter((item) => item.category === category),
        }))
        .filter((group) => group.items.length > 0),
    [pendingItems],
  );

  const stats = useMemo(
    () => ({
      pending: pendingItems.filter((item) => item.status === "pending").length,
      scheduled: pendingItems.filter((item) => item.status === "scheduled").length,
      complete: pendingItems.filter((item) => item.status === "complete").length,
      attention: pendingItems.filter((item) => item.status === "attention_needed").length,
      total: pendingItems.length,
    }),
    [pendingItems],
  );

  const defaultOpenGroups = groupedItems
    .filter((group) => group.category === "discharge" || group.category === "followup" || group.category === "labs")
    .slice(0, 3)
    .map((group) => group.category);

  const primaryStatusLabel =
    stats.attention > 0 ? "Action required" : stats.pending > 0 ? "Open follow-through items" : "All critical loops covered";

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </button>

      <Card className="border-slate-200 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-lg">🧩</div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">Care Gaps</p>
                  <h2 className="text-xl font-semibold text-slate-900">Pending care actions</h2>
                </div>
              </div>
              <p className="max-w-2xl text-sm text-slate-600">
                Grouped by workflow so dense records stay readable. Open only the sections that need action.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-600">
                {stats.total} total
              </Badge>
              <Badge
                variant="outline"
                className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                  stats.attention > 0
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : stats.pending > 0
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                {primaryStatusLabel}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { key: "attention", label: "Attention", value: stats.attention, tone: "text-rose-700 bg-rose-50" },
              { key: "pending", label: "Pending", value: stats.pending, tone: "text-amber-700 bg-amber-50" },
              { key: "scheduled", label: "Scheduled", value: stats.scheduled, tone: "text-sky-700 bg-sky-50" },
              { key: "complete", label: "Complete", value: stats.complete, tone: "text-emerald-700 bg-emerald-50" },
            ].map((stat) => (
              <div key={stat.key} className={`rounded-2xl px-4 py-3 ${stat.tone}`}>
                <p className="text-[11px] font-medium uppercase tracking-[0.06em]">{stat.label}</p>
                <p className="mt-1 text-2xl font-semibold leading-none">{stat.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {groupedItems.length > 0 ? (
        <Card className="border-slate-200 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          <CardContent className="p-0">
            <Accordion type="multiple" defaultValue={defaultOpenGroups} className="w-full">
              {groupedItems.map((group) => {
                const config = categoryConfig[group.category];
                const Icon = config.icon;
                const attentionCount = group.items.filter((item) => item.status === "attention_needed").length;
                const primaryCount = group.items.filter((item) => item.priority === "high").length;

                return (
                  <AccordionItem key={group.category} value={group.category} className="border-slate-100 px-4">
                    <AccordionTrigger className="py-3 text-left no-underline hover:no-underline">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${config.iconBg}`}>
                          <Icon className={`h-4 w-4 ${config.iconTone}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-900">{config.label}</p>
                            <Badge variant="outline" className="rounded-full border-slate-200 px-2 py-0 text-[10px] font-medium text-slate-500">
                              {group.items.length}
                            </Badge>
                            {attentionCount > 0 ? (
                              <Badge variant="outline" className="rounded-full border-rose-200 bg-rose-50 px-2 py-0 text-[10px] font-medium text-rose-700">
                                {attentionCount} attention
                              </Badge>
                            ) : null}
                            {attentionCount === 0 && primaryCount > 0 ? (
                              <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 px-2 py-0 text-[10px] font-medium text-amber-700">
                                {primaryCount} high priority
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-slate-500">
                            {group.items[0]?.description || `${group.items.length} items in this section`}
                          </p>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                        {group.items.map((item) => {
                          const status = statusConfig[item.status];
                          const StatusIcon = status.icon;

                          return (
                            <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50/55 px-4 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-medium text-slate-900">{item.title}</p>
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${status.tone}`}
                                    >
                                      <StatusIcon className="h-2.5 w-2.5" />
                                      {status.label}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-sm text-slate-600" style={clampLines(2)}>
                                    {item.description}
                                  </p>
                                  {item.sourceNote ? (
                                    <p className="mt-1 text-[11px] text-slate-500" style={clampLines(1)}>
                                      {item.sourceNote}
                                    </p>
                                  ) : null}
                                </div>
                                {item.date ? (
                                  <div className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500">
                                    {item.date}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          <CardContent className="px-6 py-10 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
            <h3 className="text-base font-semibold text-slate-900">No active care gaps</h3>
            <p className="mt-1 text-sm text-slate-500">This record does not contain unresolved pending items.</p>
          </CardContent>
        </Card>
      )}

      <ProvenancePanel
        status={data.provenance.sections.followup.status}
        items={[
          ...data.provenance.sections.labs.items,
          ...data.provenance.sections.radiology.items,
          ...data.provenance.sections.followup.items,
        ]}
      />
    </div>
  );
};

export default PendingItemsDetail;
