import { makeSnapshots } from "./convert.ts";
import { assertEquals, assertExists } from "./deps/assert.ts";
import type { BaseLine, Commit } from "./deps/scrapbox.ts";

// Top-level grouped test for makeSnapshots using nested t.step for clarity.
Deno.test("makeSnapshots - nested scenarios", async (t) => {
  await t.step("basic behavior", async (t) => {
    await t.step("empty inputs", () => {
      const result = makeSnapshots([], []);
      assertEquals(result.size, 0);
    });

    await t.step("only current lines, no commits", () => {
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
  });

  await t.step("single-change commits", async (t) => {
    await t.step("single insert commit", () => {
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

      const commitState = result.get(2000);
      assertExists(commitState);
      assertEquals(commitState.length, 1);
      assertEquals(commitState[0].text, "Hello world");
    });

    await t.step("single update commit", () => {
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
      assertEquals(commitState[0].text, "Updated text");
    });

    await t.step("single delete commit", () => {
      const lines: BaseLine[] = [];

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
              lines: -1,
            },
          ],
        },
      ];

      const result = makeSnapshots(lines, commits);
      assertEquals(result.size, 1);

      const commitState = result.get(2000);
      assertExists(commitState);
      assertEquals(commitState.length, 0);
    });
  });

  await t.step("multiple commits and ordering", async (t) => {
    await t.step("multiple commits with different changes", () => {
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
                origText: "Previous text",
              },
            },
          ],
        },
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
      assertEquals(result.size, 2);
      assertEquals(result.has(3000), true);
      assertEquals(result.has(2000), true);
    });

    await t.step("commits with no changes", () => {
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
          changes: [],
        },
      ];

      const result = makeSnapshots(lines, commits);
      assertEquals(result.size, 1);
    });

    await t.step("timestamps are properly sorted", () => {
      const lines: BaseLine[] = [];

      const commits: Commit[] = [
        {
          id: "commit3",
          created: 3000,
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
                text: "First line",
              },
            },
          ],
        },
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
                text: "Second line",
              },
            },
          ],
        },
      ];

      const result = makeSnapshots(lines, commits);
      assertEquals(result.size, 3);
      const timestamps = Array.from(result.keys()).sort((a, b) => b - a);
      assertEquals(timestamps[0], 3000);
      assertEquals(timestamps[1], 2000);
      assertEquals(timestamps[2], 1000);
    });
  });

  await t.step("restoration scenarios", async (t) => {
    await t.step("delete then insert restoration", () => {
      const lines: BaseLine[] = [];

      const commits: Commit[] = [
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

      const insertState = result.get(1000);
      assertExists(insertState);
      assertEquals(insertState.length, 1);
      assertEquals(insertState[0].id, "line1");
      assertEquals(insertState[0].text, "Restored content");
    });

    await t.step("delete then update restoration", () => {
      const lines: BaseLine[] = [];

      const commits: Commit[] = [
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

      const updateState = result.get(1000);
      assertExists(updateState);
      assertEquals(updateState.length, 1);
      assertEquals(updateState[0].id, "line1");
      assertEquals(updateState[0].text, "Updated content");
    });
  });

  await t.step("misc scenarios", async (t) => {
    await t.step("normal update creates new object", () => {
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
      assertEquals(commitState[0].text, "Updated text");
    });

    await t.step("created timestamp restoration across snapshots", () => {
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

      const updateState = result.get(3000);
      const deleteState = result.get(2000);
      assertExists(updateState);
      assertExists(deleteState);

      assertEquals(updateState[0].created, 1000);
      assertEquals(deleteState[0].created, 1000);
    });

    await t.step("edge case with multiple restores", () => {
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

      const insertState = result.get(1000);
      assertExists(insertState);
      assertEquals(insertState.length, 1);
      assertEquals(insertState[0].id, "line1");
      assertEquals(insertState[0].text, "Original text");
    });

    await t.step("complex branching scenario", () => {
      const lines: BaseLine[] = [
        { id: "a", text: "foo", userId: "user1", created: 1000, updated: 1000 },
        { id: "b", text: "bar", userId: "user1", created: 1000, updated: 1000 },
        { id: "c", text: "baz", userId: "user1", created: 1000, updated: 1000 },
      ];

      const commits: Commit[] = [
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
        {
          id: "commit3",
          created: 1000,
          userId: "user1",
          parentId: "commit2",
          pageId: "page1",
          kind: "page",
          changes: [
            {
              _insert: "b",
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

      const step1State = result.get(3000);
      assertExists(step1State);
      assertEquals(step1State.length, 3);

      const step2State = result.get(2000);
      assertExists(step2State);
      assertEquals(step2State.length, 4);

      const step3State = result.get(1000);
      assertExists(step3State);
      const dLineStep3 = step3State.find((line) => line.id === "d");
      assertExists(dLineStep3);
      assertEquals(dLineStep3.text, "hoge");
    });
  });
});
