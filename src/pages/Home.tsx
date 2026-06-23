import { Link } from "react-router-dom";
import { CalendarDays, CalendarPlus, FileCheck2, ArrowRight, ClipboardList } from "lucide-react";
import logoAsset from "@/assets/logo-use-sistemas.png.asset.json";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";
import { CreateTrainingDialog } from "@/components/CreateTrainingDialog";
import { useAuth } from "@/hooks/useAuth";

const Home = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const firstName = (user?.user_metadata?.full_name || user?.email || "").split(" ")[0];

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="TreinaCheck — Início"
        description="Painel inicial do TreinaCheck: agende treinamentos, gerencie a equipe e acompanhe aceites em um só lugar."
        path="/"
      />
      <AppHeader />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-16 space-y-8 sm:space-y-12">
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

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <ActionCard
            to="/agenda"
            icon={<CalendarDays className="h-6 w-6" />}
            title="Visualizar agenda"
            description="Veja os treinamentos agendados no calendário e na lista."
          />
          <ActionCard
            onClick={() => setOpen(true)}
            icon={<CalendarPlus className="h-6 w-6" />}
            title="Agendar novo treinamento"
            description="Crie um novo treinamento com cliente, data, hora e local."
            highlight
          />
          <ActionCard
            to="/relatorios"
            icon={<FileCheck2 className="h-6 w-6" />}
            title="Relatórios de aceite"
            description="Acompanhe e imprima os termos de recebimento dos treinamentos."
          />
          <ActionCard
            to="/cronogramas"
            icon={<ClipboardList className="h-6 w-6" />}
            title="Cronogramas"
            description="Gerencie cronogramas de implantação ERP e PDV."
          />
        </div>
      </main>

      <CreateTrainingDialog open={open} onOpenChange={setOpen} onCreated={() => setOpen(false)} />
    </div>
  );
};

type ActionCardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  to?: string;
  onClick?: () => void;
  highlight?: boolean;
};

const ActionCard = ({ icon, title, description, to, onClick, highlight }: ActionCardProps) => {
  const inner = (
    <Card
      className={`group cursor-pointer h-full transition-all hover:-translate-y-1 hover:shadow-lg ${
        highlight ? "border-primary/60 bg-primary/5 bg-pattern-hex" : "hover:border-primary/50"
      }`}
    >
      <CardContent className="p-6 flex flex-col h-full gap-4">
        <div
          className={`h-12 w-12 rounded-lg grid place-items-center ${
            highlight ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
          }`}
        >
          {icon}
        </div>
        <div className="space-y-1 flex-1">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-1 text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
          Abrir <ArrowRight className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );

  if (to) return <Link to={to} className="block h-full">{inner}</Link>;
  return <button onClick={onClick} className="text-left h-full">{inner}</button>;
};

export default Home;