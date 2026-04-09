import type { DashboardPatientData } from "@/data/patientData";
import { AlertTriangle, ArrowLeft, ShieldAlert } from "lucide-react";

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
  const elevatedItems = items.filter((item) => /high|medium/i.test(String(item.level || "")));

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </button>

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-lg">🛡️</div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Risk Watch</h2>
          <p className="text-sm text-muted-foreground">Current clinical risks requiring active monitoring.</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => {
          const levelKey = String(item.level || "Unknown").toLowerCase();
          return (
            <div key={item.label} className={`rounded-xl border p-4 ${toneClass[levelKey] || toneClass.unknown}`}>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em]">{item.label}</p>
              <p className="mt-2 text-sm font-semibold leading-5">{item.level || "Unknown"}</p>
              <p className="mt-1 text-xs text-current/80">{item.score != null ? `Score ${item.score}` : "Score not documented"}</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-rose-600" />
          <h3 className="text-sm font-semibold text-slate-900">Active watch items</h3>
        </div>
        <div className="space-y-2">
          {elevatedItems.length > 0 ? (
            elevatedItems.map((item) => (
                <p key={`${item.label}-watch`} className="text-sm text-slate-600">
                  {item.summary}
                </p>
              ))
          ) : (
            <p className="text-sm text-slate-600">No elevated clinical watch items are documented in this record.</p>
          )}
          {riskWatch?.ewsScore != null ? (
            <p className="text-sm text-slate-600">Early warning score: {riskWatch.ewsScore}</p>
          ) : null}
        </div>
      </div>

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
