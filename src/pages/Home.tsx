import { Link } from "react-router-dom";
import { CalendarDays, CalendarPlus, FileCheck2, ArrowRight, ClipboardList, Receipt, StickyNote } from "lucide-react";
import logoAsset from "@/assets/logo-use-sistemas.png.asset.json";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { CreateTrainingDialog } from "@/components/CreateTrainingDialog";
import { useAuth } from "@/hooks/useAuth";

const Home = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  // Rotate the hero background animation every 5 minutes (0, 1, 2).
  const [heroVariant, setHeroVariant] = useState<0 | 1 | 2>(() => {
    return (Math.floor(Date.now() / (5 * 60 * 1000)) % 3) as 0 | 1 | 2;
  });
  useEffect(() => {
    const id = setInterval(() => {
      setHeroVariant((v) => (((v + 1) % 3) as 0 | 1 | 2));
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  const rawName: string | undefined = user?.user_metadata?.full_name;
  // Only use a proper name; ignore the email local-part so we don't greet "Olá, foo123".
  const firstName = rawName ? rawName.split(" ")[0] : "";

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
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-background p-6 sm:p-8 md:p-10">
          <div className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ background: "var(--gradient-hero)" }} />
          <HeroAnimatedBg variant={heroVariant} />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.3em] text-primary font-semibold">TreinaCheck · Use Sistemas</p>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight mt-3 break-words">
                Olá{firstName ? `,\u00a0 ${firstName}` : ""}.
              </h1>
              <p className="text-muted-foreground mt-2 text-sm sm:text-base">O que você quer fazer hoje?</p>
              <div className="mt-5 flex flex-wrap gap-3">
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
            <img
              src={logoAsset.url}
              alt=""
              aria-hidden="true"
              className="hero-float hidden sm:block h-16 md:h-20 w-auto opacity-90 self-start md:self-auto"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        </div>

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
