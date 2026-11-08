import Link from "next/link";
import { CreateIntentButton } from "@/components/create-intent-dialog";
import { IntentCard } from "@/components/intent-card";
import { btnGhost, btnGreen } from "@/lib/ui";

export default function Home() {
  return (
    <section className="grid items-center gap-14 pt-12 lg:grid-cols-[1.2fr_1fr] lg:pt-24">
      <div>
        <h1 className="font-display text-4xl font-medium leading-[1.15] tracking-tight sm:text-5xl">
          List a trade. Keep the numbers to yourself.
        </h1>
        <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
          Tacet is a private desk for large over-the-counter trades on NEAR. Buyers see the pair and the size range. Your exact amount and price stay sealed while you negotiate.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <CreateIntentButton />
          <Link href="/create" className={btnGreen}>Create intent with AI</Link>
          <Link href="/intents" className={btnGhost}>View Intent</Link>
        </div>
      </div>
      <div>
        <p className="mb-3 text-sm text-muted">What buyers see</p>
        <IntentCard intent={{ id: "e4d7b2", pair: "NEAR / USDC", size: "$100k – $1M", commitment: "9f3a7c1e5b20d84a6c7e", expiresLabel: "24 hr" }} />
      </div>
    </section>
  );
}
