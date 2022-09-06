/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="dom" />
/** @jsx h */
/** @jsxFrag Fragment */

import {
  Fragment,
  h,
  render,
  useCallback,
  useEffect,
  useState,
} from "./deps/preact.tsx";
import { lightFormat } from "./deps/date-fns.ts";
import { useAsync } from "./useAsync.ts";
import { getCommitHistory, getPageHistory } from "./fetch.ts";
import type { Scrapbox } from "./deps/scrapbox.ts";
declare const scrapbox: Scrapbox;

export interface Controller {
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const setup = (projects: string[]): Promise<Controller> => {
  const app = document.createElement("div");
  app.dataset.userscriptName = "takker99/scrapbox-history-slider";
  const shadowRoot = app.attachShadow({ mode: "open" });
  document.body.append(app);
  return new Promise(
    (resolve) =>
      render(
        <App getController={(controller) => resolve(controller)} />,
        shadowRoot,
      ),
  );
};

interface Props {
  getController: (controller: Controller) => void;
}

const App = ({ getController }: Props) => {
  const [closed, setClosed] = useState(true);
  const open = useCallback(() => setClosed(false), []);
  const close = useCallback(() => setClosed(true), []);
  const toggle = useCallback(() => setClosed((prev) => !prev), []);
  useEffect(() => getController({ open, close, toggle }), [getController]);
  const handleClose = useCallback((e: MouseEvent) => {
    if (!(e.target instanceof HTMLElement)) return;
    if (e.target.id !== "background") return;
    close();
  }, []);

  const { state, result } = useAsync(
    async () => {
      if (closed) return;
      if (scrapbox.Layout !== "page") return;
      const [commit, page] = await Promise.all([
        getCommitHistory(
          scrapbox.Project.name,
          scrapbox.Page.id,
        ),
        getPageHistory(
          scrapbox.Project.name,
          scrapbox.Page.id,
        ),
      ]);
      return {
        /** 履歴連番 */
        range: [...page.range, ...commit.range],
        /** 履歴連番に対応するテキストを得る関数*/
        getSnapshot: (time: number): string[] => {
          // 範囲外ならpageHistoryから取得する
          if (!commit.range.includes(time)) {
            return page.pages.get(time)?.map?.((line) => line.text) ?? [];
          }

          return commit.history.flatMap(({ snapshots }) => {
            const line = snapshots.get(time);
            // lineが存在してtextが空なら、削除された行である
            if (line) return line.text === undefined ? [] : [line.text];

            // 一つ前の履歴を探し出す
            const prevUpdated = Math.max(
              ...[...snapshots.keys()].filter((updated) => updated < time),
            );
            if (prevUpdated === time) return [];
            const prevText = snapshots.get(prevUpdated)?.text;
            return prevText === undefined ? [] : [prevText];
          });
        },
      };
    },
    { range: [], getSnapshot: () => [] },
    1000,
    [closed],
  );

  // rangeが変更されたときだけsliderの位置をresetする
  const [max, setMax] = useState(0);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (state !== "resolved") return;
    const value = Math.max(0, result.range.length - 1);
    setMax(value);
    setIndex(value);
  }, [result]);

  const onSliderChange = useCallback(
    (event: h.JSX.TargetedEvent<HTMLInputElement>) =>
      setIndex(parseInt(event.currentTarget.value)),
    [],
  );

  return (
    <>
      <style>
        {'.modal{position:fixed;inset:0;z-index:1050;background-color:#000c;display:flex;flex-direction:column;align-items:center;row-gap:10px;padding:10px}.closed{display:none}.modal>*{color:var(--page-text-color, #4a4a4a);background-color:var(--page-bg, #fefefe);border:2px solid var(--body-bg, #dcdde0);border-radius:4px;padding:5px;width:calc(var(--item-width, 100%) - 10px)}@media (min-width: 768px){.modal{padding:30px}}.controller{display:flex;flex-direction:row-reverse;gap:.2em}input{width:100%}time{white-space:nowrap}.viewer{overflow-y:scroll}pre{width:100%;font-family:var(--history-slider-pre-font, Menlo,Monaco,Consolas,"Courier New",monospace);word-break:break-all;word-wrap:break-word;white-space:pre-wrap}'}
      </style>
      <div
        id="background"
        className={`modal${closed ? " closed" : ""}`}
        onClick={handleClose}
      >
        <div className="controller">
          <button className="close-button" onClick={close}>x</button>
          {state === "resolved" && result.range.length === 0 && (
            <span className="not-found">
              no history found.
            </span>
          )}
          {state !== "rejected" && result.range.length > 0 &&
            (
              <>
                <input
                  type="range"
                  max={max}
                  min="0"
                  step="1"
                  value={index}
                  title={lightFormat(
                    new Date(result.range[index] * 1000),
                    "yyyy-MM-dd HH:mm:ss",
                  )}
                  onInput={onSliderChange}
                />
                <time
                  dateTime={lightFormat(
                    new Date(result.range[index] * 1000),
                    "yyyy-MM-dd HH:mm:ss",
                  )}
                >
                  {lightFormat(
                    new Date(result.range[index] * 1000),
                    "yyyy-MM-dd HH:mm:ss",
                  )}
                </time>
              </>
            )}
        </div>
        {state !== "rejected"
          ? (
            <div className="viewer">
              <pre>
                    {result.getSnapshot(result.range[index]).join("\n")}
              </pre>
            </div>
          )
          : (
            <div className="error viewer">
              {`Error: ${JSON.stringify(result)}`}
            </div>
          )}
      </div>
    </>
  );
};
