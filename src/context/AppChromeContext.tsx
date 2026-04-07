import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { ensureDemoSharedPins } from "../lib/db";
import type { FeedScope } from "../lib/feedScope";

type AppChromeContextValue = {
  scope: FeedScope;
  setScope: (s: FeedScope) => void;
  /** 지역 검색 제출 시 증가 — 동일 키워드 재검색에도 반응 */
  regionSearchSeq: number;
  /** MapPage가 소비할 때까지 유지되는 마지막 지역 검색어 */
  pendingRegionQuery: string | null;
  submitRegionSearch: (raw: string) => void;
  clearPendingRegionQuery: () => void;
};

const AppChromeContext = createContext<AppChromeContextValue | null>(null);

export function AppChromeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void ensureDemoSharedPins();
  }, []);

  const navigate = useNavigate();
  const [scope, setScope] = useState<FeedScope>("only");
  const [regionSearchSeq, setRegionSearchSeq] = useState(0);
  const [pendingRegionQuery, setPendingRegionQuery] = useState<string | null>(
    null,
  );

  const submitRegionSearch = useCallback(
    (raw: string) => {
      const q = raw.trim();
      if (!q) return;
      setPendingRegionQuery(q);
      setRegionSearchSeq((n) => n + 1);
      navigate("/");
    },
    [navigate],
  );

  const clearPendingRegionQuery = useCallback(() => {
    setPendingRegionQuery(null);
  }, []);

  const value = useMemo(
    () => ({
      scope,
      setScope,
      regionSearchSeq,
      pendingRegionQuery,
      submitRegionSearch,
      clearPendingRegionQuery,
    }),
    [
      scope,
      regionSearchSeq,
      pendingRegionQuery,
      submitRegionSearch,
      clearPendingRegionQuery,
    ],
  );

  return (
    <AppChromeContext.Provider value={value}>{children}</AppChromeContext.Provider>
  );
}

export function useAppChrome() {
  const ctx = useContext(AppChromeContext);
  if (!ctx) throw new Error("useAppChrome: missing AppChromeProvider");
  return ctx;
}
