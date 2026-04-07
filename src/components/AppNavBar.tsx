import { useEffect, useMemo, useState, type FormEvent } from "react";
import { NavLink } from "react-router-dom";
import { useAppChrome } from "../context/AppChromeContext";
import { getProfile } from "../features/profile/profile";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "inline-flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-full px-2.5 text-sm font-medium transition-colors sm:px-3",
    isActive
      ? "bg-sky-100 text-sky-900 shadow-sm shadow-sky-900/5"
      : "text-slate-600 active:bg-slate-200/60 hover:bg-slate-100/90 hover:text-slate-900",
  ].join(" ");

export function AppNavBar() {
  const { submitRegionSearch, focusMap } = useAppChrome();
  const [q, setQ] = useState("");
  const [nick, setNick] = useState<string | null>(null);

  useEffect(() => {
    setNick(getProfile().nickname ?? null);
    const onStorage = () => setNick(getProfile().nickname ?? null);
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const initial = useMemo(() => {
    const s = (nick ?? "").trim();
    return s ? s.slice(0, 1).toUpperCase() : "·";
  }, [nick]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    submitRegionSearch(q);
  };

  return (
    <nav
      className="relative z-[1001] flex min-h-[52px] shrink-0 items-center gap-2 border-b border-slate-200/80 bg-white/75 px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] shadow-[0_1px_0_0_rgba(15,23,42,0.04)] backdrop-blur-xl sm:gap-3 sm:px-4"
      aria-label="Main"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 sm:gap-1">
        <NavLink
          className={navLinkClass}
          to="/"
          end
          onClick={() => focusMap()}
        >
          Map
        </NavLink>
        <NavLink className={navLinkClass} to="/feed">
          Feed
        </NavLink>
      </div>

      <form
        onSubmit={onSearch}
        className="pointer-events-auto absolute left-1/2 top-1/2 z-[2] flex w-[min(100%-8rem,14rem)] max-w-[220px] -translate-x-1/2 -translate-y-1/2 sm:w-[min(100%-12rem,16rem)] sm:max-w-xs"
      >
        <label className="sr-only" htmlFor="region-search">
          Search area
        </label>
        <input
          id="region-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search area"
          autoComplete="off"
          className="h-9 w-full rounded-full border border-slate-200 bg-white/95 px-3 text-center text-xs text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/25 sm:text-sm"
        />
      </form>

      <div className="ml-auto flex shrink-0 items-center">
        <NavLink
          to="/me"
          className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200/90 bg-white/90 text-sm font-semibold text-slate-800 shadow-sm active:scale-95"
          aria-label="My page"
          title={nick ? `@${nick}` : "My page"}
        >
          {initial}
        </NavLink>
      </div>
    </nav>
  );
}
