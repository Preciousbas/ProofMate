import { PRODUCT_NAME } from "@/lib/constants";

type LogoTone = "onDark" | "onLight";
type LogoSize = "sm" | "md" | "lg";

const SIZE: Record<
  LogoSize,
  { mark: number; text: string; gap: string }
> = {
  sm: { mark: 22, text: "text-base font-semibold", gap: "gap-2" },
  md: { mark: 28, text: "text-xl font-semibold", gap: "gap-2.5" },
  lg: { mark: 36, text: "text-3xl font-bold md:text-4xl", gap: "gap-3" },
};

/** Ledger-bars mark — CSS variables adapt with tone / parent. */
export function LogoMark({
  className = "",
  size = 28,
  tone = "onDark",
  title,
}: {
  className?: string;
  size?: number;
  tone?: LogoTone;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      className={`logo-mark shrink-0 ${className}`}
      data-tone={tone}
    >
      {title ? <title>{title}</title> : null}
      <rect
        x="0"
        y="0"
        width="48"
        height="48"
        rx="8"
        className="logo-plate"
      />
      <rect x="8" y="11" width="30" height="5" rx="1.2" className="logo-bar-1" />
      <rect x="8" y="21" width="23" height="5" rx="1.2" className="logo-bar-2" />
      <rect x="8" y="31" width="15" height="5" rx="1.2" className="logo-bar-3" />
      <rect x="37" y="11" width="2.5" height="25" rx="0.8" className="logo-bar-1" />
    </svg>
  );
}

/** Mark + wordmark lockup (ledger-bars). Wordmark follows surrounding text color. */
export function Logo({
  className = "",
  tone = "onDark",
  size = "md",
  wordmark = true,
}: {
  className?: string;
  tone?: LogoTone;
  size?: LogoSize;
  wordmark?: boolean;
}) {
  const s = SIZE[size];

  return (
    <span
      className={`logo-lockup inline-flex items-center ${s.gap} ${className}`}
      data-tone={tone}
      aria-label={PRODUCT_NAME}
    >
      <LogoMark size={s.mark} tone={tone} />
      {wordmark ? (
        <span
          className={`logo-wordmark tracking-tight text-current ${s.text}`}
          aria-hidden="true"
        >
          {PRODUCT_NAME}
        </span>
      ) : null}
    </span>
  );
}
