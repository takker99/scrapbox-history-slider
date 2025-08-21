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

  // Build history map for restoration purposes
  const lineHistory = buildLineHistory(commits);

  // Start with current lines and work backwards through commits
  let currentLines = [...lines];

  // Work backwards through each commit (commits are newest to oldest)
  for (const commit of commits) {
    // Record the state at this commit's timestamp (before applying reverse)
    snapshots.set(commit.created, [...currentLines]);

    // Apply reverse changes to get the state before this commit
    currentLines = applyReverseChanges(currentLines, commit, lineHistory);
  }

  return snapshots;
};

/**
 * Line history entry for restoration
 */
interface LineHistoryEntry {
  lineId: LineId;
  type: "insert" | "update" | "delete";
  text?: string;
  origText?: string;
  created: UnixTime;
  userId: UserId;
}

/**
 * Build history map to help with restoration of missing information
 */
function buildLineHistory(commits: Commit[]): Map<LineId, LineHistoryEntry[]> {
  const history = new Map<LineId, LineHistoryEntry[]>();

  // Process commits in chronological order (oldest first) to build history
  const chronologicalCommits = [...commits].reverse();

  for (const commit of chronologicalCommits) {
    for (const change of commit.changes) {
      let entry: LineHistoryEntry | null = null;

      if ("_insert" in change) {
        entry = {
          lineId: change.lines.id,
          type: "insert",
          text: change.lines.text,
          created: commit.created,
          userId: commit.userId,
        };
      } else if ("_update" in change) {
        entry = {
          lineId: change._update,
          type: "update",
          text: change.lines.text,
          origText: change.lines.origText,
          created: commit.created,
          userId: commit.userId,
        };
      } else if ("_delete" in change) {
        entry = {
          lineId: change._delete,
          type: "delete",
          created: commit.created,
          userId: commit.userId,
        };
      }

      if (entry) {
        if (!history.has(entry.lineId)) {
          history.set(entry.lineId, []);
        }
        history.get(entry.lineId)!.push(entry);
      }
    }
  }

  return history;
}

/**
 * Apply changes in reverse to get the previous state
 */
function applyReverseChanges(
  lines: BaseLine[],
  commit: Commit,
  lineHistory: Map<LineId, LineHistoryEntry[]>,
): BaseLine[] {
  let result = [...lines];

  // Process changes in reverse order since we're working backwards
  for (let i = commit.changes.length - 1; i >= 0; i--) {
    const change = commit.changes[i];
    result = applyReverseChange(
      result,
      change,
      commit.userId,
      commit.created,
      lineHistory,
    );
  }

  return result;
}

/**
 * Apply a single change in reverse with enhanced restoration
 */
function applyReverseChange(
  lines: BaseLine[],
  change: Change,
  userId: UserId,
  created: UnixTime,
  lineHistory: Map<LineId, LineHistoryEntry[]>,
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
      const restoredTimestamps = restoreTimestamps(change._update, created, lineHistory);
      
      updatedLines[lineIndex] = {
        ...updatedLines[lineIndex],
        text: change.lines.origText, // Use the original text from the change
        created: restoredTimestamps.created,
        updated: restoredTimestamps.updated,
      };
      return updatedLines;
    }
    return lines;
  }

  if ("_delete" in change) {
    // Reverse of delete - try to restore the original content and timestamps
    const restoredContent = restoreDeletedContent(change._delete, created, lineHistory);
    const restoredTimestamps = restoreTimestamps(change._delete, created, lineHistory);
    
    const restoredLine: BaseLine = {
      id: change._delete,
      text: restoredContent,
      userId: restoredTimestamps.userId || userId,
      created: restoredTimestamps.created,
      updated: restoredTimestamps.updated,
    };

    // Insert at the end since we don't know original position
    return [...lines, restoredLine];
  }

  return lines;
}

/**
 * Restore deleted content by looking for previous changes on the same lineId
 */
function restoreDeletedContent(
  lineId: LineId,
  beforeTime: UnixTime,
  lineHistory: Map<LineId, LineHistoryEntry[]>,
): string {
  const history = lineHistory.get(lineId);
  if (!history) {
    return "[deleted line - content unknown]";
  }

  // Find the most recent change before the delete time that has text
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry.created < beforeTime && (entry.type === "insert" || entry.type === "update")) {
      return entry.text || "[deleted line - content unknown]";
    }
  }

  return "[deleted line - content unknown]";
}

/**
 * Restore timestamps by looking for the original insert and most recent update
 */
function restoreTimestamps(
  lineId: LineId,
  beforeTime: UnixTime,
  lineHistory: Map<LineId, LineHistoryEntry[]>,
): { created: UnixTime; updated: UnixTime; userId?: UserId } {
  const history = lineHistory.get(lineId);
  if (!history) {
    return {
      created: beforeTime - 1,
      updated: beforeTime - 1,
    };
  }

  let created = beforeTime - 1;
  let updated = beforeTime - 1;
  let userId: UserId | undefined;

  // Find the original insert (created timestamp)
  for (const entry of history) {
    if (entry.type === "insert" && entry.created < beforeTime) {
      created = entry.created;
      userId = entry.userId;
      break; // First insert is the creation
    }
  }

  // Find the most recent update before the current change
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry.created < beforeTime && (entry.type === "insert" || entry.type === "update")) {
      updated = entry.created;
      break;
    }
  }

  return { created, updated, userId };
}
