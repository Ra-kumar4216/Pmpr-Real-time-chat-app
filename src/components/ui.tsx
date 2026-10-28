import {
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  type LucideIcon,
} from "lucide-react";
import { passwordStrength } from "../auth/validation";
import logoIcon from "../assets/logo-icon.png";

export function Spinner({ className = "size-4" }: { className?: string }) {
  return <Loader2 aria-hidden className={`${className} animate-spin`} />;
}

export function FullScreenSpinner() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="grid min-h-dvh place-items-center bg-surface text-brand-magenta"
    >
      <Spinner className="size-7" />
    </div>
  );
}

/** The app logo: two overlapping chat bubbles (src/assets/logo-icon.png). Decorative, the wordmark names the app. */
export function Logo({ className = "size-11" }: { className?: string }) {
  return (
    <img
      src={logoIcon}
      alt=""
      aria-hidden
      width={256}
      height={256}
      className={`${className} shrink-0 object-contain drop-shadow-lg`}
    />
  );
}

export function Wordmark({
  light = false,
  className = "text-xl",
}: {
  light?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`${className} font-bold tracking-tight ${light ? "text-white" : "text-brand"}`}
    >
      PrivateChat
    </span>
  );
}

type FieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "id" | "className"
> & {
  id: string;
  label: string;
  icon: LucideIcon;
  error?: string | null;
  hint?: string;
  below?: ReactNode;
  trailing?: ReactNode;
  onValueChange: (value: string) => void;
};

export function TextField({
  id,
  label,
  icon: Icon,
  error,
  hint,
  below,
  trailing,
  onValueChange,
  ...input
}: FieldProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>
      <div className="relative">
        <Icon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-slate-400"
        />
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onValueChange(e.target.value)}
          className={`h-11 w-full rounded-xl border bg-white pl-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-4 ${
            trailing ? "pr-11" : "pr-3"
          } ${
            error
              ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
              : "border-slate-200 hover:border-slate-300 focus:border-fuchsia-400 focus:ring-fuchsia-100"
          }`}
          {...input}
        />
        {trailing && (
          <div className="absolute top-1/2 right-1.5 -translate-y-1/2">
            {trailing}
          </div>
        )}
      </div>
      {below}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1.5 text-xs text-rose-600"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function PasswordField(
  props: Omit<FieldProps, "type" | "icon" | "trailing">,
) {
  const [show, setShow] = useState(false);
  return (
    <TextField
      {...props}
      type={show ? "text" : "password"}
      icon={Lock}
      trailing={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-fuchsia-50 hover:text-fuchsia-700 focus-visible:outline-2 focus-visible:outline-fuchsia-500"
        >
          {show ? (
            <EyeOff className="size-4.5" />
          ) : (
            <Eye className="size-4.5" />
          )}
        </button>
      }
    />
  );
}

export function PasswordMeter({ value }: { value: string }) {
  if (!value) return null;
  const { score, label } = passwordStrength(value);
  const colors = [
    "bg-rose-400",
    "bg-rose-400",
    "bg-orange-400",
    "bg-fuchsia-400",
    "bg-emerald-500",
  ];
  return (
    <div className="mt-2 flex items-center gap-3" aria-live="polite">
      <div aria-hidden className="flex flex-1 gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i <= score ? colors[score] : "bg-slate-200"}`}
          />
        ))}
      </div>
      <span className="w-16 text-right text-xs font-medium text-slate-500">
        {label}
      </span>
    </div>
  );
}

export function PrimaryButton({
  loading = false,
  disabled,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-cta transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function GoogleButton({
  loading,
  disabled,
  onClick,
}: {
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  // Neutral "G" badge on purpose. Swap in Google's official button asset per their branding guidelines before launch.
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-fuchsia-200 hover:bg-fuchsia-50/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? (
        <Spinner className="size-5" />
      ) : (
        <span
          aria-hidden
          className="grid size-5 place-items-center rounded-full border border-slate-300 text-[11px] font-bold text-slate-600"
        >
          G
        </span>
      )}
      Continue with Google
    </button>
  );
}

export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
      <span className="h-px flex-1 bg-slate-200" />
      or
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700"
    >
      <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
