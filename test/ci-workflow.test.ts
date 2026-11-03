import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("runs CodeQL when a draft PR becomes ready and preserves weekly/manual scans", async () => {
  const workflow = await readFile(".github/workflows/codeql.yml", "utf8");
  const header = workflow.split("\njobs:\n", 1)[0];

  expect(header).not.toMatch(/^  push:/mu);
  expect(header).toContain("types: [opened, synchronize, reopened, ready_for_review]");
  expect(header).toContain('cron: "31 5 * * 1"');
  expect(header).toContain("  workflow_dispatch:");
  expect(header).toContain(
    "group: codeql-${{ github.workflow }}-${{ github.event_name }}-" +
      "${{ github.event_name == 'workflow_dispatch' && github.run_id || github.event.pull_request.number || github.ref }}",
  );
  expect(header).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
});
