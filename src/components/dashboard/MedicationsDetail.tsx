import type { DashboardPatientData } from "@/data/patientData";
import StatusBadge from "./StatusBadge";
import { ArrowLeft, Pill, AlertTriangle } from "lucide-react";
import ProvenancePanel from "./ProvenancePanel";
import SectionProvenanceBadge from "./SectionProvenanceBadge";

interface MedicationsDetailProps {
  onBack: () => void;
  data: DashboardPatientData;
}

const isUnknownAllergyMarker = (value?: string): boolean =>
  /(?:^|\b)(?:unknown|nkda|nkfa|nkf&da|not known|no known allergy|no known drug allergy|nil known allergy)(?:\b|$)/i.test(
    String(value || "").trim()
  );

// Helper to expand common abbreviations
const expandFrequency = (freq: string): string => {
  const expanded: Record<string, string> = {
    "OD": "Once daily",
    "BD": "Twice daily",
    "TDS": "Three times daily",
    "QID": "Four times daily",
    "QHS": "At bedtime",
    "QOD": "Every other day",
    "SOS": "As needed",
    "PRN": "As needed",
    "STAT": "Immediately",
    "IV": "Intravenous",
    "IM": "Intramuscular",
    "SC": "Subcutaneous",
    "PO": "Oral",
    "SL": "Sublingual"
  };

  const upperFreq = freq.toUpperCase().trim();
  for (const [abbr, full] of Object.entries(expanded)) {
    if (upperFreq.includes(abbr)) {
      return freq.replace(new RegExp(abbr, "gi"), full);
    }
  }
  return freq;
};

// Helper to get route from medication name or explicit route field
const getRoute = (med: { name?: string; route?: string }): string => {
  if (med.route) return med.route;
  const name = med.name?.toUpperCase() || "";
  if (name.includes("INJ") || name.includes("INJECTION")) return "IV/IM";
  if (name.includes("TAB") || name.includes("TABLET") || name.includes("CAP")) return "Oral";
  if (name.includes("SYRUP") || name.includes("SUSPENSION")) return "Oral";
  if (name.includes("IV FLUID") || name.includes("NORMAL SALINE") || name.includes("NS")) return "IV";
  if (name.includes("OINTMENT") || name.includes("CREAM")) return "Topical";
  return "Oral";
};

// Categorize medications by type
const categorizeMedication = (name: string): string => {
  const upper = name.toUpperCase();
  if (upper.includes("INSULIN") || upper.includes("ACTRAPID") || upper.includes("METFORMIN") || upper.includes("GLIMEPIRIDE")) return "Diabetes";
  if (upper.includes("MANNITOL") || upper.includes("LASIX") || upper.includes("FUROSEMIDE")) return "Neurology/Diuretic";
  if (upper.includes("LEVETIRACETAM") || upper.includes("LEVERA") || upper.includes("PHENYTOIN") || upper.includes("VALPARIN")) return "Antiepileptic";
  if (upper.includes("PANTOPRAZOLE") || upper.includes("PAN") || upper.includes("OMEPRazole")) return "PPI/Gastric";
  if (upper.includes("ONDANSETRON") || upper.includes("ZOFER") || upper.includes("EMESET")) return "Antiemetic";
  if (upper.includes("ASPIRIN") || upper.includes("CLOPIDOGREL")) return "Antiplatelet";
  if (upper.includes("METOPROLOL") || upper.includes("ATENOLOL") || upper.includes("BETA")) return "Beta Blocker";
  if (upper.includes("AMLODIPINE") || upper.includes("AMILONG")) return "Calcium Channel Blocker";
  if (upper.includes("ATORVASTATIN") || upper.includes("ROSUVASTATIN")) return "Statin";
  if (upper.includes("RAMIPRIL") || upper.includes("ENALAPRIL")) return "ACE Inhibitor";
  return "Other";
};

const MedicationsDetail = ({ onBack, data }: MedicationsDetailProps) => {
  const { medications } = data;
  const medicationsProvenance = data.provenance.sections.medications;

  // Get medication list with proper parsing
  const medicationList = medications.active || [];
  const allergiesList = (medications.allergies || []).filter(
    (allergy) => !isUnknownAllergyMarker(allergy.allergen)
  );
  const medicationChanges = medications.changes || { added: [], adjusted: [], discontinued: [] };
  const hasMedicationChanges =
    Boolean(medications.interactionCheck) ||
    (medicationChanges.added?.length || 0) > 0 ||
    (medicationChanges.adjusted?.length || 0) > 0 ||
    (medicationChanges.discontinued?.length || 0) > 0;
  const showStartColumn = medicationList.some((med) => String(med.start || "").trim().length > 0);

  // Group medications by category
  const groupedMeds = medicationList.reduce((groups: Record<string, typeof medicationList>, med) => {
    const category = med.category || categorizeMedication(med.name);
    if (!groups[category]) groups[category] = [];
    groups[category].push(med);
    return groups;
  }, {});

  // Count by route
  const routeCounts = medicationList.reduce((counts: Record<string, number>, med) => {
    const route = getRoute(med);
    counts[route] = (counts[route] || 0) + 1;
    return counts;
  }, {});

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-section-medications/10 flex items-center justify-center text-lg">💊</div>
        <h2 className="text-xl font-bold text-foreground">Medication Reconciliation</h2>
        <SectionProvenanceBadge status={medicationsProvenance.status} />
        <div className="flex gap-2">
          <StatusBadge status="normal" label={`${medicationList.length} Medications`} />
          {allergiesList.length > 0 && (
            <StatusBadge status="warning" label={`${allergiesList.length} Allergies`} />
          )}
        </div>
      </div>

      <ProvenancePanel status={medicationsProvenance.status} items={medicationsProvenance.items} />

      {/* No Medications State */}
      {medicationList.length === 0 && (
        <div className="bg-muted/30 rounded-lg p-8 text-center text-sm text-muted-foreground">
          <Pill className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No medications documented in this discharge summary.</p>
        </div>
      )}

      {/* Medications Summary */}
      {medicationList.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(routeCounts).map(([route, count]) => (
            <div key={route} className="bg-card rounded-lg border p-3 text-center">
              <div className="text-2xl font-bold text-foreground">{count}</div>
              <div className="text-xs text-muted-foreground">{route}</div>
            </div>
          ))}
        </div>
      )}

      {/* Active Medications Table */}
      {medicationList.length > 0 && (
        <div className="bg-card rounded-xl border overflow-hidden">
          <div className="p-5 border-b">
            <h3 className="font-semibold text-sm text-foreground">Discharge Medication List</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Medication</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Dose</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Frequency</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Route</th>
                  {showStartColumn ? <th className="text-left p-3 font-medium text-muted-foreground">Start</th> : null}
                  <th className="text-left p-3 font-medium text-muted-foreground">Instructions</th>
                </tr>
              </thead>
              <tbody>
                {medicationList.map((med, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-3 font-medium text-foreground">{med.name}</td>
                    <td className="p-3 text-foreground">{med.dose}</td>
                    <td className="p-3 text-foreground">{expandFrequency(med.frequency)}</td>
                    <td className="p-3 text-foreground">{getRoute(med)}</td>
                    {showStartColumn ? <td className="p-3 text-muted-foreground">{med.start}</td> : null}
                    <td className="p-3 text-muted-foreground text-xs">{med.instructions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Medications by Category */}
      {Object.keys(groupedMeds).length > 0 && (
        <div className="bg-card rounded-xl border p-5">
          <h3 className="font-semibold text-sm mb-4 text-foreground">Medications by Category</h3>
          <div className="grid md:grid-cols-2 gap-4">
            {Object.entries(groupedMeds).map(([category, meds]) => (
              <div key={category} className="p-3 rounded-lg border bg-muted/30">
                <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-muted text-xs">{category}</span>
                  <span className="text-xs text-muted-foreground">({meds.length})</span>
                </h4>
                <ul className="space-y-1">
                  {meds.map((med, i) => (
                    <li key={i} className="text-xs text-foreground">
                      • {med.name} {med.dose} - {expandFrequency(med.frequency)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Allergy Alerts */}
      {allergiesList.length > 0 && (
        <div className="bg-card rounded-xl border p-5">
          <h3 className="font-semibold text-sm text-status-critical mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            🔴 Allergy Alerts
          </h3>
          <div className="space-y-4">
            {allergiesList.map((a, i) => (
              <div key={i} className="p-4 rounded-lg border border-status-critical/20 bg-status-critical/5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-foreground">⚠️ {a.allergen}</span>
                  {a.severity ? <StatusBadge status={a.severity === "Severe" ? "critical" : "warning"} label={a.severity} /> : null}
                </div>
                {a.reaction ? <p className="text-sm text-foreground">Reaction: {a.reaction}</p> : null}
                {a.lastReaction && <p className="text-sm text-muted-foreground">Last: {a.lastReaction}</p>}
                {a.action ? <p className="text-sm text-muted-foreground">Action: {a.action}</p> : null}
                {a.alternative && <p className="text-sm text-muted-foreground">Alternative: {a.alternative}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Changes */}
      {hasMedicationChanges ? (
        <div className="bg-card rounded-xl border p-5">
          <h3 className="font-semibold text-sm mb-4 text-foreground">Medication Changes During Stay</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-status-normal/5 border border-status-normal/20">
              <h4 className="font-semibold text-xs text-status-normal uppercase mb-2">Added</h4>
              <ul className="space-y-1 text-sm text-foreground">
                {medicationChanges.added?.length > 0
                  ? medicationChanges.added.map((m, i) => <li key={i}>• {m}</li>)
                  : <li className="text-muted-foreground">None</li>}
              </ul>
            </div>
            <div className="p-4 rounded-lg bg-status-warning/5 border border-status-warning/20">
              <h4 className="font-semibold text-xs text-status-warning uppercase mb-2">Adjusted</h4>
              <ul className="space-y-1 text-sm text-foreground">
                {medicationChanges.adjusted?.length > 0
                  ? medicationChanges.adjusted.map((m, i) => <li key={i}>• {m}</li>)
                  : <li className="text-muted-foreground">None</li>}
              </ul>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 border">
              <h4 className="font-semibold text-xs text-muted-foreground uppercase mb-2">Discontinued</h4>
              <ul className="space-y-1 text-sm text-foreground">
                {medicationChanges.discontinued?.length > 0
                  ? medicationChanges.discontinued.map((m, i) => <li key={i}>• {m}</li>)
                  : <li className="text-muted-foreground">None</li>}
              </ul>
            </div>
          </div>
          {medications.interactionCheck && (
            <p className="mt-4 text-sm text-status-normal">✅ {medications.interactionCheck}</p>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default MedicationsDetail;
