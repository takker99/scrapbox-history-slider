import type {
  BaseLine,
  Change,
  Commit,
  LineId,
  UnixTime,
  UserId,
} from "./deps/scrapbox.ts";

export interface SnapShot {
  text?: string;
  type: "insert" | "update" | "delete";
  userId: UserId;
}
export interface LineSnapShot {
  id: LineId;
  snapshots: Map<UnixTime, SnapShot>;
}
/** commitsから履歴を作成する
 *
 * @param commits 変換したいcommitのlist
 */
export const convert = (
  commits: Commit[],
): { history: LineSnapShot[]; range: UnixTime[] } => {
  // _insert, _update, _delete以外を無視する
  const changes = commits.flatMap(
    ({ changes, created, userId }) =>
      changes.flatMap((change) => {
        const changeInfo = makeChangeInfo(change, userId, created);
        return changeInfo ? [changeInfo] : [];
      }),
  );

  const range = [...new Set(changes.map(({ created }) => created))].sort();

  // LineSnapshotに変換する
  const lines = changes.reduce((lines, change) => {
    if (change.type === "insert") {
      const snapshots = new Map<UnixTime, SnapShot>();
      snapshots.set(change.created, {
        text: change.text,
        type: change.type,
        userId: change.userId,
      });
      const line: LineSnapShot = {
        id: change.id,
        snapshots,
      };
      if (change.parentId === "_end") return [...lines, line];

      // parentIdのデータの前に挿入する
      const index = lines.findIndex(({ id }) => id === change.parentId);
      // parentIdのデータが存在しなかったら、とりあえず末尾に挿入する
      if (index < 0) {
        console.warn(
          `[scrapbox-snapshot@0.1.0] The parent line the snapshot would insert before is not found. change: `,
          change,
        );
        return [...lines, line];
      }
      return [...lines.slice(0, index), line, ...lines.slice(index)];
    }

    // 行データを追加するsnapshotを探す
    const index = lines.findIndex(({ id }) => id === change.id);
    if (index < 0) {
      console.warn(
        `[scrapbox-snapshot@0.1.0] The line data to be append the change is not found. change: `,
        change,
      );
      return lines;
    }

    lines[index].snapshots.set(change.created, {
      text: change.type === "update" ? change.text : undefined,
      type: change.type,
      userId: change.userId,
    });
    return lines;
  }, [] as LineSnapShot[]);

  return { history: lines, range };
};

const makeChangeInfo = (change: Change, userId: UserId, created: UnixTime) => {
  if ("_insert" in change) {
    return {
      type: "insert",
      id: change.lines.id,
      parentId: change._insert,
      text: change.lines.text,
      userId,
      created,
    } as const;
  }
  if ("_update" in change) {
    return {
      type: "update",
      id: change._update,
      text: change.lines.text,
      userId,
      created,
    } as const;
  }
  if ("_delete" in change) {
    return {
      type: "delete",
      id: change._delete,
      userId,
      created,
    } as const;
  }
  return;
};

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
        const dummyLineIndex = currentLines.findIndex(line => 
          line.id === insertedLineId && line.text === "[deleted line - content unknown]"
        );
        
        if (dummyLineIndex !== -1) {
          // Found a line with dummy content - restore it in-place
          const dummyLine = currentLines[dummyLineIndex];
          dummyLine.text = change.lines.text;
          dummyLine.created = commit.created;
          dummyLine.updated = commit.created;
          dummyLine.userId = commit.userId;
        }
        
        // Remove the inserted line (it didn't exist before this commit)
        currentLines = currentLines.filter(line => line.id !== change.lines.id);
      } else if ("_update" in change) {
        // Reverse of update - revert to original text
        const lineIndex = currentLines.findIndex(line => line.id === change._update);
        if (lineIndex !== -1) {
          const line = currentLines[lineIndex];
          // Check if this line currently has dummy content from a previous delete
          if (line.text === "[deleted line - content unknown]") {
            // This line was previously deleted, restore its content in-place
            // This will update all snapshots that reference this line object
            line.text = change.lines.origText || change.lines.text;
            line.updated = commit.created;
            // Keep the original created timestamp and userId as they come from the original insert
          } else {
            // Normal update revert - create new line object to avoid affecting other snapshots
            currentLines[lineIndex] = {
              ...line,
              text: change.lines.origText || change.lines.text,
              updated: commit.created,
            };
          }
        }
      } else if ("_delete" in change) {
        // Reverse of delete - add the line back with dummy content initially
        const restoredLine: BaseLine = {
          id: change._delete,
          text: "[deleted line - content unknown]",
          userId: commit.userId,
          created: commit.created - 1, // Dummy timestamp, will be corrected when we find the original insert
          updated: commit.created - 1,
        };
        // Insert at the end since we don't know original position
        currentLines.push(restoredLine);
      }
    }
  }

  return snapshots;
};


