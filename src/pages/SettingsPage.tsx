import { useRef, useState, type FormEvent } from "react";
import { Bell, Camera, LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useRequiredProfile, useProfile } from "../auth/ProfileContext";
import { Avatar } from "../components/Avatar";
import { CopyButton } from "../components/CopyButton";
import { useToast } from "../components/Toast";
import { PrimaryButton, TextField } from "../components/ui";
import { ACCEPT_IMAGES } from "../lib/image";
import {
  enableNotifications,
  notifyState,
  type NotifyState,
} from "../lib/notify";
import { useAvatarUpload } from "../lib/useAvatarUpload";

const NAME_MAX = 50;

export default function SettingsPage() {
  const me = useRequiredProfile();
  const { save } = useProfile();
  const { user, signOut } = useAuth();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(me.display_name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notify, setNotify] = useState<NotifyState>(notifyState);

  const avatar = useAvatarUpload({
    userId: me.id,
    currentPath: me.avatar_path,
    onUploaded: async (path) => {
      await save({ avatarPath: path });
      toast.show({ title: "Photo updated" });
    },
  });

  const trimmed = name.trim();
  const nameError =
    trimmed.length === 0
      ? "Enter a display name"
      : trimmed.length > NAME_MAX
        ? `Use ${NAME_MAX} characters or fewer`
        : null;
  const dirty = trimmed !== me.display_name;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (nameError || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      await save({ displayName: trimmed });
      toast.show({ title: "Profile saved" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
      <h1 className="text-lg font-semibold text-slate-900">Settings</h1>

      <section
        className="rounded-3xl bg-white p-6 shadow-card"
        aria-label="Profile"
      >
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={avatar.busy}
            aria-label="Change profile photo"
            className="relative rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-500"
          >
            <Avatar
              name={me.display_name}
              path={me.avatar_path}
              src={avatar.preview}
              size="xl"
            />
            <span className="absolute right-0 bottom-0 grid size-8 place-items-center rounded-full bg-brand text-white ring-2 ring-white">
              <Camera aria-hidden className="size-4" />
            </span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT_IMAGES}
            className="hidden"
            data-testid="avatar-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              void avatar.pick(f);
            }}
          />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-slate-900">
              {me.display_name}
            </p>
            <p className="truncate text-sm text-slate-500">{user?.email}</p>
            <p className="mt-1 text-xs text-slate-500" aria-live="polite">
              {avatar.busy ? "Uploading photo…" : "JPG, PNG or WebP"}
            </p>
          </div>
        </div>
        {avatar.error && (
          <p role="alert" className="mt-3 text-sm text-rose-600">
            {avatar.error}
          </p>
        )}

        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
          <TextField
            id="settings-name"
            label="Display name"
            icon={UserIcon}
            value={name}
            maxLength={NAME_MAX + 10}
            onValueChange={setName}
            error={nameError}
          />
          {error && (
            <p role="alert" className="text-sm text-rose-600">
              {error}
            </p>
          )}
          <PrimaryButton
            loading={saving}
            disabled={!dirty || Boolean(nameError)}
          >
            Save changes
          </PrimaryButton>
        </form>
      </section>

      <section
        className="rounded-3xl bg-white p-6 shadow-card"
        aria-label="Your User ID"
      >
        <h2 className="text-sm font-semibold text-slate-700">Your User ID</h2>
        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
          <span
            className="min-w-0 truncate font-mono text-sm text-slate-900"
            data-testid="user-id"
          >
            {me.user_id}
          </span>
          <CopyButton text={me.user_id} />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Share this so friends can add you. It cannot be changed.
        </p>
      </section>

      <section
        className="rounded-3xl bg-white p-6 shadow-card"
        aria-label="Notifications"
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Bell aria-hidden className="size-4" />
          Notifications
        </h2>
        <p className="mt-2 text-sm text-slate-600" data-testid="notify-status">
          {notify === "granted" &&
            "On. You get an alert for new messages and incoming calls when PrivateChat is open in the background."}
          {notify === "default" &&
            "Get an alert for new messages and incoming calls while PrivateChat is open in another tab or window."}
          {notify === "denied" &&
            "Blocked. Allow notifications for this site in your browser settings, then reload."}
          {notify === "unsupported" &&
            "This browser does not support notifications."}
        </p>
        {notify === "default" && (
          <button
            type="button"
            onClick={() => void enableNotifications().then(setNotify)}
            className="mt-3 inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-cta hover:brightness-110"
          >
            Turn on notifications
          </button>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Alerts need the app to stay open. They cannot reach you after you
          close it.
        </p>
      </section>

      <button
        type="button"
        onClick={() => void signOut()}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <LogOut aria-hidden className="size-4.5" />
        Log out
      </button>
    </div>
  );
}
