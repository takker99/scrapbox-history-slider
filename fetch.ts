import { convert, LineSnapShot } from "./convert.ts";
import type { CommitsResponse, PageSnapshot } from "./deps/scrapbox.ts";

export const getCommitHistory = async (
  project: string,
  pageId: string,
): Promise<{ range: number[]; history: LineSnapShot[] }> => {
  const res = await fetch(
    `/api/commits/${project}/${pageId}`,
  );
  const { commits } = (await res.json()) as CommitsResponse;
  return convert(commits);
};

export const getPageHistory = async (
  project: string,
  pageId: string,
) => {
  const res = await fetch(
    `/api/page-snapshots/${project}/${pageId}`,
  );
  const { snapshots } = (await res.json()) as PageSnapshot;

  const pages = new Map(
    snapshots.map(({ lines, created }) => [created, lines]),
  );
  const range = snapshots.map(({ created }) => created).sort();
  return { pages, range };
};
