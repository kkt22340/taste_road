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
import { purgeDemoContent } from "../lib/db";
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
  /** Map 버튼 재클릭/재진입 등: MapPage가 "내 위치로 이동"을 다시 수행하게 하는 트리거 */
  mapFocusSeq: number;
  focusMap: () => void;
};

const AppChromeContext = createContext<AppChromeContextValue | null>(null);

export function AppChromeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void purgeDemoContent();
  }, []);

  const navigate = useNavigate();
  const [scope, setScope] = useState<FeedScope>("only");
  const [regionSearchSeq, setRegionSearchSeq] = useState(0);
  const [pendingRegionQuery, setPendingRegionQuery] = useState<string | null>(
    null,
  );
  const [mapFocusSeq, setMapFocusSeq] = useState(0);

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

  const focusMap = useCallback(() => {
    setMapFocusSeq((n) => n + 1);
    navigate("/");
  }, [navigate]);

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
      mapFocusSeq,
      focusMap,
    }),
    [
      scope,
      regionSearchSeq,
      pendingRegionQuery,
      submitRegionSearch,
      clearPendingRegionQuery,
      mapFocusSeq,
      focusMap,
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
