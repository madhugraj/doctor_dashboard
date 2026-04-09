class CareGapBuilderSkill {
  constructor(config = {}) {
    this.name = "Care Gap Builder";
    this.version = "1.0.0";
    this.config = config;
  }

  async execute(context) {
    const { dashboardData, careGapResolver, sectionStatusResolver } = context;
    if (!dashboardData) {
      return { success: false, error: "No dashboard data provided" };
    }

    const summary = careGapResolver.resolve(dashboardData);
    const sections = dashboardData.provenance?.sections || {};
    const combinedItems = [
      ...(sections.labs?.items || []),
      ...(sections.radiology?.items || []),
      ...(sections.followup?.items || []),
      ...(sections.discharge?.items || []),
    ];

    const provenanceStatus =
      sectionStatusResolver?.build(combinedItems, ["quoted", "normalized", "derived"]).status ||
      "insufficient_evidence";

    return {
      success: true,
      step: "care_gap_builder",
      data: {
        care_gaps: {
          section: "pending",
          title: "Care Gaps",
          headline_metric: summary.headlineMetric,
          secondary_line: summary.secondaryLine,
          supporting_points: summary.supportingPoints,
          status: summary.status,
          provenance_status: provenanceStatus,
        },
      },
    };
  }
}

module.exports = CareGapBuilderSkill;
