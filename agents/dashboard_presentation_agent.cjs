const CardMetricSelectorTool = require("../tools/presentation/card_metric_selector.tool.cjs");
const NoteSelectorTool = require("../tools/presentation/note_selector.tool.cjs");
const TimelineFormatterTool = require("../tools/presentation/timeline_formatter.tool.cjs");
const SectionStatusResolverTool = require("../tools/presentation/section_status_resolver.tool.cjs");

const SummaryCardBuilderSkill = require("../skills/presentation/summary_card_builder.skill.cjs");
const NotesRailBuilderSkill = require("../skills/presentation/notes_rail_builder.skill.cjs");
const CareGapPresentationAgent = require("./care_gap_presentation_agent.cjs");
const RiskWatchPresentationAgent = require("./risk_watch_presentation_agent.cjs");

class DashboardPresentationAgent {
  constructor(config = {}) {
    this.name = "Dashboard Presentation Agent";
    this.version = "1.0.0";
    this.config = config;

    this.cardMetricSelector = new CardMetricSelectorTool(config);
    this.noteSelector = new NoteSelectorTool(config);
    this.timelineFormatter = new TimelineFormatterTool(config);
    this.sectionStatusResolver = new SectionStatusResolverTool(config);

    this.summaryCardBuilder = new SummaryCardBuilderSkill(config);
    this.notesRailBuilder = new NotesRailBuilderSkill(config);
    this.careGapPresentationAgent = new CareGapPresentationAgent(config);
    this.riskWatchPresentationAgent = new RiskWatchPresentationAgent(config);
  }

  async execute(context) {
    const { dashboardData } = context;
    if (!dashboardData) {
      return { success: false, error: "No dashboard data provided" };
    }

    const summaryResult = await this.summaryCardBuilder.execute({
      dashboardData,
      cardMetricSelector: this.cardMetricSelector,
      sectionStatusResolver: this.sectionStatusResolver,
    });

    const notesResult = await this.notesRailBuilder.execute({
      dashboardData,
      noteSelector: this.noteSelector,
      timelineFormatter: this.timelineFormatter,
    });

    const careGapResult = await this.careGapPresentationAgent.execute({ dashboardData });
    const riskWatchResult = await this.riskWatchPresentationAgent.execute({ dashboardData });

    return {
      success: summaryResult.success && notesResult.success && careGapResult.success && riskWatchResult.success,
      step: "dashboard_presentation_agent",
      data: {
        summary_cards:
          summaryResult.success || careGapResult.success || riskWatchResult.success
            ? {
                ...(summaryResult.success ? summaryResult.data : {}),
                ...(careGapResult.success ? careGapResult.data : {}),
                ...(riskWatchResult.success ? riskWatchResult.data : {}),
              }
            : {},
        notes_rail: notesResult.success ? notesResult.data : [],
      },
    };
  }
}

module.exports = DashboardPresentationAgent;
