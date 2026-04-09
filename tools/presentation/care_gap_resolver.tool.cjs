class CareGapResolverTool {
  constructor(config = {}) {
    this.name = "Care Gap Resolver";
    this.version = "1.0.0";
    this.config = config;
  }

  toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  dedupe(values = []) {
    return [...new Set(values.map((value) => this.normalizeWhitespace(value)).filter(Boolean))];
  }

  joinParts(parts = []) {
    return parts.filter(Boolean).join(" · ");
  }

  resolve(data = {}) {
    const pendingItemsSummary = data.pendingItemsSummary || {};
    const pendingLabs = this.dedupe([
      ...this.toArray(data.labs?.pending),
      ...this.toArray(pendingItemsSummary.pending_labs),
    ]);
    const pendingImaging = this.dedupe([
      ...this.toArray(data.radiology?.pending),
      ...this.toArray(pendingItemsSummary.pending_radiology),
    ]);
    const dischargeActions = this.dedupe(this.toArray(data.dischargePlan?.pendingItems));
    const followUps = this.toArray(data.followUp);
    const medRec = pendingItemsSummary.medication_reconciliation || {};

    const hasMedicationReconciliationConcern =
      medRec.status === "attention_needed" || Boolean(this.normalizeWhitespace(medRec.concerns));
    const missingScheduledFollowUp = followUps.length === 0 ? 1 : 0;
    const totalOpenLoops =
      pendingLabs.length +
      pendingImaging.length +
      dischargeActions.length +
      (hasMedicationReconciliationConcern ? 1 : 0) +
      missingScheduledFollowUp;

    const supportingPoints = [];
    const diagnosticGaps = this.joinParts([
      pendingLabs.length ? `${pendingLabs.length} labs` : "",
      pendingImaging.length ? `${pendingImaging.length} imaging` : "",
    ]);

    if (diagnosticGaps) {
      supportingPoints.push(`${diagnosticGaps} pending`);
    }

    if (dischargeActions.length) {
      supportingPoints.push(
        `${dischargeActions.length} discharge action${dischargeActions.length === 1 ? "" : "s"}`
      );
    } else if (hasMedicationReconciliationConcern) {
      supportingPoints.push(this.normalizeWhitespace(medRec.concerns) || "Medication reconciliation needs attention");
    } else if (followUps.length > 0) {
      supportingPoints.push(
        `${followUps.length} follow-up appointment${followUps.length === 1 ? "" : "s"} booked`
      );
    } else {
      supportingPoints.push("Follow-up not scheduled");
    }

    let status = "normal";
    if (missingScheduledFollowUp || hasMedicationReconciliationConcern) status = "critical";
    else if (totalOpenLoops > 0) status = "warning";

    return {
      totalOpenLoops,
      pendingLabsCount: pendingLabs.length,
      pendingImagingCount: pendingImaging.length,
      dischargeActionCount: dischargeActions.length,
      followUpCount: followUps.length,
      hasMedicationReconciliationConcern,
      status,
      headlineMetric: String(totalOpenLoops),
      secondaryLine: totalOpenLoops === 1 ? "open care gap" : "open care gaps",
      supportingPoints: supportingPoints.filter(Boolean).slice(0, 2),
    };
  }
}

module.exports = CareGapResolverTool;
