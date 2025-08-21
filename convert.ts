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
    // Record the state at this commit's timestamp (before applying reverse)
    snapshots.set(commit.created, [...currentLines]);

    // Apply reverse changes to get the state before this commit
    currentLines = applyReverseChanges(currentLines, commit);
  }

  return snapshots;
};

/**
 * Apply changes in reverse to get the previous state
 */
function applyReverseChanges(lines: BaseLine[], commit: Commit): BaseLine[] {
  let result = [...lines];

  // Process changes in reverse order since we're working backwards
  for (let i = commit.changes.length - 1; i >= 0; i--) {
    const change = commit.changes[i];
    result = applyReverseChange(result, change, commit.userId, commit.created);
  }

  return result;
}

/**
 * Apply a single change in reverse
 */
function applyReverseChange(
  lines: BaseLine[],
  change: Change,
  userId: UserId,
  created: UnixTime,
): BaseLine[] {
  if ("_insert" in change) {
    // Reverse of insert is delete - remove the line that was inserted
    return lines.filter((line) => line.id !== change.lines.id);
  }

  if ("_update" in change) {
    // Reverse of update - restore the original text
    const lineIndex = lines.findIndex((line) => line.id === change._update);
    if (lineIndex >= 0) {
      const updatedLines = [...lines];
      updatedLines[lineIndex] = {
        ...updatedLines[lineIndex],
        text: change.lines.origText, // Use the original text from the change
        updated: created - 1, // Make it slightly older
      };
      return updatedLines;
    }
    return lines;
  }

  if ("_delete" in change) {
    // Reverse of delete is insert - add back the deleted line with dummy content
    const dummyLine: BaseLine = {
      id: change._delete,
      text: "[deleted line - content unknown]", // Dummy content since we can't restore it
      userId,
      created: created - 1, // Make it slightly older
      updated: created - 1,
    };

    // Insert at the end since we don't know original position
    return [...lines, dummyLine];
  }

  return lines;
}
