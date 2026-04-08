import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import UploadCenter from "@/pages/UploadCenter";
import type { ProcessedDocument } from "@/lib/processedDocuments";

describe("UploadCenter", () => {
  let documents: ProcessedDocument[];
  let processingStarted: boolean;

  beforeEach(() => {
    documents = [];
    processingStarted = false;

    class MockEventSource {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(_url: string) {
        processingStarted = true;
      }

      close() {}
    }

    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.endsWith("/documents") && method === "GET") {
          if (processingStarted && documents[0]?.status === "queued") {
            documents = [
              {
                ...documents[0],
                status: "processed",
                department: "Cardiology / Cath Lab",
                processedAt: "2026-04-04T00:02:00Z",
                result: {
                  meta: { pdf_file: documents[0].name, department_type: "Cardiology / Cath Lab" },
                  dashboard_cards: {},
                  sample_patient_data: { name: "Sample Patient", age: 64, mrn: "MRN-1" },
                },
              },
            ];
          }
          return new Response(JSON.stringify({ documents }), { status: 200 });
        }

        if (url.endsWith("/documents/upload") && method === "POST") {
          documents = [
            {
              id: "doc-1",
              name: "Custom.MEXX.Report.ZEN.DischargeSummary3.cls.pdf",
              size: 5,
              uploadedAt: "2026-04-04T00:00:00Z",
              status: "queued",
              department: "Cardiology / Cath Lab",
              result: null,
              error: null,
            },
          ];
          return new Response(JSON.stringify({ documents }), { status: 201 });
        }

        if (url.includes("/documents/") && method === "DELETE") {
          documents = [];
          return new Response(null, { status: 204 });
        }

        return new Response(JSON.stringify({ error: "Unhandled request" }), { status: 500 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the intake page with the process action disabled initially", async () => {
    render(
      <MemoryRouter>
        <UploadCenter />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/queue status/i)).toBeInTheDocument();
    expect(await screen.findByText(/no documents found/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /process queue/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /drop pdf files here or click to upload/i })).toBeInTheDocument();
  });

  it("adds uploaded pdfs to the queue and processes them", async () => {
    const { container } = render(
      <MemoryRouter>
        <UploadCenter />
      </MemoryRouter>,
    );

    await screen.findByText(/no documents found/i);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["dummy"], "Custom.MEXX.Report.ZEN.DischargeSummary3.cls.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("Custom.MEXX.Report.ZEN.DischargeSummary3.cls.pdf")).toBeInTheDocument();

    const processButton = screen.getByRole("button", { name: /process queue/i });
    expect(processButton).toBeEnabled();

    fireEvent.click(processButton);

    await waitFor(() => {
      expect(screen.getAllByText(/^Processed$/).length).toBeGreaterThan(0);
    }, { timeout: 4000 });
  });

  it("searches processed records by patient name and MRN", async () => {
    const { container } = render(
      <MemoryRouter>
        <UploadCenter />
      </MemoryRouter>,
    );

    await screen.findByText(/no documents found/i);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["dummy"], "Custom.MEXX.Report.ZEN.DischargeSummary3.cls.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(await screen.findByRole("button", { name: /process queue/i }));

    await screen.findByText(/sample patient · mrn mrn-1/i, {}, { timeout: 4000 });

    fireEvent.change(screen.getByPlaceholderText(/search by pdf, patient, or mrn/i), {
      target: { value: "MRN-1" },
    });

    expect(screen.getByText("Custom.MEXX.Report.ZEN.DischargeSummary3.cls.pdf")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/search by pdf, patient, or mrn/i), {
      target: { value: "Sample Patient" },
    });

    expect(screen.getByText("Custom.MEXX.Report.ZEN.DischargeSummary3.cls.pdf")).toBeInTheDocument();
  });
});
