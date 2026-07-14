interface LoadingStatesProps {
  stage: "fetching" | "analyzing" | "follow_up";
}

const labels = {
  fetching: "Grabbing public data…",
  analyzing: "Scoring what came back…",
  follow_up: "Looking at the memo…",
};

export function LoadingStates({ stage }: LoadingStatesProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-surface-border bg-surface-raised px-4 py-3 text-sm text-slate-300">
      <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      {labels[stage]}
    </div>
  );
}
