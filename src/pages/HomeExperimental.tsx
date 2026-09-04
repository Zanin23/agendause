import { Link } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CalendarPlus,
  FileCheck2,
  ClipboardList,
  Receipt,
  StickyNote,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { CreateTrainingDialog } from "@/components/CreateTrainingDialog";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";

type Tile = {
  to?: string;
  onClick?: () => void;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  span: string;
};

const HomeExperimental = () => {
  const { user } = useAuth();
  const { active } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const heroRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const rawName: string | undefined = user?.user_metadata?.full_name;
  const firstName = rawName ? rawName.split(" ")[0] : "";
  const hour = now.getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  const tiles: Tile[] = useMemo(
    () => [
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
      { to: "/relatorios", label: "Aceites", hint: "Termos e impressão", icon: FileCheck2, span: "sm:col-span-2 lg:col-span-4" },
      { to: "/anotacoes", label: "Anotações", hint: "Por empresa", icon: StickyNote, span: "sm:col-span-2 lg:col-span-4" },
    ],
    []
  );

  const dateLabel = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  const timeLabel = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

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

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-16 sm:pt-24 sm:pb-24">
          <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.34em] text-primary font-bold">
            <Sparkles className="h-3.5 w-3.5" />
            Interface experimental
            <span className="text-muted-foreground">/ {timeLabel}</span>
            {active && <span className="text-muted-foreground">/ base {active.name}</span>}
          </div>

          <h1 className="mt-8 font-black tracking-[-0.04em] leading-[0.82] uppercase">
            <span className="block" style={{ fontSize: "clamp(2.75rem, 12vw, 9rem)" }}>
              {greeting}
            </span>
            <span
              className="block xp-outline-text"
              style={{ fontSize: "clamp(2.75rem, 12vw, 9rem)" }}
            >
              {firstName || "equipe"}
            </span>
          </h1>

          <p className="mt-8 max-w-md text-sm sm:text-base text-muted-foreground first-letter:uppercase">
            {dateLabel}. Escolha por onde começar — tudo a um toque.
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
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <div className="grid grid-cols-1 sm:grid-cols-6 lg:grid-cols-12 auto-rows-[minmax(9rem,auto)] gap-3 sm:gap-4">
          {tiles.map(({ icon: Icon, label, hint, to, onClick, span }, i) => {
            const body = (
              <span className="relative flex h-full flex-col justify-between p-5 sm:p-7">
                <span className="flex items-start justify-between gap-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-[10px] font-mono tracking-[0.2em] text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </span>
                <span className="mt-8 block">
                  <span className="block font-black uppercase tracking-[-0.02em] leading-[0.95] text-foreground text-2xl sm:text-3xl lg:text-4xl">
                    {label}
                  </span>
                  <span className="mt-2 flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                    {hint}
                    <ArrowUpRight className="h-4 w-4 text-primary" />
                  </span>
                </span>
              </span>
            );
            const cls = `xp-tile block h-full w-full text-left rounded-3xl border border-border/70 bg-card/60 hover:border-primary/60 ${span}`;
            return to ? (
              <Link key={label} to={to} className={cls}>
                {body}
              </Link>
            ) : (
              <button key={label} type="button" onClick={onClick} className={cls}>
                {body}
              </button>
            );
          })}
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-4">
          <Link
            to="/"
            className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground border-b border-dashed border-border pb-1"
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
