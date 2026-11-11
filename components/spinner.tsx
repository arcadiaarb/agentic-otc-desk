// Orange rolling circle. `tone="dark"` is for use on top of orange or green buttons.
export function Spinner({ className = "size-5", tone = "orange", label = "Loading", decorative = false }: {
  className?: string; tone?: "orange" | "dark"; label?: string; decorative?: boolean;
}) {
  const color = tone === "orange" ? "border-orange/25 border-t-orange" : "border-black/25 border-t-black";
  return (
    <span
      className={`spinner inline-block shrink-0 rounded-full border-2 ${color} ${className}`}
      {...(decorative ? { "aria-hidden": true } : { role: "status", "aria-label": label })}
    />
  );
}

// Centered spinner for whole-page loading states.
export function PageSpinner() {
  return <div className="flex justify-center py-20"><Spinner className="size-9 border-[3px]" /></div>;
}

// Spinner + short text inside a button.
export function BusyText({ text, tone = "dark" }: { text: string; tone?: "orange" | "dark" }) {
  return <span className="inline-flex items-center gap-2"><Spinner decorative tone={tone} className="size-4" />{text}</span>;
}
