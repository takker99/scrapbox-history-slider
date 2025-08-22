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

Deno.test("makeSnapshots - delete then insert restoration", () => {
  // Test the restoration logic where a line is deleted (most recent) then was originally inserted
  const lines: BaseLine[] = []; // Currently no lines (line was deleted)

  const commits: Commit[] = [
    // Most recent: delete (processed first in reverse)
    {
      id: "commit2",
      created: 2000,
      userId: "user2",
      parentId: "commit1",
      pageId: "page1",
      kind: "page",
      changes: [
        {
          _delete: "line1",
          lines: -1,
        },
      ],
    },
    // Earlier: insert (processed second in reverse, provides restoration content)
    {
      id: "commit1",
      created: 1000,
      userId: "user1",
      parentId: "parent1",
      pageId: "page1",
      kind: "page",
      changes: [
        {
          _insert: "_end",
          lines: {
            id: "line1",
            text: "Restored content",
          },
        },
      ],
    },
  ];

  const result = makeSnapshots(lines, commits);
  assertEquals(result.size, 2);

  // Check that the line is restored in the insert commit snapshot
  const insertState = result.get(1000);
  assertExists(insertState);
  assertEquals(insertState.length, 1);
  assertEquals(insertState[0].id, "line1");
  assertEquals(insertState[0].text, "Restored content"); // Should be restored from insert
});

Deno.test("makeSnapshots - delete then update restoration", () => {
  // Test restoration where a line is deleted (most recent) then an earlier update provides the content
  const lines: BaseLine[] = []; // Currently no lines (line was deleted)

  const commits: Commit[] = [
    // Most recent: delete (processed first in reverse)
    {
      id: "commit2",
      created: 2000,
      userId: "user2",
      parentId: "commit1",
      pageId: "page1",
      kind: "page",
      changes: [
        {
          _delete: "line1",
          lines: -1,
        },
      ],
    },
    // Earlier: update (processed second in reverse, provides restoration content)
    {
      id: "commit1",
      created: 1000,
      userId: "user1",
      parentId: "parent1",
      pageId: "page1",
      kind: "page",
      changes: [
        {
          _update: "line1",
          lines: {
            text: "Updated content",
            origText: "Original content",
          },
        },
      ],
    },
  ];

  const result = makeSnapshots(lines, commits);
  assertEquals(result.size, 2);

  // Check that the line is restored in the update commit snapshot
  const updateState = result.get(1000);
  assertExists(updateState);
  assertEquals(updateState.length, 1);
  assertEquals(updateState[0].id, "line1");
  assertEquals(updateState[0].text, "Updated content"); // Should be restored from update
});

Deno.test("makeSnapshots - normal update creates new object", () => {
  // Test that normal updates (not restoring deleted content) create new objects
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
            origText: "Original text",
          },
        },
      ],
    },
  ];

  const result = makeSnapshots(lines, commits);
  assertEquals(result.size, 1);

  const commitState = result.get(2000);
  assertExists(commitState);
  assertEquals(commitState.length, 1);
  assertEquals(commitState[0].text, "Updated text"); // Current text at commit time
});

Deno.test("makeSnapshots - created timestamp restoration across snapshots", () => {
  // Test that created timestamps are restored across all snapshots
  const lines: BaseLine[] = [
    {
      id: "line1",
      text: "Final content",
      userId: "user1",
      created: 1000,
      updated: 3000,
    },
  ];

  const commits: Commit[] = [
    // Most recent: update
    {
      id: "commit3",
      created: 3000,
      userId: "user1",
      parentId: "commit2",
      pageId: "page1",
      kind: "page",
      changes: [
        {
          _update: "line1",
          lines: {
            text: "Final content",
            origText: "Inserted content",
          },
        },
      ],
    },
    // Middle: delete
    {
      id: "commit2",
      created: 2000,
      userId: "user2",
      parentId: "commit1",
      pageId: "page1",
      kind: "page",
      changes: [
        {
          _delete: "line1",
          lines: -1,
        },
      ],
    },
    // Earliest: insert (should provide created timestamp)
    {
      id: "commit1",
      created: 1000,
      userId: "user1",
      parentId: "parent1",
      pageId: "page1",
      kind: "page",
      changes: [
        {
          _insert: "_end",
          lines: {
            id: "line1",
            text: "Inserted content",
          },
        },
      ],
    },
  ];

  const result = makeSnapshots(lines, commits);
  assertEquals(result.size, 3);

  // Check that created timestamp is correct in all snapshots
  const updateState = result.get(3000);
  const deleteState = result.get(2000);
  assertExists(updateState);
  assertExists(deleteState);

  assertEquals(updateState[0].created, 1000); // Should have original insert timestamp
  assertEquals(deleteState[0].created, 1000); // Should have original insert timestamp
});

Deno.test("makeSnapshots - edge case with multiple restores", () => {
  // Test scenario: current state has line2, line1 was deleted, then line1 was inserted earlier
  const lines: BaseLine[] = [
    {
      id: "line2",
      text: "Line 2 text",
      userId: "user1",
      created: 2000,
      updated: 2000,
    },
  ];

  const commits: Commit[] = [
    // Most recent: delete line1
    {
      id: "commit3",
      created: 3000,
      userId: "user2",
      parentId: "commit2",
      pageId: "page1",
      kind: "page",
      changes: [
        {
          _delete: "line1",
          lines: -1,
        },
      ],
    },
    // Insert line2
    {
      id: "commit2",
      created: 2000,
      userId: "user1",
      parentId: "commit1",
      pageId: "page1",
      kind: "page",
      changes: [
        {
          _insert: "_end",
          lines: {
            id: "line2",
            text: "Line 2 text",
          },
        },
      ],
    },
    // Original insert of line1 (should restore deleted line1)
    {
      id: "commit1",
      created: 1000,
      userId: "user1",
      parentId: "parent1",
      pageId: "page1",
      kind: "page",
      changes: [
        {
          _insert: "_end",
          lines: {
            id: "line1",
            text: "Original text",
          },
        },
      ],
    },
  ];

  const result = makeSnapshots(lines, commits);
  assertEquals(result.size, 3);

  // Verify that at commit 1000, line1 is restored
  const insertState = result.get(1000);
  assertExists(insertState);
  assertEquals(insertState.length, 1); // Should have restored line1 (line2 was removed by its insert reversal)
  assertEquals(insertState[0].id, "line1");
  assertEquals(insertState[0].text, "Original text");
});

Deno.test("makeSnapshots - complex branching scenario", () => {
  // Test the exact scenario described in the comment about shallow copying
  const lines: BaseLine[] = [
    { id: "a", text: "foo", userId: "user1", created: 1000, updated: 1000 },
    { id: "b", text: "bar", userId: "user1", created: 1000, updated: 1000 },
    { id: "c", text: "baz", userId: "user1", created: 1000, updated: 1000 },
  ];

  const commits: Commit[] = [
    // Step 1: Delete d (most recent, processed first)
    {
      id: "commit1",
      created: 3000,
      userId: "user1",
      parentId: "parent1",
      pageId: "page1",
      kind: "page",
      changes: [
        {
          _delete: "d",
          lines: -1,
        },
      ],
    },
    // Step 2: Some other operation
    {
      id: "commit2",
      created: 2000,
      userId: "user1",
      parentId: "commit1",
      pageId: "page1",
      kind: "page",
      changes: [
        {
          _update: "a",
          lines: {
            text: "foo",
            origText: "original foo",
          },
        },
      ],
    },
    // Step 3: Insert d with content (oldest, processed last, should restore dummy d)
    {
      id: "commit3",
      created: 1000,
      userId: "user1",
      parentId: "commit2",
      pageId: "page1",
      kind: "page",
      changes: [
        {
          _insert: "b", // Insert after b
          lines: {
            id: "d",
            text: "hoge",
          },
        },
      ],
    },
  ];

  const result = makeSnapshots(lines, commits);
  assertEquals(result.size, 3);

  // At step 1 (delete d, timestamp 3000), d should have dummy content initially
  const step1State = result.get(3000);
  assertExists(step1State);
  assertEquals(step1State.length, 3); // a, b, c (no d yet)

  // At step 2 (update a, timestamp 2000), d should still be dummy
  const step2State = result.get(2000);
  assertExists(step2State);
  assertEquals(step2State.length, 4); // a, b, c, d (dummy d added)

  // At step 3 (insert d, timestamp 1000), d should be restored
  const step3State = result.get(1000);
  assertExists(step3State);
  const dLineStep3 = step3State.find((line) => line.id === "d");
  assertExists(dLineStep3);
  assertEquals(dLineStep3.text, "hoge"); // Should be restored from insert
});
