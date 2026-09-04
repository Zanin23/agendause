import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarPlus,
  FileCheck2,
  ClipboardList,
  Receipt,
  StickyNote,
  ArrowUpRight,
  Search,
  Sparkles,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { CreateTrainingDialog } from "@/components/CreateTrainingDialog";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";

type Entry = {
  to?: string;
  onClick?: () => void;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
};

const HomeExperimental = () => {
  const { user } = useAuth();
  const { active } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const rawName: string | undefined = user?.user_metadata?.full_name;
  const firstName = rawName ? rawName.split(" ")[0] : "";
  const greeting = now.getHours() < 12 ? "Bom dia" : now.getHours() < 18 ? "Boa tarde" : "Boa noite";

  const entries: Entry[] = useMemo(
    () => [
      { onClick: () => setOpen(true), label: "Agendar novo treinamento", hint: "Criar um agendamento agora", icon: CalendarPlus },
      { to: "/agenda", label: "Agenda", hint: "Calendário e lista de visitas", icon: CalendarDays },
      { to: "/cronogramas", label: "Cronogramas", hint: "Implantação ERP e PDV", icon: ClipboardList },
      { to: "/cobrar", label: "Solicitações a cobrar", hint: "Pendências da semana", icon: Receipt },
      { to: "/relatorios", label: "Relatórios de aceite", hint: "Termos assinados e impressão", icon: FileCheck2 },
      { to: "/anotacoes", label: "Anotações por empresa", hint: "Registros e anexos por cliente", icon: StickyNote },
    ],
    []
  );

  const filtered = entries.filter(
    (e) =>
      !q.trim() ||
      e.label.toLowerCase().includes(q.toLowerCase()) ||
      e.hint.toLowerCase().includes(q.toLowerCase())
  );

  const dateLabel = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="TreinaCheck — Início experimental"
        description="Nova interface experimental do TreinaCheck: acesso rápido à agenda, cronogramas, cobranças e relatórios."
        path="/inicio-experimental"
      />
      <AppHeader />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-primary font-semibold">
          <Sparkles className="h-3.5 w-3.5" />
          Interface experimental
        </div>

        <h1
          className="mt-5 font-semibold tracking-tight leading-[0.95]"
          style={{ fontSize: "clamp(2.25rem, 7vw, 5rem)" }}
        >
          {greeting}
          {firstName ? `, ${firstName}` : ""}.
        </h1>

        <p className="mt-4 text-sm sm:text-base text-muted-foreground first-letter:uppercase">
          {dateLabel}
          {active ? ` · base ${active.name}` : ""}
        </p>

        <div className="mt-10 relative max-w-xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="O que você quer fazer?"
            aria-label="Buscar ação"
            className="w-full rounded-full border border-border bg-card/60 pl-11 pr-4 py-3 text-sm outline-none transition-colors focus:border-primary/60"
          />
        </div>

        <ul className="mt-10 divide-y divide-border/70 border-y border-border/70">
          {filtered.map(({ icon: Icon, label, hint, to, onClick }) => {
            const body = (
              <span className="group flex items-center gap-4 py-5 sm:py-6 w-full text-left">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg sm:text-2xl font-semibold tracking-tight text-foreground transition-transform duration-300 group-hover:translate-x-1">
                    {label}
                  </span>
                  <span className="block text-xs sm:text-sm text-muted-foreground">{hint}</span>
                </span>
                <ArrowUpRight className="h-5 w-5 shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-primary group-hover:-translate-y-0.5" />
              </span>
            );
            return (
              <li key={label}>
                {to ? (
                  <Link to={to} className="block">
                    {body}
                  </Link>
                ) : (
                  <button type="button" onClick={onClick} className="block w-full">
                    {body}
                  </button>
                )}
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="py-8 text-sm text-muted-foreground">Nenhuma ação encontrada para “{q}”.</li>
          )}
        </ul>

        <div className="mt-10">
          <Link to="/" className="text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
            Voltar para a tela inicial atual
          </Link>
        </div>
      </main>

      <CreateTrainingDialog open={open} onOpenChange={setOpen} onCreated={() => setOpen(false)} />
    </div>
  );
};

export default HomeExperimental;
