import { Link, useNavigate } from "react-router-dom";
import { Moon, Sun, Database, Settings as SettingsIcon, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useWorkspace } from "@/hooks/useWorkspace";
import logoAsset from "@/assets/logo-use-sistemas.png.asset.json";

export const AppHeader = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { active } = useWorkspace();
  const { isAdmin } = useIsAdmin();

  const initials = (user?.user_metadata?.full_name || user?.email || "?")
    .split(" ")
    .map((p: string) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="border-b border-border bg-card/40 backdrop-blur sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
        <Link to="/" className="flex items-center gap-2 sm:gap-3 text-foreground min-w-0">
          <img
            src={logoAsset.url}
            alt=""
            aria-hidden="true"
            className="h-7 sm:h-8 w-auto shrink-0"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <span className="flex flex-col leading-tight min-w-0">
            <span className="font-semibold tracking-tight">TreinaCheck</span>
            <span className="hidden sm:inline text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Use Sistemas</span>
          </span>
        </Link>
        {user && (
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {active && (
              <Link
                to="/configuracoes"
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-card/60 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                title="Trocar base em Configurações"
              >
                <Database className="h-3 w-3 text-primary" />
                {active.name}
              </Link>
            )}
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/admin")}
                className="text-primary hover:text-primary hover:bg-primary/10 px-2"
                aria-label="Controle de Acessos"
                title="Controle de Acessos"
              >
                <ShieldCheck className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/configuracoes")}
              className="text-muted-foreground px-2"
              aria-label="Configurações"
              title="Configurações"
            >
              <SettingsIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="text-muted-foreground px-2"
              aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
              title={theme === "dark" ? "Modo claro" : "Modo escuro"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Avatar className="h-8 w-8 sm:h-9 sm:w-9">
              <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">{initials}</AvatarFallback>
            </Avatar>
          </div>
        )}
        {!user && (
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="text-muted-foreground px-2"
            aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
            title={theme === "dark" ? "Modo claro" : "Modo escuro"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </header>
  );
};