import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { makeSnapshots } from "./convert.ts";
import type { BaseLine, Commit } from "./deps/scrapbox.ts";

Deno.test("makeSnapshots - empty inputs", () => {
  const result = makeSnapshots([], []);
  assertEquals(result.size, 0);
});

Deno.test("makeSnapshots - only current lines, no commits", () => {
  const lines: BaseLine[] = [
    {
      id: "line1",
      text: "Hello world",
      userId: "user1",
      created: 1000,
      updated: 1000,
    },
  ];

  const result = makeSnapshots(lines, []);
  assertEquals(result.size, 0);
});

Deno.test("makeSnapshots - single insert commit", () => {
  const lines: BaseLine[] = [
    {
      id: "line1",
      text: "Hello world",
      userId: "user1",
      created: 1000,
      updated: 1000,
    },
  ];

  const commits: Commit[] = [
    {
      id: "commit1",
      created: 2000,
      userId: "user1",
      parentId: "parent1",
      pageId: "page1",
      kind: "page",
      changes: [
        {
          _insert: "_end",
          lines: {
            id: "line1",
            text: "Hello world",
          },
        },
      ],
    },
  ];

  const result = makeSnapshots(lines, commits);
  assertEquals(result.size, 1); // One snapshot for the commit timestamp

  // Check the snapshot at commit time - should have current lines
  const commitState = result.get(2000);
  assertExists(commitState);
  assertEquals(commitState.length, 1);
  assertEquals(commitState[0].text, "Hello world");
});

Deno.test("makeSnapshots - single update commit", () => {
  const lines: BaseLine[] = [
    {
      id: "line1",
      text: "Updated text",
      userId: "user1",
      created: 1000,
      updated: 2000,
    },
  ];

  const commits: Commit[] = [
    {
      id: "commit1",
      created: 2000,
      userId: "user1",
      parentId: "parent1",
      pageId: "page1",
      kind: "page",
      changes: [
        {
          _update: "line1",
          lines: {
            text: "Updated text",
            origText: "Original text", // Need to provide original text
          },
        },
      ],
    },
  ];

  const result = makeSnapshots(lines, commits);
  assertEquals(result.size, 1); // One snapshot

  // Check that the snapshot shows the state before the update
  const commitState = result.get(2000);
  assertExists(commitState);
  assertEquals(commitState.length, 1);
  assertEquals(commitState[0].text, "Updated text"); // Should have current text
});

Deno.test("makeSnapshots - single delete commit", () => {
  const lines: BaseLine[] = []; // Line was deleted

  const commits: Commit[] = [
    {
      id: "commit1",
      created: 2000,
      userId: "user1",
      parentId: "parent1",
      pageId: "page1",
      kind: "page",
      changes: [
        {
          _delete: "line1",
          lines: -1, // Delete changes have lines: -1
        },
      ],
    },
  ];

  const result = makeSnapshots(lines, commits);
  assertEquals(result.size, 1); // One snapshot

  // Check that there's a restored line in the snapshot
  const commitState = result.get(2000);
  assertExists(commitState);
  assertEquals(commitState.length, 0); // Current lines are empty (line was deleted)
});

Deno.test("makeSnapshots - multiple commits with different changes", () => {
  const lines: BaseLine[] = [
    {
      id: "line2",
      text: "Final text",
      userId: "user1",
      created: 1000,
      updated: 3000,
    },
  ];

  const commits: Commit[] = [
    // Most recent commit - update
    {
      id: "commit2",
      created: 3000,
      userId: "user1",
      parentId: "commit1",
      pageId: "page1",
      kind: "page",
      changes: [
        {
          _update: "line2",
          lines: {
            text: "Final text",
            origText: "Previous text", // Need original text
          },
        },
      ],
    },
    // Earlier commit - insert
    {
      id: "commit1",
      created: 2000,
      userId: "user1",
      parentId: "parent1",
      pageId: "page1",
      kind: "page",
      changes: [
        {
          _insert: "_end",
          lines: {
            id: "line2",
            text: "Initial text",
          },
        },
      ],
    },
  ];

  const result = makeSnapshots(lines, commits);
  assertEquals(result.size, 2); // Two snapshots for two commits

  // Verify we have states for both timestamps
  assertEquals(result.has(3000), true);
  assertEquals(result.has(2000), true);
});

Deno.test("makeSnapshots - commits with no changes", () => {
  const lines: BaseLine[] = [
    {
      id: "line1",
      text: "Hello world",
      userId: "user1",
      created: 1000,
      updated: 1000,
    },
  ];

  const commits: Commit[] = [
    {
      id: "commit1",
      created: 2000,
      userId: "user1",
      parentId: "parent1",
      pageId: "page1",
      kind: "page",
      changes: [], // No changes
    },
  ];

  const result = makeSnapshots(lines, commits);
  assertEquals(result.size, 1); // Only one state since no actual changes
});

Deno.test("makeSnapshots - timestamps are properly sorted", () => {
  const lines: BaseLine[] = [];

  const commits: Commit[] = [
    {
      id: "commit3",
      created: 3000, // Most recent
      userId: "user1",
      parentId: "commit2",
      pageId: "page1",
      kind: "page",
      changes: [
        {
          _insert: "_end",
          lines: {
            id: "line3",
            text: "Third line",
          },
        },
      ],
    },
    {
      id: "commit1",
      created: 1000, // Oldest
      userId: "user1",
      parentId: "parent1",
      pageId: "page1",
      kind: "page",
      changes: [
        {
          _insert: "_end",
          lines: {
            id: "line1",
            text: "First line",
          },
        },
      ],
    },
    {
      id: "commit2",
      created: 2000, // Middle
      userId: "user1",
      parentId: "commit1",
      pageId: "page1",
      kind: "page",
      changes: [
        {
          _insert: "_end",
          lines: {
            id: "line2",
            text: "Second line",
          },
        },
      ],
    },
  ];

  const result = makeSnapshots(lines, commits);
  assertEquals(result.size, 3); // Three snapshots for three commits
  const timestamps = Array.from(result.keys()).sort((a, b) => b - a);

  // Should be sorted newest first
  assertEquals(timestamps[0], 3000);
  assertEquals(timestamps[1], 2000);
  assertEquals(timestamps[2], 1000);
});
