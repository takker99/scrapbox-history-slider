import type { BaseLine, Commit, UnixTime } from "./deps/scrapbox.ts";

/**
 * Creates snapshots for all timestamps by working backwards from current lines
 *
 * @param lines Current lines of the page
 * @param commits Commits ordered from newest to oldest
 * @returns Map with unix timestamps as keys and line arrays as values
 */
export const makeSnapshots = (
  lines: BaseLine[],
  commits: Commit[],
): Map<UnixTime, BaseLine[]> => {
  const snapshots = new Map<UnixTime, BaseLine[]>();

  if (commits.length === 0) {
    return snapshots;
  }

  // Start with current lines and work backwards through commits
  let currentLines = [...lines];

  // Work backwards through each commit (commits are newest to oldest)
  for (const commit of commits) {
    // Record the state at this commit's timestamp (shallow copy for reference sharing)
    snapshots.set(commit.created, [...currentLines]);

    // Apply reverse changes to get the state before this commit
    for (const change of commit.changes) {
      if ("_insert" in change) {
        // Reverse of insert - remove the line, but first check if any line with dummy content can be restored
        const insertedLineId = change.lines.id;

        // Check if any existing line has dummy content for this lineId
        const insertedLine = currentLines.find((line) =>
          line.id === insertedLineId
        );

        let wasRestored = false;
        if (insertedLine && insertedLine.text === "-1") {
          // Restore it in-place
          insertedLine.text = change.lines.text;
          for (const lines of snapshots.values()) {
            const futureLine = lines.find((line) => line.id === insertedLineId);
            if (!futureLine) continue;
            futureLine.created = commit.created;
          }
          insertedLine.updated = commit.created;
          insertedLine.userId = commit.userId;
          wasRestored = true;
        }

        // Remove the inserted line only if it wasn't a restoration (it didn't exist before this commit)
        if (!wasRestored) {
          currentLines = currentLines.filter((line) =>
            line.id !== change.lines.id
          );
        }
      } else if ("_update" in change) {
        // Reverse of update - revert to original text
        const lineIndex = currentLines.findIndex((line) =>
          line.id === change._update
        );
        if (lineIndex !== -1) {
          const updatedLine = currentLines[lineIndex];
          // Check if this line currently has dummy content from a previous delete
          if (updatedLine.text === "-1") {
            // This line was previously deleted, restore its content in-place
            // This will update all snapshots that reference this line object
            updatedLine.text = change.lines.text;
            updatedLine.updated = commit.created;
            updatedLine.userId = commit.userId;
          } else {
            // Normal update revert - create new line object to avoid affecting other snapshots
            currentLines[lineIndex] = {
              ...updatedLine,
              text: change.lines.origText,
              updated: -1, // dummy timestamp
            };
          }
        }
      } else if ("_delete" in change) {
        // Reverse of delete - add the line back with dummy content initially
        const restoredLine: BaseLine = {
          id: change._delete,
          text: "-1", // dummy text
          userId: "-1", // Dummy user id
          created: -1, // Dummy timestamp, will be corrected when we find the original insert
          updated: -1, // Dummy timestamp, will be corrected when we find the original insert
        };
        // Insert at the end since we don't know original position
        currentLines.push(restoredLine);
      }
    }
  }

  return snapshots;
};
