import { useCallback, useEffect, useState } from "./deps/preact.tsx";

/** 非同期函数の戻り値を取得する
 *
 * cf. https://log.pocka.io/ja/posts/typescript-promisetype/
 */
export type AsyncReturnType<
  T extends (...args: unknown[]) => PromiseLike<unknown>,
> = ReturnType<T> extends PromiseLike<infer P> ? P : never;

type Result<T> = { ok: true; value: T } | { ok: false; value: unknown };

export type AsyncState<T> = {
  state: "uninitialized" | "pending" | "resolved";
  result: T;
} | { state: "rejected"; result: unknown };

/** 非同期函数を実行するhooks
 *
 * @param callback 実行する非同期函数 `undefined`を返すと前回の結果を上書きせずそのまま返す
 * @param initialValue 初期値
 * @param [delay=0] 実行中判定を出すまでの許容時間(ms)
 * @param [deps=[]] 依存配列
 */
export const useAsync = <
  Fn extends () => PromiseLike<unknown>,
  T extends unknown,
>(
  callback: Fn,
  initialValue: Exclude<AsyncReturnType<Fn>, undefined>,
  delay = 0,
  deps: T[] = [],
): AsyncState<Exclude<AsyncReturnType<Fn>, undefined>> => {
  const [state, setState] = useState<"uninitialized" | "pending" | "resolved">(
    "uninitialized",
  );
  const [result, setResult] = useState<
    Result<Exclude<AsyncReturnType<Fn>, undefined>>
  >({ ok: true, value: initialValue });
  const cachedCallback = useCallback(callback, deps);

  useEffect(() => {
    (async () => {
      const timer = setTimeout(() => setState("pending"), delay);
      try {
        const result = (await cachedCallback()) as
          | Exclude<AsyncReturnType<Fn>, undefined>
          | undefined;
        if (result === undefined) return;
        setResult({ ok: true, value: result });
      } catch (e: unknown) {
        setResult({ ok: false, value: e });
      } finally {
        clearTimeout(timer);
        setState("resolved");
      }
    })();
  }, [cachedCallback, delay, ...deps]);

  return result.ok
    ? { result: result.value, state }
    : { result: result.value, state: "rejected" };
};
