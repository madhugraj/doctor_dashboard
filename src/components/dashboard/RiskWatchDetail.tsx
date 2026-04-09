import type { DashboardPatientData } from "@/data/patientData";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import ProvenancePanel from "./ProvenancePanel";
import SectionProvenanceBadge from "./SectionProvenanceBadge";

interface RiskWatchDetailProps {
  onBack: () => void;
  data: DashboardPatientData;
}

const toneClass: Record<string, string> = {
  high: "border-rose-200 bg-rose-50 text-rose-800",
  medium: "border-amber-200 bg-amber-50 text-amber-800",
  low: "border-emerald-200 bg-emerald-50 text-emerald-800",
  unknown: "border-slate-200 bg-slate-50 text-slate-700",
};

const RiskWatchDetail = ({ onBack, data }: RiskWatchDetailProps) => {
  const riskWatch = data.riskWatch;
  const items = riskWatch?.items || [];
  const riskWatchProvenance = data.provenance.sections.riskwatch;
  const hasRiskCitations = riskWatchProvenance.items.length > 0;

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </button>

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-lg">🛡️</div>
        <div className="flex items-center gap-3">
          <div>
          <h2 className="text-xl font-bold text-foreground">Risk Watch</h2>
          <p className="text-sm text-muted-foreground">Current clinical risks requiring active monitoring.</p>
          </div>
          <SectionProvenanceBadge status={riskWatchProvenance.status} />
        </div>
      </div>

      {hasRiskCitations ? <ProvenancePanel status={riskWatchProvenance.status} items={riskWatchProvenance.items} /> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => {
          const levelKey = String(item.level || "Unknown").toLowerCase();
          const primaryCitation = item.citations?.[0];
          return (
            <div key={item.label} className={`rounded-xl border p-4 ${toneClass[levelKey] || toneClass.unknown}`}>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em]">{item.label}</p>
              <p className="mt-2 text-sm font-semibold leading-5">{item.level || "Unknown"}</p>
              {primaryCitation ? (
                <div className="mt-3 border-t border-current/15 pt-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-current/70">
                    {primaryCitation.sourceSection || "Source"}
                    {primaryCitation.sourcePage != null ? ` · Page ${primaryCitation.sourcePage}` : ""}
                  </p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-600">No explicit structured risk levels are documented in the source record.</p>
        </div>
      ) : null}

      {data.dischargePlan.redFlags.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-slate-900">Discharge red flags</h3>
          </div>
          <div className="space-y-2">
            {data.dischargePlan.redFlags.map((flag, index) => (
              <p key={`${flag}-${index}`} className="text-sm text-slate-600">
                {flag}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default RiskWatchDetail;
