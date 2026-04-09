class RiskWatchBuilderSkill {
  constructor(config = {}) {
    this.name = "Risk Watch Builder";
    this.version = "1.0.0";
    this.config = config;
  }

  async execute(context) {
    const { dashboardData, riskWatchResolver } = context;
    if (!dashboardData) {
      return { success: false, error: "No dashboard data provided" };
    }

    const summary = riskWatchResolver.resolve(dashboardData);

    return {
      success: true,
      step: "risk_watch_builder",
      data: {
        risk_watch: {
          section: "riskwatch",
          title: "Risk Watch",
          headline_metric: summary.headlineMetric,
          secondary_line: summary.secondaryLine,
          supporting_points: summary.supportingPoints,
          status: summary.status,
          provenance_status: dashboardData?.provenance?.sections?.riskwatch?.status || "insufficient_evidence",
        },
      },
    };
  }
}

module.exports = RiskWatchBuilderSkill;
