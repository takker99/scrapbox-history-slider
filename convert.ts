import type {
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
