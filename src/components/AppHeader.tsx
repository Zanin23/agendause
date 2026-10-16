import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Moon,
  Sun,
  Database,
  Settings as SettingsIcon,
  ShieldCheck,
  Menu,
  CalendarDays,
  ClipboardList,
  Building2,
  FileCheck2,
  Receipt,
  StickyNote,
  ClipboardCheck,
  Home,
  ChevronDown,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import logoAsset from "@/assets/logo-use-sistemas.png.asset.json";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetClose,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const primaryNavigation = [
  { label: "Agenda", to: "/agenda", icon: CalendarDays },
  { label: "Cronogramas", to: "/cronogramas", icon: ClipboardList },
  { label: "Clientes", to: "/clientes", icon: Building2 },
  { label: "Implantações", to: "/implantacoes", icon: ClipboardCheck },
];

const secondaryNavigation = [
  { label: "Aceites e relatórios", to: "/relatorios", icon: FileCheck2 },
  { label: "Solicitações a cobrar", to: "/cobrar", icon: Receipt },
  { label: "Anotações por empresa", to: "/anotacoes", icon: StickyNote },
  { label: "Levantamento comercial", to: "/levantamento-comercial", icon: ClipboardList },
  { label: "Configurações", to: "/configuracoes", icon: Settings2 },
];

const navigationLinkClass = (active: boolean) =>
  `inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;

export const AppHeader = () => {
  const { user, fullName } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { active } = useWorkspace();
  const { isAdmin } = useIsAdmin();

  const initials = (fullName || user?.email || "?")
    .trim().split(/\s+/)
    .map((p: string) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`);
  const isSecondaryActive = secondaryNavigation.some((item) => isActive(item.to));
  const mobileNavigation = [
    { label: "Início", to: "/", icon: Home },
    ...primaryNavigation,
    ...secondaryNavigation,
    ...(isAdmin ? [{ label: "Controle de acessos", to: "/admin", icon: ShieldCheck }] : []),
  ];

  return (
    <header className="border-b border-border bg-card/40 backdrop-blur sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-14 sm:min-h-16 flex items-center justify-between gap-2">
        <Link
          to="/"
          aria-label="TreinaCheck — Início"
          aria-current={pathname === "/" ? "page" : undefined}
          className="flex items-center gap-2 sm:gap-3 text-foreground min-w-0 shrink-0"
        >
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
          <>
            <nav aria-label="Navegação principal" className="hidden lg:flex items-center gap-1">
              {primaryNavigation.map(({ label, to, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  aria-current={isActive(to) ? "page" : undefined}
                  className={navigationLinkClass(isActive(to))}
                >
                  <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              ))}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Mais áreas de trabalho"
                    aria-current={isSecondaryActive ? "page" : undefined}
                    className={navigationLinkClass(isSecondaryActive)}
                  >
                    Mais
                    <ChevronDown aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {secondaryNavigation.map(({ label, to, icon: Icon }) => (
                    <DropdownMenuItem key={to} asChild>
                      <Link
                        to={to}
                        aria-current={isActive(to) ? "page" : undefined}
                        className={isActive(to) ? "text-primary" : undefined}
                      >
                        <Icon aria-hidden="true" />
                        {label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>

            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="lg:hidden"
                    aria-label="Abrir navegação"
                  >
                    <Menu aria-hidden="true" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[min(85vw,320px)]">
                  <SheetHeader className="text-left">
                    <SheetTitle>Áreas de trabalho</SheetTitle>
                    <SheetDescription>Acesse as principais telas do TreinaCheck.</SheetDescription>
                  </SheetHeader>
                  <nav aria-label="Navegação principal" className="mt-6 flex flex-col gap-1">
                    {mobileNavigation.map(({ label, to, icon: Icon }) => (
                      <SheetClose key={to} asChild>
                        <Link
                          to={to}
                          aria-current={isActive(to) ? "page" : undefined}
                          className={`${navigationLinkClass(isActive(to))} min-h-11`}
                        >
                          <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                          {label}
                        </Link>
                      </SheetClose>
                    ))}
                  </nav>
                </SheetContent>
              </Sheet>
              {active && (
                <Link
                  to="/configuracoes"
                  className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-card/60 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                  title="Trocar base em Configurações"
                >
                  <Database aria-hidden="true" className="h-3 w-3 text-primary" />
                  {active.name}
                </Link>
              )}
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/admin")}
                  className="hidden sm:inline-flex text-primary hover:text-primary hover:bg-primary/10 px-2"
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
          </>
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