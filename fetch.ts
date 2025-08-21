import { convert, type LineSnapShot } from "./convert.ts";
import { getCommits } from "./deps/scrapbox.ts";

export const getCommitHistory = async (
  project: string,
  pageId: string,
): Promise<{ range: number[]; history: LineSnapShot[] }> => {
  const res = await getCommits(project, pageId);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch commits for ${project}/${pageId}: ${res.statusText}`,
      { cause: res },
    );
  }
  return convert((await res.json()).commits);
};
