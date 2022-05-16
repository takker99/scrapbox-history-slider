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

export type Controller = (
  open: () => void,
  close: () => void,
) => (void | (() => void));

export const setup = (controller: Controller) => {
  const app = document.createElement("div");
  app.dataset.userscriptName = "takker99/scrapbox-history-slider";
  const shadowRoot = app.attachShadow({ mode: "open" });
  document.body.append(app);
  render(<App controller={controller} />, shadowRoot);
};

interface Props {
  controller: Controller;
}

const App = ({ controller }: Props) => {
  const [closed, setClosed] = useState(true);
  const open = useCallback(() => setClosed(false), []);
  const close = useCallback(() => setClosed(true), []);
  useEffect(() => controller(open, close), [controller]);

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
        {':host{color:var(--page-text-color, #4a4a4a)}.background{position:fixed;inset:0;outline:0;background-color:#000;opacity:.8;z-index:1040}.content{position:fixed;inset:0;outline:0;z-index:1050}.modal{position:relative;width:80vw;margin:10px auto;max-height:calc(100vh - 20px);display:flex;flex-direction:column}@media (min-width: 768px){.modal{margin:30px auto;max-height:calc(100vh - 60px)}}.container{width:100%;padding:5px;background-color:var(--page-bg, #fefefe);border-radius:4px;border:2px solid var(--body-bg, #dcdde0)}.modal>*{margin:.5em 0}.controller{display:flex;align-content:center}.controller>*{margin:auto 2px}input,.not-found{width:100%}.viewer{overflow-y:auto;overflow-x:hidden}pre{width:100%;font-family:var(--history-slider-pre-font, Menlo,Monaco,Consolas,"Courier New",monospace);word-break:break-all;word-wrap:break-word;white-space:pre-wrap}'}
      </style>
      <div style={{ display: closed ? "none" : "block" }}>
        <div className="background" onClick={close} />
        <div className="content">
          <div className="modal">
            <div className="controller container">
              {state === "resolved" && result.range.length === 0 && (
                <span className="not-found">
                  no history found.
                </span>
              )}
              {state !== "rejected" && result.range.length > 0 &&
                (
                  <>
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
                  </>
                )}
              <button className="close-button" onClick={close}>x</button>
            </div>
            {state !== "rejected"
              ? (
                <div className="viewer container">
                  <pre>
                    {result.getSnapshot(result.range[index]).join("\n")}
                  </pre>
                </div>
              )
              : (
                <div className="error container">
                  {`Error: ${JSON.stringify(result)}`}
                </div>
              )}
          </div>
        </div>
      </div>
    </>
  );
};
