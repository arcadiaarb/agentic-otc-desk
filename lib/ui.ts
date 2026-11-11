const base = "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
export const btnPrimary = `${base} bg-orange text-black hover:brightness-110`;
export const btnGhost = `${base} border border-line text-text hover:bg-surface`;
export const btnGreen = `${base} bg-green text-black hover:brightness-95`;
// Light-green "this is clickable" buttons that grow slightly on hover and press.
export const btnAction = "inline-flex items-center justify-center rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-black transition-[transform,filter] hover:scale-[1.03] hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50";
export const chipCls = "rounded-full bg-green px-4 py-2 text-sm font-medium text-black transition-[transform,filter] hover:scale-105 hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100";
export const fieldCls = "w-full rounded-xl border border-line bg-bg px-3.5 py-3 text-sm placeholder:text-muted/60";
