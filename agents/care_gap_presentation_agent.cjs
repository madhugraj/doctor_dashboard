const CareGapResolverTool = require("../tools/presentation/care_gap_resolver.tool.cjs");
const SectionStatusResolverTool = require("../tools/presentation/section_status_resolver.tool.cjs");
const CareGapBuilderSkill = require("../skills/presentation/care_gap_builder.skill.cjs");

class CareGapPresentationAgent {
  constructor(config = {}) {
    this.name = "Care Gap Presentation Agent";
    this.version = "1.0.0";
    this.config = config;

    this.careGapResolver = new CareGapResolverTool(config);
    this.sectionStatusResolver = new SectionStatusResolverTool(config);
    this.careGapBuilder = new CareGapBuilderSkill(config);
  }

  async execute(context) {
    const { dashboardData } = context;
    if (!dashboardData) {
      return { success: false, error: "No dashboard data provided" };
    }

    return this.careGapBuilder.execute({
      dashboardData,
      careGapResolver: this.careGapResolver,
      sectionStatusResolver: this.sectionStatusResolver,
    });
  }
}

module.exports = CareGapPresentationAgent;
