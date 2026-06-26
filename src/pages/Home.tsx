import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import logoAsset from "@/assets/logo-use-sistemas.png.asset.json";
import iconAgenda from "@/assets/icon-agenda.png";
import iconNovo from "@/assets/icon-novo-treinamento.png";
import iconRelatorios from "@/assets/icon-relatorios.png";
import iconCronogramas from "@/assets/icon-cronogramas.png";
import iconCobrar from "@/assets/icon-cobrar.png";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { CreateTrainingDialog } from "@/components/CreateTrainingDialog";
import { useAuth } from "@/hooks/useAuth";

const Home = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const firstName = (user?.user_metadata?.full_name || user?.email || "").split(" ")[0];

  const cards = [
    {
      to: "/agenda",
      icon: iconAgenda,
      title: "Visualizar agenda",
      description: "Veja os treinamentos agendados no calendário e na lista.",
      cta: "Acessar agenda",
    },
    {
      onClick: () => setOpen(true),
      icon: iconNovo,
      title: "Agendar novo treinamento",
      description: "Crie um novo treinamento com cliente, data, hora e local.",
      cta: "Novo treinamento",
      primary: true,
    },
    {
      to: "/relatorios",
      icon: iconRelatorios,
      title: "Relatórios de aceite",
      description: "Acompanhe e imprima os termos de recebimento dos treinamentos.",
      cta: "Ver relatórios",
    },
    {
      to: "/cronogramas",
      icon: iconCronogramas,
      title: "Cronogramas",
      description: "Gerencie cronogramas de implantação ERP e PDV.",
      cta: "Gerenciar cronogramas",
    },
    {
      to: "/cobrar",
      icon: iconCobrar,
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
          <div className="hero-grid" />
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
          <div className="hero-shimmer" />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.3em] text-primary font-semibold">TreinaCheck · Use Sistemas</p>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight mt-3 break-words">
                Olá{firstName ? `,\u00a0 ${firstName}` : ""}.
              </h1>
              <p className="text-muted-foreground mt-2 text-sm sm:text-base">O que você quer fazer hoje?</p>
            </div>
            <img src={logoAsset.url} alt="Use Sistemas" className="hero-float hidden sm:block h-16 md:h-20 w-auto opacity-90 self-start md:self-auto" />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
  icon: string;
  title: string;
  description: string;
  cta: string;
  to?: string;
  onClick?: () => void;
  primary?: boolean;
};

const ActionCard = ({ icon, title, description, cta, to, onClick, primary }: ActionCardProps) => {
  const inner = (
    <div
      className={`group relative flex flex-col h-full p-6 rounded-2xl cursor-pointer overflow-hidden transition-all duration-300 hover:-translate-y-1 ${
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
      <div className="relative flex flex-col h-full">
        <div
          className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105 ${
            primary
              ? "bg-primary/15 ring-1 ring-primary/30 shadow-lg shadow-primary/20"
              : "bg-primary/5 ring-1 ring-border/60"
          }`}
        >
          <img src={icon} alt="" loading="lazy" width={512} height={512} className="h-16 w-16 object-contain drop-shadow-sm" />
        </div>
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground mb-2">{title}</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed flex-1">{description}</p>
        <div className="mt-auto pt-6 flex items-center text-xs font-medium text-primary uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          {cta}
          <ArrowRight className="h-3 w-3 ml-1.5" />
        </div>
      </div>
    </div>
  );

  if (to) return <Link to={to} className="block h-full">{inner}</Link>;
  return <button onClick={onClick} className="text-left h-full">{inner}</button>;
};

export default Home;
