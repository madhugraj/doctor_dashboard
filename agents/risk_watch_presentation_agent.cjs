const RiskWatchResolverTool = require("../tools/presentation/risk_watch_resolver.tool.cjs");
const RiskWatchBuilderSkill = require("../skills/presentation/risk_watch_builder.skill.cjs");

class RiskWatchPresentationAgent {
  constructor(config = {}) {
    this.name = "Risk Watch Presentation Agent";
    this.version = "1.0.0";
    this.config = config;

    this.riskWatchResolver = new RiskWatchResolverTool(config);
    this.riskWatchBuilder = new RiskWatchBuilderSkill(config);
  }

  async execute(context) {
    const { dashboardData } = context;
    if (!dashboardData) {
      return { success: false, error: "No dashboard data provided" };
    }

    return this.riskWatchBuilder.execute({
      dashboardData,
      riskWatchResolver: this.riskWatchResolver,
    });
  }
}

module.exports = RiskWatchPresentationAgent;
