import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChatAssistantPanel from "@/components/dashboard/ChatAssistantPanel";

describe("ChatAssistantPanel execution log", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the execution log and provider badge for assistant turns", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          session: {
            chatId: "chat-1",
            documentId: "doc-1",
            messages: [
              {
                id: "assistant-1",
                role: "assistant",
                answer: "External Reference: Mannitol is an osmotic diuretic.",
                source_class: "external",
                confidence: 60,
                confidence_label: "low",
                llm_provider: "external_fallback",
                citations: [],
                trace: {
                  provider: "external_fallback",
                  final_state: "answered",
                  steps: [
                    {
                      key: "routing",
                      label: "Routing",
                      status: "ok",
                      summary: "Intent drug_safety via default response.",
                      meta: { external: "yes", sections: "medications" },
                    },
                    {
                      key: "external_search",
                      label: "External Search",
                      status: "ok",
                      summary: "Retrieved 1 external evidence item.",
                      meta: { sources: "medlineplus, rxnorm" },
                    },
                  ],
                },
              },
            ],
          },
        }),
      }),
    );

    render(<ChatAssistantPanel documentId="doc-1" currentSection="medications" processedDocument={null} />);

    await waitFor(() => expect(fetch).toHaveBeenCalled());

    fireEvent.click(screen.getByTitle("Open chat"));

    expect((await screen.findAllByText("External Fallback")).length).toBeGreaterThan(0);
    expect(screen.getByText("Execution log")).toBeInTheDocument();
    expect(screen.getByText("Intent drug_safety via default response.")).toBeInTheDocument();
    expect(screen.getByText("Retrieved 1 external evidence item.")).toBeInTheDocument();
    expect(screen.getByText("Sections: medications")).toBeInTheDocument();
  });
});
