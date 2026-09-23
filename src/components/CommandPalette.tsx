import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import {
  Search, Home, CalendarDays, ClipboardList, FileCheck2, Building2, Receipt,
  StickyNote, Settings, ShieldCheck, Database, Printer, CalendarPlus,
} from "lucide-react";

const ITEMS = [
  { label: "Início", to: "/", icon: Home, keys: "home tela inicial" },
  { label: "Agenda", to: "/agenda", icon: CalendarDays, keys: "visitas treinamentos calendario" },
  { label: "Imprimir agenda", to: "/agenda/imprimir", icon: Printer, keys: "pdf" },
  { label: "Cronogramas", to: "/cronogramas", icon: ClipboardList, keys: "implantacao etapas" },
  { label: "Novo cronograma", to: "/cronogramas/novo", icon: CalendarPlus, keys: "criar" },
  { label: "Aceites e relatórios", to: "/relatorios", icon: FileCheck2, keys: "termos relatorios aceite" },
  { label: "Clientes", to: "/clientes", icon: Building2, keys: "empresas saude" },
  { label: "Solicitações a cobrar", to: "/cobrar", icon: Receipt, keys: "cobrar pendencias" },
  { label: "Anotações por empresa", to: "/anotacoes", icon: StickyNote, keys: "notas" },
  { label: "Configurações", to: "/configuracoes", icon: Settings, keys: "ajustes fonte" },
  { label: "Trocar base", to: "/selecionar-base", icon: Database, keys: "workspace" },
  { label: "Controle de acessos", to: "/admin", icon: ShieldCheck, keys: "admin usuarios permissoes" },
  { label: "Tela inicial clássica", to: "/inicio-classico", icon: Home, keys: "antiga" },
];

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const CommandPalette = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (open) { setQ(""); setIdx(0); } }, [open]);

  const results = useMemo(() => {
    const n = norm(q.trim());
    return n ? ITEMS.filter((i) => norm(i.label + " " + i.keys).includes(n)) : ITEMS;
  }, [q]);

  if (!user) return null;

  const go = (to: string) => { setOpen(false); navigate(to); };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden">
        <DialogTitle className="sr-only">Pesquisar telas</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              if (e.key === "Enter" && results[idx]) go(results[idx].to);
            }}
            placeholder="Ir para... (agenda, cronogramas, aceites)"
            className="flex-1 h-12 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
          />
          <kbd className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && <li className="p-4 text-sm text-center text-muted-foreground">Nenhuma tela encontrada.</li>}
          {results.map((item, i) => (
            <li key={item.to}>
              <button
                onMouseEnter={() => setIdx(i)}
                onClick={() => go(item.to)}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-left transition-colors ${
                  i === idx ? "bg-primary/10 text-primary" : "text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">↑↓ navegar · Enter abrir · Ctrl+K fechar</div>
      </DialogContent>
    </Dialog>
  );
};
