import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2, UserPlus } from "lucide-react";
import { useRequiredProfile } from "../auth/ProfileContext";
import { useToast } from "../components/Toast";
import { useChatData } from "../chat/ChatDataContext";
import { ChatHeader, ChatSearchBar } from "../chat/ChatHeader";
import { Composer } from "../chat/Composer";
import { ConversationList } from "../chat/ConversationList";
import { MessageList } from "../chat/MessageList";
import { findMatches } from "../chat/search";
import { useConversation } from "../chat/useConversation";
import { useLiveHub } from "../live/LiveHub";
import { useTypingSender } from "../live/useTypingSender";
import { isOnline } from "../lib/time";
import type { Person } from "../lib/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ChatPanel({ partner, meId }: { partner: Person; meId: string }) {
  const chat = useChatData();
  const toast = useToast();
  const live = useLiveHub();
  const convo = useConversation(partner.id, meId);
  const reportTyping = useTypingSender(partner.id);
  const isContact = chat.contacts.some((c) => c.id === partner.id);
  const online = isOnline(partner.last_seen_at, chat.now);
  const [adding, setAdding] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const matches = useMemo(
    () => (searchOpen ? findMatches(convo.messages, query) : []),
    [searchOpen, convo.messages, query],
  );
  const { loadAll } = convo;

  // Searching looks through the whole history, so fetch the older pages first.
  useEffect(() => {
    if (searchOpen) void loadAll();
  }, [searchOpen, loadAll]);

  // A new search starts at the newest match.
  useEffect(() => setActive(Math.max(0, matches.length - 1)), [query]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => setActive((i) => Math.min(i, Math.max(0, matches.length - 1))),
    [matches.length],
  );

  const step = (dir: 1 | -1) =>
    matches.length &&
    setActive((i) => (i + dir + matches.length) % matches.length);
  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };

  async function addToContacts() {
    setAdding(true);
    try {
      await chat.addContact(partner.id);
      toast.show({
        title: "Friend added successfully!",
        message: `${partner.display_name} has been added to your contacts.`,
      });
    } catch (e) {
      toast.show({
        tone: "error",
        title: "Could not add contact",
        message: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setAdding(false);
    }
  }

  async function removeFromContacts() {
    try {
      await chat.removeContact(partner.id);
      toast.show({
        title: "Contact removed",
        message: `${partner.display_name} was removed from your contacts.`,
      });
    } catch (e) {
      toast.show({
        tone: "error",
        title: "Could not remove contact",
        message: e instanceof Error ? e.message : "Please try again.",
      });
      throw e;
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChatHeader
        partner={partner}
        isContact={isContact}
        online={online}
        now={chat.now}
        typing={isContact && live.isTyping(partner.id)}
        searchOpen={searchOpen}
        onToggleSearch={() =>
          searchOpen ? closeSearch() : setSearchOpen(true)
        }
        onAddContact={addToContacts}
        onRemoveContact={removeFromContacts}
      />
      {searchOpen && (
        <ChatSearchBar
          query={query}
          onQuery={setQuery}
          total={matches.length}
          index={matches.length ? active : -1}
          loading={convo.loadingOlder}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onClose={closeSearch}
        />
      )}

      <MessageList
        messages={convo.messages}
        pending={convo.pending}
        meId={meId}
        loading={convo.loading}
        hasMore={convo.hasMore}
        loadingOlder={convo.loadingOlder}
        error={convo.error}
        onLoadOlder={convo.loadOlder}
        onRetry={(id) => void convo.retry(id)}
        onDiscard={convo.discard}
        onReload={convo.reload}
        typing={
          isContact && live.isTyping(partner.id) ? partner.display_name : null
        }
        query={searchOpen ? query : ""}
        activeId={matches[active] ?? null}
      />

      {!isContact && (
        <div className="flex flex-wrap items-center gap-3 border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="min-w-0 flex-1">
            {partner.display_name} is not in your contacts. Add them to reply.
          </span>
          <button
            type="button"
            onClick={() => void addToContacts()}
            disabled={adding}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {adding ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <UserPlus aria-hidden className="size-4" />
            )}
            Add Friend
          </button>
        </div>
      )}

      <Composer
        disabled={!isContact}
        disabledReason="You can reply once this person is in your contacts."
        onSend={(body, file) => void convo.send(body, file)}
        onTyping={reportTyping}
      />
    </div>
  );
}

export default function ChatPage() {
  const { partnerId = "" } = useParams();
  const me = useRequiredProfile();
  const chat = useChatData();
  const { getPerson, loadPerson, setActivePartner } = chat;
  const valid = UUID_RE.test(partnerId);
  const person = valid ? getPerson(partnerId) : null;
  const [missing, setMissing] = useState(false);

  // Lets the data layer know which chat is open, so it does not count its messages as unread.
  useEffect(() => {
    if (!valid) return;
    setActivePartner(partnerId);
    return () => setActivePartner(null);
  }, [valid, partnerId, setActivePartner]);

  // A person we do not know yet (for example a deep link): ask the database whether we may see them.
  useEffect(() => {
    setMissing(false);
    if (!valid || person || chat.loading) return;
    let live = true;
    void loadPerson(partnerId).then((p) => {
      if (live && !p) setMissing(true);
    });
    return () => {
      live = false;
    };
  }, [partnerId, valid, person, chat.loading, loadPerson]);

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-80 shrink-0 border-r border-slate-200 bg-white lg:block">
        <ConversationList activeId={partnerId} />
      </aside>
      <section className="min-w-0 flex-1 bg-white">
        {person ? (
          <ChatPanel key={partnerId} partner={person} meId={me.id} />
        ) : !valid || missing ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                Chat not found
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                This conversation does not exist, or you do not have access to
                it.
              </p>
              <Link
                to="/app"
                className="mt-4 inline-flex h-10 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white"
              >
                Back to chats
              </Link>
            </div>
          </div>
        ) : (
          <div
            role="status"
            aria-label="Loading chat"
            className="grid h-full place-items-center text-fuchsia-500"
          >
            <Loader2 aria-hidden className="size-6 animate-spin" />
          </div>
        )}
      </section>
    </div>
  );
}
