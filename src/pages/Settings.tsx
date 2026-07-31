import { useState } from "react";
import { Link } from "react-router-dom";
import { Database, Loader2, Check, Accessibility, Type, ShieldCheck, ChevronRight } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { SEO } from "@/components/SEO";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useA11y, type FontScale } from "@/hooks/useA11y";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { toast } from "sonner";

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-primary" : "bg-muted"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

const Settings = () => {
  const { workspaces, activeId, setActive, loading } = useWorkspace();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const { scale, setScale, bold, setBold, contrast, setContrast } = useA11y();
  const { isAdmin } = useIsAdmin();

  const scaleOptions: { id: FontScale; label: string; sample: string }[] = [
    { id: "normal", label: "Padrão", sample: "Aa" },
    { id: "large", label: "Grande", sample: "Aa" },
    { id: "xlarge", label: "Extra grande", sample: "Aa" },
  ];

  const choose = async (id: string) => {
    if (id === activeId) return;
    try {
      setPendingId(id);
      await setActive(id);
      toast.success("Base ativa alterada");
    } catch (e: any) {
      toast.error(e.message || "Erro ao trocar base");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Configurações — TreinaCheck" description="Configurações da conta e da base de dados ativa." path="/configuracoes" />
      <AppHeader />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        <div>
          <BackButton />
          <h1 className="text-3xl font-semibold tracking-tight mt-3">Configurações</h1>
          <p className="text-muted-foreground mt-1">Ajuste preferências da sua conta.</p>
        </div>

        <section className="rounded-2xl border border-border bg-card/60 p-6">
          <header className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Base de dados ativa</h2>
              <p className="text-sm text-muted-foreground">Trocar a base muda todos os dados visíveis no app.</p>
            </div>
          </header>
          {loading ? (
            <div className="text-muted-foreground inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div>
          ) : (
            <div className="space-y-2">
              {workspaces.map((w) => {
                const isActive = w.id === activeId;
                const pending = pendingId === w.id;
                return (
                  <button
                    key={w.id}
                    onClick={() => choose(w.id)}
                    disabled={pending || isActive}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition-colors ${
                      isActive ? "border-primary/60 bg-primary/[0.06]" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div>
                      <div className="font-medium">{w.name}</div>
                      <div className="text-xs text-muted-foreground">{w.slug}</div>
                    </div>
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs text-primary font-semibold uppercase tracking-wider">
                        <Check className="h-3.5 w-3.5" /> Ativa
                      </span>
                    ) : pending ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <span className="text-xs text-muted-foreground">Selecionar</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card/60 p-6">
          <header className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Accessibility className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Acessibilidade visual</h2>
              <p className="text-sm text-muted-foreground">Ajuste o tamanho e o peso das fontes para facilitar a leitura.</p>
            </div>
          </header>

          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-3 text-sm font-medium">
                <Type className="h-4 w-4 text-muted-foreground" />
                Tamanho da fonte
              </div>
              <div className="grid grid-cols-3 gap-2">
                {scaleOptions.map((opt) => {
                  const active = scale === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setScale(opt.id)}
                      className={`flex flex-col items-center justify-center gap-1 p-4 rounded-xl border transition-colors ${
                        active ? "border-primary/60 bg-primary/[0.06]" : "border-border hover:border-primary/40"
                      }`}
                      aria-pressed={active}
                    >
                      <span
                        className="font-semibold leading-none"
                        style={{ fontSize: opt.id === "normal" ? "1rem" : opt.id === "large" ? "1.35rem" : "1.7rem" }}
                      >
                        {opt.sample}
                      </span>
                      <span className="text-xs text-muted-foreground">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border cursor-pointer">
              <div>
                <div className="font-medium">Texto em negrito</div>
                <div className="text-sm text-muted-foreground">Aumenta o peso das fontes para mais contraste.</div>
              </div>
              <Toggle checked={bold} onChange={setBold} label="Texto em negrito" />
            </label>

            <label className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border cursor-pointer">
              <div>
                <div className="font-medium">Alto contraste</div>
                <div className="text-sm text-muted-foreground">Realça textos secundários e indicadores de foco.</div>
              </div>
              <Toggle checked={contrast} onChange={setContrast} label="Alto contraste" />
            </label>
          </div>
        </section>

        {isAdmin && (
          <section className="rounded-2xl border border-border bg-card/60 p-6">
            <header className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Administração</h2>
                <p className="text-sm text-muted-foreground">Visualize as contas cadastradas e ajuste senhas.</p>
              </div>
            </header>
            <Link
              to="/admin"
              className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border hover:border-primary/40 transition-colors"
            >
              <span className="font-medium">Contas do sistema</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </section>
        )}
      </main>
    </div>
  );
};

export default Settings;