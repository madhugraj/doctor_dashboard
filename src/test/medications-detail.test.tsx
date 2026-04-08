import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import MedicationsDetail from "@/components/dashboard/MedicationsDetail";
import { patientData } from "@/data/patientData";

describe("MedicationsDetail", () => {
  it("hides the medication changes panel when no explicit change data exists", () => {
    const data = {
      ...patientData,
      medications: {
        ...patientData.medications,
        changes: {
          added: [],
          adjusted: [],
          discontinued: [],
        },
        interactionCheck: "",
      },
    };

    render(<MedicationsDetail onBack={vi.fn()} data={data} />);

    expect(screen.queryByText("Medication Changes During Stay")).not.toBeInTheDocument();
    expect(screen.getByText("Discharge Medication List")).toBeInTheDocument();
  });
});
