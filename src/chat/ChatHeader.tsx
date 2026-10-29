import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  MoreVertical,
  Phone,
  Search,
  User,
  UserMinus,
  UserPlus,
  Video,
  X,
} from "lucide-react";
import { useCall } from "../calls/CallProvider";
import { Avatar } from "../components/Avatar";
import { CopyButton } from "../components/CopyButton";
import { Modal } from "../components/Modal";
import { formatLastSeen } from "../lib/time";
import type { Person } from "../lib/types";

const iconBtn =
  "grid size-10 shrink-0 place-items-center rounded-full text-slate-600 transition hover:bg-fuchsia-50 hover:text-fuchsia-700 focus-visible:outline-2 focus-visible:outline-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-600";

interface HeaderProps {
  partner: Person;
  isContact: boolean;
  online: boolean;
  now: number;
  typing: boolean;
  searchOpen: boolean;
  onToggleSearch: () => void;
  onAddContact: () => Promise<void>;
  onRemoveContact: () => Promise<void>;
}

export function ChatHeader({
  partner,
  isContact,
  online,
  now,
  typing,
  searchOpen,
  onToggleSearch,
  onAddContact,
  onRemoveContact,
}: HeaderProps) {
  const { call, start } = useCall();
  const [menu, setMenu] = useState(false);
  const [profile, setProfile] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const down = (e: MouseEvent) => {
      if (menuBox.current && !menuBox.current.contains(e.target as Node))
        setMenu(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [menu]);

  const callBlocked = !isContact
    ? "Add this person to your contacts to call them"
    : call.phase !== "idle"
      ? "You are already on a call"
      : null;

  async function remove() {
    setBusy(true);
    try {
      await onRemoveContact();
      setConfirmRemove(false);
    } finally {
      setBusy(false);
    }
  }

  const item =
    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50";

  return (
    <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-3 sm:px-5">
      <Link
        to="/app"
        aria-label="Back to chats"
        className="grid size-9 shrink-0 place-items-center rounded-full text-slate-600 hover:bg-slate-100 lg:hidden"
      >
        <ArrowLeft aria-hidden className="size-5" />
      </Link>
      <button
        type="button"
        onClick={() => setProfile(true)}
        aria-label={`View ${partner.display_name}'s profile`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-fuchsia-500"
      >
        <Avatar
          name={partner.display_name}
          path={partner.avatar_path}
          online={online}
        />
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold text-slate-900">
            {partner.display_name}
          </span>
          <span
            aria-live="polite"
            className={`block truncate text-xs ${typing ? "font-medium text-fuchsia-600" : online ? "text-emerald-600" : "text-slate-500"}`}
            data-testid="chat-status"
          >
            {typing ? (
              "typing…"
            ) : (
              <>
                {formatLastSeen(partner.last_seen_at, now)}
                <span className="text-slate-400"> · @{partner.user_id}</span>
              </>
            )}
          </span>
        </span>
      </button>

      <div className="flex items-center">
        <button
          type="button"
          onClick={() => void start(partner, true)}
          disabled={callBlocked !== null}
          title={callBlocked ?? "Video call"}
          aria-label="Start video call"
          className={iconBtn}
        >
          <Video aria-hidden className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => void start(partner, false)}
          disabled={callBlocked !== null}
          title={callBlocked ?? "Voice call"}
          aria-label="Start voice call"
          className={iconBtn}
        >
          <Phone aria-hidden className="size-5" />
        </button>
        <button
          type="button"
          onClick={onToggleSearch}
          aria-pressed={searchOpen}
          aria-label="Search in chat"
          title="Search in chat"
          className={`${iconBtn} ${searchOpen ? "bg-fuchsia-50 text-fuchsia-700" : ""}`}
        >
          <Search aria-hidden className="size-5" />
        </button>
        <div ref={menuBox} className="relative">
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-label="More options"
            className={iconBtn}
          >
            <MoreVertical aria-hidden className="size-5" />
          </button>
          {menu && (
            <div
              role="menu"
              className="absolute right-0 z-30 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-card"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  setProfile(true);
                }}
                className={`${item} text-slate-700`}
              >
                <User aria-hidden className="size-4" />
                View profile
              </button>
              {isContact ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    setConfirmRemove(true);
                  }}
                  className={`${item} text-rose-600 hover:bg-rose-50`}
                >
                  <UserMinus aria-hidden className="size-4" />
                  Remove contact
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    void onAddContact();
                  }}
                  className={`${item} text-fuchsia-700`}
                >
                  <UserPlus aria-hidden className="size-4" />
                  Add friend
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal open={profile} onClose={() => setProfile(false)} title="Profile">
        <div className="text-center">
          <div className="flex justify-center">
            <Avatar
              name={partner.display_name}
              path={partner.avatar_path}
              size="xl"
              online={online}
            />
          </div>
          <p className="mt-3 text-lg font-semibold text-slate-900">
            {partner.display_name}
          </p>
          <p
            className={`text-sm ${online ? "text-emerald-600" : "text-slate-500"}`}
          >
            {formatLastSeen(partner.last_seen_at, now)}
          </p>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left">
            <span className="min-w-0 truncate font-mono text-sm text-slate-900">
              {partner.user_id}
            </span>
            <CopyButton text={partner.user_id} />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {isContact ? "Saved in your contacts" : "Not in your contacts"}
          </p>
          <button
            type="button"
            onClick={() => setProfile(false)}
            className="mt-5 h-10 w-full rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </Modal>

      <Modal
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Remove contact?"
      >
        <p className="text-sm text-slate-600">
          {partner.display_name} will be removed from your saved contacts. Past
          messages stay, but you cannot send new ones or call until you add them
          again.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => setConfirmRemove(false)}
            className="h-10 flex-1 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="h-10 flex-1 rounded-xl bg-rose-600 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
          >
            Remove
          </button>
        </div>
      </Modal>
    </header>
  );
}

interface SearchProps {
  query: string;
  onQuery: (q: string) => void;
  total: number;
  /** Zero-based index of the match being shown, or -1. */
  index: number;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

export function ChatSearchBar({
  query,
  onQuery,
  total,
  index,
  loading,
  onPrev,
  onNext,
  onClose,
}: SearchProps): ReactNode {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const hasQuery = query.trim().length > 0;

  return (
    <div
      role="search"
      className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:px-5"
    >
      <Search aria-hidden className="size-4 shrink-0 text-slate-400" />
      <label htmlFor="chat-search" className="sr-only">
        Search messages
      </label>
      <input
        ref={input}
        id="chat-search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) onPrev();
            else onNext();
          } else if (e.key === "Escape") {
            onClose();
          }
        }}
        placeholder="Search in this chat…"
        autoComplete="off"
        className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-fuchsia-400 focus:ring-4 focus:ring-fuchsia-100"
      />
      <span
        aria-live="polite"
        data-testid="search-count"
        className="shrink-0 text-xs whitespace-nowrap text-slate-500"
      >
        {loading ? (
          <Loader2
            aria-label="Loading older messages"
            className="size-4 animate-spin"
          />
        ) : hasQuery ? (
          total ? (
            `${index + 1} of ${total}`
          ) : (
            "No matches"
          )
        ) : (
          ""
        )}
      </span>
      <button
        type="button"
        onClick={onPrev}
        disabled={total === 0}
        aria-label="Previous match"
        className="grid size-8 place-items-center rounded-full text-slate-500 hover:bg-white disabled:opacity-40"
      >
        <ChevronUp aria-hidden className="size-4" />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={total === 0}
        aria-label="Next match"
        className="grid size-8 place-items-center rounded-full text-slate-500 hover:bg-white disabled:opacity-40"
      >
        <ChevronDown aria-hidden className="size-4" />
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close search"
        className="grid size-8 place-items-center rounded-full text-slate-500 hover:bg-white"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
