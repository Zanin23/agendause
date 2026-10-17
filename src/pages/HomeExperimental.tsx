import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Building2,
  CalendarDays,
  CalendarPlus,
  FileCheck2,
  ClipboardList,
  ClipboardCheck,
  Receipt,
  StickyNote,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { CreateTrainingDialog } from "@/components/CreateTrainingDialog";
import { firstNameOf, greetingForHour } from "@/lib/profileName";
import { useAuth } from "@/hooks/useAuth";
import { TodayVisitsCard } from "@/components/TodayVisitsCard";

type Tile = {
  to?: string;
  onClick?: () => void;
  label: string;
  hint: string;
  icon: LucideIcon;
  span: string;
  primary?: boolean;
};

const HomeExperimental = () => {
  const { fullName } = useAuth();
  const [open, setOpen] = useState(false);

  const firstName = firstNameOf(fullName);
  const now = new Date();
  const hour = now.getHours();
  const greeting = greetingForHour(hour);
  const nameToType = firstName || "equipe";
  const [typedName, setTypedName] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? nameToType
      : "",
  );

  useEffect(() => {
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timeout: number | undefined;
    let visibleCharacters = 0;
    let cancelled = false;

    const startTyping = () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      visibleCharacters = 0;
      if (motionPreference.matches) {
        setTypedName(nameToType);
        return;
      }

      setTypedName("");
      const typeNextCharacter = () => {
        if (cancelled) return;
        visibleCharacters += 1;
        setTypedName(nameToType.slice(0, visibleCharacters));
        if (visibleCharacters < nameToType.length) {
          timeout = window.setTimeout(typeNextCharacter, 85);
        }
      };
      timeout = window.setTimeout(typeNextCharacter, 85);
    };

    startTyping();
    motionPreference.addEventListener("change", startTyping);
    return () => {
      cancelled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
      motionPreference.removeEventListener("change", startTyping);
    };
  }, [nameToType]);

  const tiles: Tile[] = [
    {
      onClick: () => setOpen(true),
      label: "Agendar treinamento",
      hint: "Comece um novo agendamento",
      icon: CalendarPlus,
      span: "sm:col-span-3 lg:col-span-6",
      primary: true,
    },
    { to: "/agenda", label: "Agenda", hint: "Calendário e visitas", icon: CalendarDays, span: "sm:col-span-3 lg:col-span-6", primary: true },
    { to: "/cronogramas", label: "Cronogramas", hint: "Implantação e livres", icon: ClipboardList, span: "sm:col-span-3 lg:col-span-4" },
    { to: "/implantacoes", label: "Implantações", hint: "Cronogramas + relatório", icon: Building2, span: "sm:col-span-3 lg:col-span-4" },
    { to: "/levantamento-comercial", label: "Levantamento Comercial", hint: "Pré-implantação de clientes ERP", icon: ClipboardCheck, span: "sm:col-span-3 lg:col-span-4" },
    { to: "/cobrar", label: "A cobrar", hint: "Pendências da semana", icon: Receipt, span: "sm:col-span-3 lg:col-span-4" },
    { to: "/relatorios", label: "Aceites e clientes", hint: "Termos, histórico e prazos", icon: FileCheck2, span: "sm:col-span-3 lg:col-span-4" },
    { to: "/anotacoes", label: "Anotações", hint: "Por empresa", icon: StickyNote, span: "sm:col-span-3 lg:col-span-4" },
  ];

  const dateLabel = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="TreinaCheck — Início"
        description="Acesse a agenda, os cronogramas, as cobranças e os relatórios do TreinaCheck."
        path="/"
      />
      <AppHeader />
      <main id="main-content" className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="home-welcome mt-6 grid items-center gap-5 overflow-hidden rounded-3xl border border-border/70 p-5 shadow-sm sm:mt-8 sm:p-8 lg:grid-cols-[minmax(0,1fr)_12rem] lg:p-10">
          <div className="relative z-10 min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{dateLabel}</p>
            <h1
              aria-label={`${greeting}, ${firstName || "equipe"}!`}
              className="mt-2 break-words text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl"
            >
              {greeting}, <span aria-hidden="true">{typedName}</span>
              {typedName.length < nameToType.length && <span className="home-type-caret" aria-hidden="true" />}
              !
            </h1>
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">
              Acesse uma área ou comece um novo treinamento.
            </p>
          </div>
          <div className="home-geometry relative hidden h-40 w-48 justify-self-end lg:block" aria-hidden="true">
            <span className="home-geometry-frame" />
            <span className="home-geometry-square" />
            <span className="home-geometry-rule" />
          </div>
        </section>

        <section aria-label="Atalhos" className="py-8 sm:py-10">
          <div className="grid grid-cols-1 sm:grid-cols-6 lg:grid-cols-12 auto-rows-[minmax(9rem,auto)] gap-3 sm:gap-4">
            {tiles.map(({ icon: Icon, label, hint, to, onClick, span, primary }) => {
              const body = (
                <span className="relative flex h-full flex-col justify-between overflow-hidden p-5 sm:p-6">
                  <Icon
                    aria-hidden="true"
                    strokeWidth={1.5}
                    className="pointer-events-none absolute -bottom-6 -right-5 h-28 w-28 text-primary opacity-[0.06] sm:h-36 sm:w-36"
                  />
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <span className="mt-6 block">
                    <span className="block text-lg font-semibold leading-snug text-foreground sm:text-xl">
                      {label}
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      {hint}
                      <ArrowUpRight aria-hidden="true" className="h-4 w-4 text-primary" />
                    </span>
                  </span>
                </span>
              );
              const cls = `group block h-full w-full rounded-2xl border text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                primary ? "border-primary/30 bg-primary/[0.04]" : "border-border/70 bg-card/60"
              } ${span}`;
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
        </section>

        <section aria-label="Agenda de hoje" className="border-t border-border py-8 sm:py-10">
          <TodayVisitsCard />
        </section>
      </main>

      <CreateTrainingDialog open={open} onOpenChange={setOpen} onCreated={() => setOpen(false)} />
    </div>
  );
};

export default HomeExperimental;
