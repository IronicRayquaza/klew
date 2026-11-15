import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { IconArrowRight, IconCheck, IconX } from "./Icons";

/** "Use your own repo": explains it's coming with team graphs and collects a waitlist sign-up. */
export function WaitlistModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [website, setWebsite] = useState(""); // honeypot, hidden from people
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(email.trim())) {
      setError("Please enter your name and a valid email address.");
      return;
    }
    setState("sending");
    try {
      await api.waitlist({ name: name.trim(), email: email.trim(), repo_url: repoUrl.trim(), website });
      setState("done");
    } catch (err) {
      setError((err as Error).message || "Something went wrong. Please try again.");
      setState("idle");
    }
  }

  const field =
    "w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/15 p-4 backdrop-blur-xs"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="waitlist-title"
        onClick={(e) => e.stopPropagation()}
        className="surface-card animate-modal-in w-[min(92vw,30rem)] p-6 sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="font-mono text-xs uppercase tracking-wider text-muted">Team graphs · coming soon</span>
            <h2 id="waitlist-title" className="mt-1 font-display text-2xl font-semibold text-ink">
              Use Klew on your repo
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn-soft flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-paper text-muted hover:text-ink"
          >
            <IconX size={14} />
          </button>
        </div>

        {state === "done" ? (
          <div className="mt-6 grid gap-3" role="status">
            <div className="flex items-center gap-2.5 font-medium text-moss">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-moss-soft">
                <IconCheck size={14} />
              </span>
              You're on the list.
            </div>
            <p className="text-sm leading-relaxed text-muted">
              Thanks, {name.trim().split(" ")[0]}. We'll email you when you can connect your repository. In the
              meantime you can run Klew on any repo locally: <code className="font-mono text-xs text-ink">pip install klew</code>.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="btn-soft mt-2 justify-self-start rounded-full bg-ink px-5 py-2.5 text-xs font-medium text-paper"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 grid gap-3" noValidate>
            <p className="text-sm leading-relaxed text-muted">
              Today the Playground runs on the httpx and flask graphs. Using Klew on your own repository comes with team
              graphs: one learned graph per repo, shared by your whole team. Join the waitlist and we'll reach out.
            </p>
            <label className="grid gap-1.5">
              <span className="font-mono text-[11px] text-muted">Name</span>
              <input ref={first} className={field} value={name} onChange={(e) => setName(e.target.value)}
                     autoComplete="name" maxLength={120} required />
            </label>
            <label className="grid gap-1.5">
              <span className="font-mono text-[11px] text-muted">Email</span>
              <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                     autoComplete="email" maxLength={254} required />
            </label>
            <label className="grid gap-1.5">
              <span className="font-mono text-[11px] text-muted">Repository link (optional)</span>
              <input className={field} value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)}
                     placeholder="github.com/you/your-repo" maxLength={300} />
            </label>
            {/* Honeypot: invisible to people, filled in by bots. */}
            <input
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
              name="website"
            />
            {error && (
              <p className="rounded-xl border border-line bg-paper px-3.5 py-2 text-xs text-ink" role="alert">
                {error}
              </p>
            )}
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="text-[11px] leading-snug text-muted">We only use this to contact you about Klew.</span>
              <button
                type="submit"
                disabled={state === "sending"}
                className="btn-soft inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-xs font-medium text-paper disabled:opacity-50"
              >
                <span>{state === "sending" ? "Joining…" : "Join the waitlist"}</span>
                {state !== "sending" && <IconArrowRight size={13} />}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
