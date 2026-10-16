import { Link } from "react-router-dom";
import { CalendarDays, CalendarPlus, FileCheck2, ArrowRight, ClipboardList, Receipt, StickyNote } from "lucide-react";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { CreateTrainingDialog } from "@/components/CreateTrainingDialog";
import { firstNameOf, greetingForHour } from "@/lib/profileName";
import { useAuth } from "@/hooks/useAuth";

const Home = () => {
  const { fullName } = useAuth();
  const [open, setOpen] = useState(false);
  const firstName = firstNameOf(fullName);

  const cards = [
    {
      to: "/agenda",
      icon: CalendarDays,
      title: "Visualizar agenda",
      description: "Veja os treinamentos agendados no calendário e na lista.",
      cta: "Acessar agenda",
    },
    {
      to: "/relatorios",
      icon: FileCheck2,
      title: "Relatórios de aceite",
      description: "Acompanhe e imprima os termos de recebimento dos treinamentos.",
      cta: "Ver relatórios",
    },
    {
      to: "/cronogramas",
      icon: ClipboardList,
      title: "Cronogramas",
      description: "Gerencie cronogramas de implantação ERP e PDV.",
      cta: "Gerenciar cronogramas",
    },
    {
      to: "/cobrar",
      icon: Receipt,
      title: "Solicitações a cobrar",
      description: "Acompanhe solicitações por cliente, semana e cobre as pendências.",
      cta: "Abrir solicitações",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="TreinaCheck — Início"
        description="Painel inicial do TreinaCheck: agende treinamentos, gerencie a equipe e acompanhe aceites em um só lugar."
        path="/"
      />
      <AppHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-16 space-y-8 sm:space-y-12">
        <section className="relative isolate overflow-hidden rounded-[1.75rem] border border-border/70 bg-card px-6 py-8 shadow-sm sm:px-9 sm:py-10 lg:px-12 lg:py-12">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/[0.08] via-transparent to-transparent" />
          <div className="relative flex min-h-[220px] items-center justify-between gap-8">
            <div className="min-w-0 max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">TreinaCheck <span className="mx-1 text-border">/</span> Use Sistemas</p>
              <h1 className="mt-4 break-words text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
                {greetingForHour(new Date().getHours())}{firstName ? `, ${firstName}` : ""}!
              </h1>
              <p className="mt-3 text-sm text-muted-foreground sm:text-base">Que bom ter você por aqui. O que vamos organizar hoje?</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => setOpen(true)}
                  className="group inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all duration-300 hover:shadow-primary/40 hover:-translate-y-0.5"
                >
                  <CalendarPlus className="h-4 w-4" />
                  Agendar novo treinamento
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </button>
                <Link
                  to="/anotacoes"
                  className="group inline-flex items-center gap-2 rounded-xl border border-border bg-card/60 px-5 py-3 text-sm font-semibold text-foreground transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40"
                >
                  <StickyNote className="h-4 w-4 text-primary" />
                  Anotações por empresa
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </div>
            </div>
            <div className="home-orbit-art hidden shrink-0 items-center justify-center sm:flex" aria-hidden="true">
              <div className="home-orbit-ring" />
              <div className="home-orbit-core" />
              <div className="home-orbit-path"><span className="home-orbit-satellite" /></div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          {cards.map((card) => (
            <ActionCard key={card.title} {...card} />
          ))}
        </div>
      </main>

      <CreateTrainingDialog open={open} onOpenChange={setOpen} onCreated={() => setOpen(false)} />
    </div>
  );
};

type ActionCardProps = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  cta: string;
  to?: string;
  onClick?: () => void;
  primary?: boolean;
};

const ActionCard = ({ icon: Icon, title, description, cta, to, onClick, primary }: ActionCardProps) => {
  const inner = (
    <div
      className={`group relative flex flex-col h-full p-4 sm:p-6 rounded-2xl cursor-pointer overflow-hidden transition-all duration-300 hover:-translate-y-1 ${
        primary
          ? "bg-primary/[0.06] border border-primary/30 hover:border-primary/60"
          : "bg-card/80 border border-border/60 hover:border-primary/40"
      }`}
    >
      <div
        className={`absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
          primary ? "from-primary/10" : "from-primary/5"
        } to-transparent`}
      />
      <div className="relative flex flex-row sm:flex-col items-center sm:items-stretch gap-4 sm:gap-0 h-full">
        <div
          className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 sm:mb-5 transition-colors duration-300 ${
            primary
              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 group-hover:shadow-primary/40"
              : "bg-primary/10 text-primary group-hover:bg-primary/20"
          }`}
        >
          <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <h2 className="text-base sm:text-2xl font-semibold tracking-tight text-foreground mb-1 sm:mb-2">{title}</h2>
          <p className="text-xs sm:text-base text-muted-foreground leading-relaxed sm:flex-1 line-clamp-2 sm:line-clamp-none">{description}</p>
          <div className="hidden sm:flex mt-auto pt-6 items-center text-xs font-medium text-primary uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            {cta}
            <ArrowRight className="h-3 w-3 ml-1.5" />
          </div>
        </div>
        <ArrowRight className="sm:hidden h-4 w-4 text-primary shrink-0" />
      </div>
    </div>
  );

  if (to) return <Link to={to} className="block h-full">{inner}</Link>;
  return <button onClick={onClick} className="text-left h-full">{inner}</button>;
};

export default Home;
