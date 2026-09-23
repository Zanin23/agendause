import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CalendarPlus,
  FileCheck2,
  ClipboardList,
  Receipt,
  StickyNote,
  ArrowUpRight,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { CreateTrainingDialog } from "@/components/CreateTrainingDialog";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { TodayVisitsCard } from "@/components/TodayVisitsCard";

type Tile = {
  to?: string;
  onClick?: () => void;
  label: string;
  hint: string;
  icon: LucideIcon;
  span: string;
};

type Spark = { id: number; x: number; y: number; dx: number; dy: number };

const HomeExperimental = () => {
  const { user } = useAuth();
  const { active } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const heroRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const sparkId = useRef(0);

  // clock ticking every second (seconds visible, so it must be 1s)
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // scroll progress bar
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(h > 0 ? Math.min(1, window.scrollY / h) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // cursor spotlight
  useEffect(() => {
    const onMove = (e: MouseEvent) => setCursor({ x: e.clientX, y: e.clientY });
    const onLeave = () => setCursor(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  const rawName: string | undefined = user?.user_metadata?.full_name;
  const firstName = rawName ? rawName.split(" ")[0] : "";
  const hour = now.getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  // typewriter for the outlined name line
  const target = (firstName || "equipe").toUpperCase();
  const [typed, setTyped] = useState("");
  useEffect(() => {
    setTyped("");
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setTyped(target.slice(0, i));
      if (i >= target.length) clearInterval(id);
    }, 90);
    return () => clearInterval(id);
  }, [target]);

  const spawnSparks = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const x = e.clientX;
    const y = e.clientY;
    const batch: Spark[] = Array.from({ length: 6 }, () => {
      sparkId.current += 1;
      const a = Math.random() * Math.PI * 2;
      const d = 26 + Math.random() * 46;
      return { id: sparkId.current, x, y, dx: Math.cos(a) * d, dy: Math.sin(a) * d - 10 };
    });
    setSparks((s) => [...s, ...batch]);
    const ids = new Set(batch.map((b) => b.id));
    setTimeout(() => setSparks((s) => s.filter((p) => !ids.has(p.id))), 950);
  }, []);

  const tiles: Tile[] = useMemo(
    () => [
      { to: "/anotacoes", label: "Anotações", hint: "Por empresa", icon: StickyNote, span: "sm:col-span-6 lg:col-span-12" },
      {
        onClick: () => setOpen(true),
        label: "Agendar treinamento",
        hint: "Comece um novo agendamento",
        icon: CalendarPlus,
        span: "sm:col-span-3 lg:col-span-4 lg:row-span-2",
      },
      { to: "/agenda", label: "Agenda", hint: "Calendário e visitas", icon: CalendarDays, span: "sm:col-span-3 lg:col-span-4" },
      { to: "/cronogramas", label: "Cronogramas", hint: "ERP e PDV", icon: ClipboardList, span: "sm:col-span-3 lg:col-span-4" },
      { to: "/cobrar", label: "A cobrar", hint: "Pendências da semana", icon: Receipt, span: "sm:col-span-2 lg:col-span-4" },
      { to: "/relatorios", label: "Aceites e clientes", hint: "Termos, histórico e prazos", icon: FileCheck2, span: "sm:col-span-2 lg:col-span-4" },
    ],
    []
  );

  const dateLabel = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  const timeLabel = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const onHeroMove = (e: React.MouseEvent) => {
    const r = heroRef.current?.getBoundingClientRect();
    if (!r) return;
    setTilt({ x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * 2 });
  };

  const ticker = ["Implantação sob controle", "Cronogramas vivos", "Aceites assinados", "Nada esquecido", "Use Sistemas"];

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <SEO
        title="TreinaCheck — Início experimental"
        description="Nova interface experimental do TreinaCheck: acesso rápido à agenda, cronogramas, cobranças e relatórios."
        path="/inicio-experimental"
      />
      <div className="xp-progress" style={{ width: `${progress * 100}%` }} aria-hidden="true" />
      {cursor && (
        <div className="xp-spotlight hidden md:block" style={{ left: cursor.x, top: cursor.y }} aria-hidden="true" />
      )}
      <AppHeader />

      {/* HERO */}
      <section
        ref={heroRef}
        onMouseMove={onHeroMove}
        onMouseLeave={() => setTilt({ x: 0, y: 0 })}
        className="xp-grain relative overflow-hidden border-b border-border"
      >
        <div
          className="xp-aurora h-[42rem] w-[42rem] -left-40 -top-64 bg-primary/40"
          style={{ transform: `translate3d(${tilt.x * 22}px, ${tilt.y * 18}px, 0)` }}
        />
        <div
          className="xp-aurora h-[34rem] w-[34rem] right-[-8rem] top-10 bg-accent/50"
          style={{ animationDelay: "-8s", transform: `translate3d(${tilt.x * -26}px, ${tilt.y * -14}px, 0)` }}
        />
        <div
          className="xp-spin-slow absolute -right-24 top-1/2 h-[30rem] w-[30rem] rounded-full border border-dashed border-primary/25"
          aria-hidden="true"
        >
          <span className="absolute left-1/2 -top-1 h-2 w-2 -translate-x-1/2 rounded-full bg-primary" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-16 sm:pt-24 sm:pb-24">
          <div className="xp-rise flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.34em] text-primary font-bold">
            <Sparkles className="h-3.5 w-3.5 xp-float" />
            Interface experimental
            <span className="text-muted-foreground font-mono tabular-nums">/ {timeLabel}</span>
            {active && <span className="text-muted-foreground">/ base {active.name}</span>}
          </div>

          <h1 className="mt-8 font-black tracking-[-0.04em] leading-[0.82] uppercase">
            <span className="xp-rise block" style={{ fontSize: "clamp(2.75rem, 12vw, 9rem)", animationDelay: ".08s" }}>
              {greeting}
            </span>
            <span
              className="xp-rise block xp-outline-text"
              style={{ fontSize: "clamp(2.75rem, 12vw, 9rem)", animationDelay: ".16s" }}
            >
              {typed || "\u00a0"}
              <span className="xp-caret" style={{ height: "0.78em", verticalAlign: "-0.06em" }} />
            </span>
          </h1>

          <p
            className="xp-rise mt-5 max-w-2xl border-l-2 border-primary pl-4 text-lg font-semibold leading-snug text-foreground sm:mt-7 sm:pl-5 sm:text-xl lg:text-2xl first-letter:uppercase"
            style={{ animationDelay: ".26s" }}
          >
            <span className="block text-xs font-bold uppercase tracking-[0.22em] text-primary sm:text-sm">
              {dateLabel}
            </span>
            <span className="mt-2 block">Escolha por onde começar — tudo a um toque.</span>
          </p>
        </div>

        {/* TICKER */}
        <div className="relative border-t border-border/70 bg-card/40 py-3">
          <div className="xp-marquee gap-10">
            {[...ticker, ...ticker, ...ticker, ...ticker].map((t, i) => (
              <span
                key={i}
                className={`text-xs sm:text-sm uppercase tracking-[0.3em] whitespace-nowrap ${
                  i % 2 ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {t} <span className="text-border">◆</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* BENTO */}
      <main className="relative max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <div className="grid grid-cols-1 sm:grid-cols-6 lg:grid-cols-12 auto-rows-[minmax(9rem,auto)] gap-3 sm:gap-4">
          {tiles.map(({ icon: Icon, label, hint, to, onClick, span }, i) => {
            const body = (
              <span className="relative flex h-full flex-col justify-between overflow-hidden p-5 sm:p-7">
                <span className="xp-shine" />
                <Icon
                  aria-hidden="true"
                  strokeWidth={1}
                  className="pointer-events-none absolute -bottom-8 -right-6 h-36 w-36 text-primary opacity-[0.055] transition-all duration-700 group-hover:-translate-x-2 group-hover:-translate-y-2 group-hover:rotate-[-6deg] group-hover:scale-110 group-hover:opacity-[0.11] sm:-bottom-10 sm:-right-8 sm:h-48 sm:w-48"
                />
                <span className="flex items-start justify-between gap-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary transition-transform duration-500 group-hover:rotate-[-8deg] group-hover:scale-110">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-[10px] font-mono tracking-[0.2em] text-muted-foreground transition-colors group-hover:text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </span>
                <span className="mt-8 block">
                  <span className="block font-black uppercase tracking-[-0.02em] leading-[0.95] text-foreground text-2xl sm:text-3xl lg:text-4xl transition-transform duration-500 group-hover:translate-x-1">
                    {label}
                  </span>
                  <span className="mt-2 flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                    {hint}
                    <ArrowUpRight className="h-4 w-4 text-primary transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" />
                  </span>
                </span>
              </span>
            );
            const cls = `group xp-tile xp-rise block h-full w-full text-left rounded-3xl border border-border/70 bg-card/60 hover:border-primary/60 ${span}`;
            const style = { animationDelay: `${0.1 + i * 0.07}s` };
            return to ? (
              <Link key={label} to={to} className={cls} style={style} onMouseEnter={spawnSparks}>
                {body}
              </Link>
            ) : (
              <button key={label} type="button" onClick={onClick} className={cls} style={style} onMouseEnter={spawnSparks}>
                {body}
              </button>
            );
          })}
        </div>

        {/* sparks layer */}
        <span className="pointer-events-none fixed inset-0 z-10" aria-hidden="true">
          {sparks.map((s) => (
            <span
              key={s.id}
              className="xp-spark"
              style={{ left: s.x, top: s.y, ["--dx" as any]: `${s.dx}px`, ["--dy" as any]: `${s.dy}px` }}
            />
          ))}
        </span>

        <div className="mt-8 sm:mt-10 border-t border-border/70 pt-6 sm:pt-8">
          <p className="mb-3 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
            Lembrete do dia
          </p>
          <TodayVisitsCard />
        </div>


        <div className="mt-12 flex flex-wrap items-center gap-4">
          <Link
            to="/"
            className="story-link text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground"
          >
            Voltar para a tela inicial atual
          </Link>
        </div>
      </main>

      <CreateTrainingDialog open={open} onOpenChange={setOpen} onCreated={() => setOpen(false)} />
    </div>
  );
};

export default HomeExperimental;
