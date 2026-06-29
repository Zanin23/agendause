import { useEffect, useMemo, useState } from "react";
import { Plus, Bell, BellOff, CheckCircle2, Trash2, MessageSquarePlus, Settings, X, Smartphone, Send, ChevronLeft, ChevronRight, CalendarDays, FileDown, ArrowRightCircle, Receipt } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { isPushSupported, subscribeToPush, unsubscribeFromPush, getPushStatus, registerServiceWorker } from "@/lib/push";

// ---------- helpers ----------
function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay(); // 0 sun..6 sat
  const diff = (day === 0 ? -6 : 1 - day); // monday as start
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function formatWeekLabel(iso: string) {
  const start = new Date(iso + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (x: Date) => x.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const thisWeek = startOfWeek(new Date());
  const diffDays = Math.round((start.getTime() - thisWeek.getTime()) / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.round(diffDays / 7);
  let prefix = "";
  if (diffWeeks === 0) prefix = "Esta semana · ";
  else if (diffWeeks === -1) prefix = "Semana passada · ";
  else if (diffWeeks === 1) prefix = "Próxima semana · ";
  else if (diffWeeks < 0) prefix = `${Math.abs(diffWeeks)} semanas atrás · `;
  else if (diffWeeks > 0) prefix = `Em ${diffWeeks} semanas · `;
  return `${prefix}${fmt(start)} – ${fmt(end)}`;
}

type Request = {
  id: string;
  user_id: string;
  number: string;
  client: string;
  title: string;
  description: string | null;
  week_start: string;
  status: "pending" | "delivered";
  delivered_at: string | null;
  created_at: string;
  carried_over_to: string | null;
  carried_over_from_id: string | null;
};

type Update = {
  id: string;
  request_id: string;
  content: string;
  created_at: string;
};

type Settings = {
  user_id: string;
  enabled: boolean;
  times: string[];
  weekdays: number[];
};

const DEFAULT_SETTINGS: Omit<Settings, "user_id"> = {
  enabled: false,
  times: ["09:00", "14:00", "17:00"],
  weekdays: [1, 2, 3, 4, 5],
};

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const sb = supabase as any;

export default function BillingRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<Request[]>([]);
  const [updates, setUpdates] = useState<Record<string, Update[]>>({});
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [filterClient, setFilterClient] = useState<string>("");
  const [showDelivered, setShowDelivered] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<string | "all">(
    toISODate(startOfWeek(new Date()))
  );
  const [settings, setSettings] = useState<Settings | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await sb
      .from("billing_requests")
      .select("*")
      .order("week_start", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar solicitações");
    setRequests((data || []) as Request[]);
    const ids = (data || []).map((r: Request) => r.id);
    if (ids.length) {
      const { data: up } = await sb
        .from("billing_request_updates")
        .select("*")
        .in("request_id", ids)
        .order("created_at", { ascending: false });
      const grouped: Record<string, Update[]> = {};
      (up || []).forEach((u: Update) => {
        (grouped[u.request_id] ||= []).push(u);
      });
      setUpdates(grouped);
    } else {
      setUpdates({});
    }
    setLoading(false);
  };

  const loadSettings = async () => {
    if (!user) return;
    const { data } = await sb
      .from("billing_notification_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) setSettings(data as Settings);
    else setSettings({ user_id: user.id, ...DEFAULT_SETTINGS });
  };

  useEffect(() => {
    load();
    loadSettings();
    // Register messaging service worker on page load (idempotent)
    registerServiceWorker();
  }, [user?.id]);

  // ---------- notifications loop ----------
  useEffect(() => {
    if (!settings?.enabled) return;
    const key = "billing_last_notif";
    const tick = () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const wd = now.getDay();
      if (!settings.weekdays.includes(wd)) return;
      if (!settings.times.includes(hhmm)) return;
      const stamp = `${toISODate(now)}-${hhmm}`;
      if (localStorage.getItem(key) === stamp) return;
      const pending = requests.filter((r) => r.status === "pending").length;
      if (pending === 0) return;
      localStorage.setItem(key, stamp);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("Solicitações a cobrar", {
          body: `Você tem ${pending} solicitação(ões) pendente(s) para cobrar.`,
        });
      } else {
        toast.warning(`Você tem ${pending} solicitação(ões) pendente(s) para cobrar.`);
      }
    };
    const id = window.setInterval(tick, 30 * 1000);
    tick();
    return () => window.clearInterval(id);
  }, [settings, requests]);

  const clients = useMemo(
    () => Array.from(new Set(requests.map((r) => r.client))).sort(),
    [requests]
  );

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (filterClient && r.client !== filterClient) return false;
      if (!showDelivered && r.status === "delivered") return false;
      if (selectedWeek !== "all" && r.week_start !== selectedWeek) return false;
      return true;
    });
  }, [requests, filterClient, showDelivered, selectedWeek]);

  const availableWeeks = useMemo(() => {
    const set = new Set<string>(requests.map((r) => r.week_start));
    const today = startOfWeek(new Date());
    // Always show a window around today: 4 weeks back through 4 weeks ahead
    for (let i = -4; i <= 4; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i * 7);
      set.add(toISODate(d));
    }
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [requests]);

  const shiftWeek = (delta: number) => {
    const base =
      selectedWeek === "all"
        ? startOfWeek(new Date())
        : new Date(selectedWeek + "T00:00:00");
    base.setDate(base.getDate() + delta * 7);
    setSelectedWeek(toISODate(startOfWeek(base)));
  };

  const exportPdf = () => {
    if (grouped.length === 0) {
      toast.error("Nada para exportar");
      return;
    }
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const now = new Date();

    doc.setFontSize(16);
    doc.text("Solicitações a cobrar", 40, 50);
    doc.setFontSize(10);
    doc.setTextColor(120);
    const subtitleParts: string[] = [];
    if (selectedWeek !== "all") subtitleParts.push(formatWeekLabel(selectedWeek));
    else subtitleParts.push("Todas as semanas");
    if (filterClient) subtitleParts.push(`Cliente: ${filterClient}`);
    subtitleParts.push(showDelivered ? "Incluindo entregues" : "Somente pendentes");
    doc.text(subtitleParts.join("  ·  "), 40, 68);
    doc.text(
      `Gerado em ${now.toLocaleString("pt-BR")}`,
      pageWidth - 40,
      68,
      { align: "right" }
    );
    doc.setTextColor(0);

    let cursorY = 90;

    grouped.forEach(([weekIso, byClient]) => {
      const total = Array.from(byClient.values()).reduce((s, a) => s + a.length, 0);
      doc.setFontSize(12);
      doc.setFont(undefined as any, "bold");
      doc.text(`${formatWeekLabel(weekIso)}  (${total})`, 40, cursorY);
      doc.setFont(undefined as any, "normal");
      cursorY += 8;

      Array.from(byClient.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([client, list]) => {
          const sorted = [...list].sort((a, b) =>
            a.number.localeCompare(b.number, undefined, { numeric: true })
          );
          const rows = sorted.map((r) => {
            const ups = updates[r.id] || [];
            const upsText = ups
              .map((u) => `• ${u.content}`)
              .join("\n");
            return [
              r.number,
              r.title + (r.description ? `\n${r.description}` : ""),
              r.status === "delivered" ? "Entregue" : "Pendente",
              upsText,
            ];
          });
          autoTable(doc, {
            startY: cursorY + 4,
            head: [[
              { content: client, colSpan: 4, styles: { halign: "left", fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold" } },
            ], ["Nº", "Solicitação", "Status", "Atualizações"]],
            body: rows,
            styles: { fontSize: 9, cellPadding: 4, valign: "top" },
            headStyles: { fillColor: [250, 250, 250], textColor: 60, lineWidth: 0.2, lineColor: [220, 220, 220] },
            columnStyles: {
              0: { cellWidth: 55, fontStyle: "bold" },
              1: { cellWidth: 230 },
              2: { cellWidth: 60 },
              3: { cellWidth: "auto" },
            },
            margin: { left: 40, right: 40 },
            theme: "grid",
          });
          // @ts-ignore - lastAutoTable is added by autoTable
          cursorY = (doc as any).lastAutoTable.finalY + 14;
        });

      cursorY += 6;
    });

    const filename = `solicitacoes-cobrar-${toISODate(now)}.pdf`;
    doc.save(filename);
    toast.success("PDF gerado");
  };

  // Group by week -> client -> requests
  const grouped = useMemo(() => {
    const byWeek = new Map<string, Map<string, Request[]>>();
    for (const r of filtered) {
      if (!byWeek.has(r.week_start)) byWeek.set(r.week_start, new Map());
      const byClient = byWeek.get(r.week_start)!;
      if (!byClient.has(r.client)) byClient.set(r.client, []);
      byClient.get(r.client)!.push(r);
    }
    return Array.from(byWeek.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Solicitações a cobrar" description="Acompanhe e cobre solicitações por cliente e semana." path="/cobrar" />
      <AppHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <BackButton to="/" className="-ml-2 mb-1" />
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
              <Receipt className="h-7 w-7 text-primary" /> Solicitações a cobrar
            </h1>
            <p className="text-sm text-muted-foreground">Por cliente, agrupadas pela semana.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
              {settings?.enabled ? <Bell className="h-4 w-4 sm:mr-2" /> : <BellOff className="h-4 w-4 sm:mr-2" />}
              <span className="hidden sm:inline">Notificações</span>
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Nova solicitação</span>
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1 rounded-md border border-border bg-card p-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => shiftWeek(-1)}
              aria-label="Semana anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <select
              className="h-7 bg-transparent text-sm px-1 outline-none min-w-[180px]"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value as any)}
            >
              <option value="all">Todas as semanas</option>
              {availableWeeks.map((w) => (
                <option key={w} value={w}>{formatWeekLabel(w)}</option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => shiftWeek(1)}
              aria-label="Próxima semana"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setSelectedWeek(toISODate(startOfWeek(new Date())))}
              title="Ir para esta semana"
            >
              <CalendarDays className="h-3.5 w-3.5 mr-1" />
              Hoje
            </Button>
          </div>
          <select
            className="h-9 rounded-md border border-border bg-card px-3 text-sm"
            value={filterClient}
            onChange={(e) => setFilterClient(e.target.value)}
          >
            <option value="">Todos os clientes</option>
            {clients.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <Button
            variant={showDelivered ? "default" : "outline"}
            size="sm"
            onClick={() => setShowDelivered((v) => !v)}
          >
            {showDelivered ? "Ocultar entregues" : "Mostrar entregues"}
          </Button>
          <Button variant="outline" size="sm" onClick={exportPdf}>
            <FileDown className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Exportar PDF</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMoveOpen(true)}>
            <ArrowRightCircle className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Mover pendentes</span>
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : grouped.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="text-muted-foreground">Nenhuma solicitação por aqui ainda.</p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Criar a primeira
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map(([weekIso, byClient]) => (
              <section key={weekIso} className="space-y-3">
                <div className="flex items-baseline gap-3">
                  <h2 className="text-lg font-semibold tracking-tight">{formatWeekLabel(weekIso)}</h2>
                  <span className="text-xs text-muted-foreground">
                    {Array.from(byClient.values()).reduce((s, a) => s + a.length, 0)} solicitação(ões)
                  </span>
                </div>
                <div className="space-y-4">
                  {Array.from(byClient.entries())
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([client, list]) => (
                      <ClientGroup
                        key={client}
                        client={client}
                        items={list}
                        updates={updates}
                        onChanged={load}
                      />
                    ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} clients={clients} onCreated={load} userId={user?.id} />
      <MovePendingDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        requests={requests}
        initialWeek={selectedWeek === "all" ? toISODate(startOfWeek(new Date())) : selectedWeek}
        onMoved={load}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        setSettings={setSettings}
        userId={user?.id}
      />
    </div>
  );
}

// ---------- Client group ----------
function ClientGroup({
  client,
  items,
  updates,
  onChanged,
}: {
  client: string;
  items: Request[];
  updates: Record<string, Update[]>;
  onChanged: () => void;
}) {
  const pending = items.filter((i) => i.status === "pending").length;
  return (
    <div className="rounded-md border border-primary/60 bg-card/80 overflow-hidden">
      <div className="bg-pattern-hex-light flex items-center justify-between px-4 sm:px-5 py-3 border-b border-primary/60">
        <div className="font-black uppercase tracking-tight text-lg sm:text-xl truncate">
          {client}
        </div>
        <Badge variant={pending ? "default" : "secondary"}>
          {pending} pendente(s) · {items.length} total
        </Badge>
      </div>
      <ul className="divide-y divide-border">
        {items
          .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
          .map((r) => (
            <RequestRow key={r.id} request={r} updates={updates[r.id] || []} onChanged={onChanged} />
          ))}
      </ul>
    </div>
  );
}

// ---------- Request row ----------
function RequestRow({
  request,
  updates,
  onChanged,
}: {
  request: Request;
  updates: Update[];
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [newUpdate, setNewUpdate] = useState("");
  const [busy, setBusy] = useState(false);

  const toggleStatus = async () => {
    setBusy(true);
    const next = request.status === "pending" ? "delivered" : "pending";
    const { error } = await sb
      .from("billing_requests")
      .update({ status: next, delivered_at: next === "delivered" ? new Date().toISOString() : null })
      .eq("id", request.id);
    setBusy(false);
    if (error) return toast.error("Erro ao atualizar status");
    toast.success(next === "delivered" ? "Solicitação finalizada" : "Reaberta");
    onChanged();
  };

  const remove = async () => {
    if (!confirm("Excluir esta solicitação?")) return;
    const { error } = await sb.from("billing_requests").delete().eq("id", request.id);
    if (error) return toast.error("Erro ao excluir");
    toast.success("Excluída");
    onChanged();
  };

  const addUpdate = async () => {
    if (!newUpdate.trim() || !user) return;
    setBusy(true);
    const { error } = await sb.from("billing_request_updates").insert({
      request_id: request.id,
      user_id: user.id,
      content: newUpdate.trim(),
    });
    setBusy(false);
    if (error) return toast.error("Erro ao adicionar atualização");
    setNewUpdate("");
    onChanged();
  };

  return (
    <li className="px-4 sm:px-5 py-3 transition-all duration-200 hover:bg-primary/5 hover:pl-6 hover:shadow-[inset_3px_0_0_hsl(var(--primary))] cursor-default">
      <div className="flex items-start gap-3">
        <button
          onClick={toggleStatus}
          disabled={busy}
          aria-label={request.status === "delivered" ? "Reabrir" : "Marcar como entregue"}
          className={`mt-0.5 h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${
            request.status === "delivered"
              ? "bg-primary border-primary text-primary-foreground"
              : "border-muted-foreground/40 hover:border-primary"
          }`}
        >
          {request.status === "delivered" && <CheckCircle2 className="h-4 w-4" />}
        </button>
        <button onClick={() => setExpanded((v) => !v)} className="flex-1 min-w-0 text-left">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-primary">{request.number}</span>
            <span className={`font-medium ${request.status === "delivered" ? "line-through text-muted-foreground" : ""}`}>
              {request.title}
            </span>
            {updates.length > 0 && (
              <Badge variant="outline" className="text-[10px]">{updates.length} atualização(ões)</Badge>
            )}
          </div>
          {request.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{request.description}</p>
          )}
        </button>
        <Button variant="ghost" size="sm" className="px-2 shrink-0" onClick={remove} aria-label="Excluir">
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>

      {expanded && (
        <div className="mt-3 ml-9 space-y-3">
          {request.description && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{request.description}</p>
          )}
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Atualizações</div>
            {updates.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma atualização ainda.</p>}
            {updates.map((u) => (
              <div key={u.id} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <p className="text-sm whitespace-pre-wrap">{u.content}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {new Date(u.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
            ))}
            <div className="flex items-start gap-2">
              <Textarea
                placeholder="Anotar atualização (ex: 'cliente prometeu retorno hoje')…"
                value={newUpdate}
                onChange={(e) => setNewUpdate(e.target.value)}
                rows={2}
                className="text-sm"
              />
              <Button size="sm" onClick={addUpdate} disabled={busy || !newUpdate.trim()}>
                <MessageSquarePlus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

// ---------- Move pending dialog ----------
function MovePendingDialog({
  open,
  onOpenChange,
  requests,
  initialWeek,
  onMoved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  requests: Request[];
  initialWeek: string;
  onMoved: () => void;
}) {
  const [fromWeek, setFromWeek] = useState(initialWeek);
  const [toWeek, setToWeek] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      const base = initialWeek || toISODate(startOfWeek(new Date()));
      setFromWeek(base);
      const next = new Date(base + "T00:00:00");
      next.setDate(next.getDate() + 7);
      setToWeek(toISODate(next));
      setSelected({});
    }
  }, [open, initialWeek]);

  const weeks = useMemo(() => {
    const set = new Set<string>(requests.map((r) => r.week_start));
    const today = startOfWeek(new Date());
    for (let i = -4; i <= 8; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i * 7);
      set.add(toISODate(d));
    }
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [requests]);

  const pending = useMemo(
    () =>
      requests
        .filter((r) => r.status === "pending" && r.week_start === fromWeek)
        .sort(
          (a, b) =>
            a.client.localeCompare(b.client) ||
            a.number.localeCompare(b.number, undefined, { numeric: true })
        ),
    [requests, fromWeek]
  );

  const allSelected = pending.length > 0 && pending.every((r) => selected[r.id]);
  const toggleAll = () => {
    if (allSelected) setSelected({});
    else {
      const next: Record<string, boolean> = {};
      pending.forEach((r) => (next[r.id] = true));
      setSelected(next);
    }
  };

  const move = async () => {
    const ids = pending.filter((r) => selected[r.id]).map((r) => r.id);
    if (ids.length === 0) return toast.error("Selecione ao menos uma solicitação");
    if (!toWeek) return toast.error("Escolha a semana de destino");
    if (toWeek === fromWeek) return toast.error("A semana de destino deve ser diferente");
    setBusy(true);
    const { error } = await sb
      .from("billing_requests")
      .update({ week_start: toWeek })
      .in("id", ids);
    setBusy(false);
    if (error) return toast.error("Erro ao mover");
    toast.success(`${ids.length} solicitação(ões) movida(s)`);
    onOpenChange(false);
    onMoved();
  };

  const selectedCount = pending.filter((r) => selected[r.id]).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Mover pendentes para outra semana</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>De (origem)</Label>
              <select
                className="mt-1 w-full h-10 rounded-md border border-border bg-card px-3 text-sm"
                value={fromWeek}
                onChange={(e) => {
                  setFromWeek(e.target.value);
                  setSelected({});
                }}
              >
                {weeks.map((w) => (
                  <option key={w} value={w}>{formatWeekLabel(w)}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Para (destino)</Label>
              <select
                className="mt-1 w-full h-10 rounded-md border border-border bg-card px-3 text-sm"
                value={toWeek}
                onChange={(e) => setToWeek(e.target.value)}
              >
                {weeks.map((w) => (
                  <option key={w} value={w}>{formatWeekLabel(w)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-md border border-border overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={pending.length === 0}
                />
                Selecionar tudo
              </label>
              <span className="text-xs text-muted-foreground">
                {selectedCount} de {pending.length} selecionada(s)
              </span>
            </div>
            <div className="max-h-[320px] overflow-y-auto divide-y divide-border">
              {pending.length === 0 ? (
                <p className="px-3 py-6 text-sm text-muted-foreground text-center">
                  Não há solicitações pendentes nesta semana.
                </p>
              ) : (
                pending.map((r) => (
                  <label
                    key={r.id}
                    className="flex items-start gap-3 px-3 py-2 hover:bg-muted/30 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={!!selected[r.id]}
                      onChange={(e) =>
                        setSelected((p) => ({ ...p, [r.id]: e.target.checked }))
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="font-mono text-xs">#{r.number}</Badge>
                        <span className="text-xs font-semibold uppercase tracking-tight text-muted-foreground truncate">
                          {r.client}
                        </span>
                      </div>
                      <p className="text-sm mt-0.5 break-words">{r.title}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={move} disabled={busy || selectedCount === 0}>
            <ArrowRightCircle className="h-4 w-4 mr-2" />
            Mover {selectedCount > 0 ? `(${selectedCount})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Create dialog ----------
function CreateDialog({
  open,
  onOpenChange,
  clients,
  onCreated,
  userId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clients: string[];
  onCreated: () => void;
  userId?: string;
}) {
  const [number, setNumber] = useState("");
  const [client, setClient] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [week, setWeek] = useState(toISODate(startOfWeek(new Date())));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setNumber("");
      setClient("");
      setTitle("");
      setDescription("");
      setWeek(toISODate(startOfWeek(new Date())));
    }
  }, [open]);

  const submit = async () => {
    if (!userId) return;
    if (!number.trim() || !client.trim() || !title.trim()) {
      return toast.error("Preencha número, cliente e título");
    }
    setBusy(true);
    const { error } = await sb.from("billing_requests").insert({
      user_id: userId,
      number: number.trim(),
      client: client.trim(),
      title: title.trim(),
      description: description.trim() || null,
      week_start: week,
    });
    setBusy(false);
    if (error) return toast.error("Erro ao criar");
    toast.success("Solicitação criada");
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova solicitação</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Número</Label>
              <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="5411" />
            </div>
            <div>
              <Label>Semana</Label>
              <Input type="date" value={week} onChange={(e) => setWeek(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Cliente</Label>
            <Input
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Empresa X"
              list="billing-clients"
            />
            <datalist id="billing-clients">
              {clients.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <Label>Título da solicitação</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ajuste de tabela de preço" />
          </div>
          <div>
            <Label>Descrição (opcional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={busy}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Settings dialog ----------
function SettingsDialog({
  open,
  onOpenChange,
  settings,
  setSettings,
  userId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  settings: Settings | null;
  setSettings: (s: Settings) => void;
  userId?: string;
}) {
  const [local, setLocal] = useState<Settings | null>(settings);
  const [newTime, setNewTime] = useState("12:00");
  const [busy, setBusy] = useState(false);
  const [pushStatus, setPushStatus] = useState<"subscribed" | "denied" | "default" | "unsupported">("default");
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (open) setLocal(settings);
  }, [open, settings]);

  useEffect(() => {
    if (open) getPushStatus().then(setPushStatus);
  }, [open]);

  if (!local) return null;

  const enablePush = async () => {
    if (!userId) return;
    setPushBusy(true);
    try {
      await subscribeToPush(userId);
      toast.success("Este dispositivo vai receber notificações.");
      setPushStatus("subscribed");
    } catch (e: any) {
      toast.error(e.message || "Erro ao ativar notificações");
    } finally {
      setPushBusy(false);
    }
  };

  const disablePush = async () => {
    setPushBusy(true);
    try {
      await unsubscribeFromPush();
      toast.success("Dispositivo desinscrito.");
      setPushStatus("default");
    } catch (e: any) {
      toast.error(e.message || "Erro ao desativar");
    } finally {
      setPushBusy(false);
    }
  };

  const sendTest = async () => {
    if (!userId) return;
    setPushBusy(true);
    try {
      const { data, error } = await (supabase as any).functions.invoke("send-billing-notifications", {
        body: { force: true, user_id: userId },
      });
      if (error) throw error;
      if (!data?.sent) toast.warning("Nenhum push enviado — verifique se há solicitações pendentes e se este dispositivo está inscrito.");
      else toast.success(`Notificação de teste enviada (${data.sent}).`);
    } catch (e: any) {
      toast.error(e.message || "Erro no teste");
    } finally {
      setPushBusy(false);
    }
  };

  const save = async () => {
    if (!userId) return;
    setBusy(true);
    const payload = {
      user_id: userId,
      enabled: local.enabled,
      times: local.times,
      weekdays: local.weekdays,
    };
    const { error } = await sb
      .from("billing_notification_settings")
      .upsert(payload, { onConflict: "user_id" });
    setBusy(false);
    if (error) return toast.error("Erro ao salvar");
    setSettings(local);
    toast.success("Configurações salvas");
    onOpenChange(false);
  };

  const addTime = () => {
    if (!/^\d{2}:\d{2}$/.test(newTime)) return;
    if (local.times.includes(newTime)) return;
    setLocal({ ...local, times: [...local.times, newTime].sort() });
  };

  const removeTime = (t: string) => setLocal({ ...local, times: local.times.filter((x) => x !== t) });

  const toggleWd = (n: number) =>
    setLocal({
      ...local,
      weekdays: local.weekdays.includes(n) ? local.weekdays.filter((x) => x !== n) : [...local.weekdays, n].sort(),
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" /> Notificações de cobrança
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Push registration block */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <Smartphone className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Notificações no celular (mesmo com o app fechado)</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  No iPhone: abra este site no Safari, toque em <strong>Compartilhar → Adicionar à Tela de Início</strong>, abra pelo ícone e então ative.
                </p>
              </div>
            </div>
            {pushStatus === "unsupported" && (
              <p className="text-xs text-destructive">Este navegador não suporta push. Abra pelo Chrome (Android) ou Safari (iOS 16.4+) após instalar na tela inicial.</p>
            )}
            {pushStatus === "denied" && (
              <p className="text-xs text-destructive">Permissão de notificação bloqueada — habilite nas configurações do navegador.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {pushStatus !== "subscribed" ? (
                <Button size="sm" onClick={enablePush} disabled={pushBusy || pushStatus === "unsupported" || pushStatus === "denied"}>
                  <Bell className="h-4 w-4 mr-2" /> Ativar neste dispositivo
                </Button>
              ) : (
                <>
                  <Badge variant="default" className="self-center">
                    <Bell className="h-3 w-3 mr-1" /> Inscrito
                  </Badge>
                  <Button size="sm" variant="outline" onClick={disablePush} disabled={pushBusy}>
                    <BellOff className="h-4 w-4 mr-2" /> Desativar aqui
                  </Button>
                  <Button size="sm" variant="outline" onClick={sendTest} disabled={pushBusy}>
                    <Send className="h-4 w-4 mr-2" /> Enviar teste
                  </Button>
                </>
              )}
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={local.enabled}
              onChange={(e) => setLocal({ ...local, enabled: e.target.checked })}
              className="h-4 w-4"
            />
            <span className="text-sm">Receber lembretes para cobrar solicitações pendentes</span>
          </label>

          <div>
            <Label className="text-xs uppercase tracking-wider">Dias da semana</Label>
            <div className="flex gap-1 mt-2 flex-wrap">
              {WEEKDAY_LABELS.map((lbl, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleWd(i)}
                  className={`px-3 py-1.5 rounded-md border text-xs ${
                    local.weekdays.includes(i)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border text-muted-foreground"
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider">Horários do lembrete</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {local.times.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-sm">
                  {t}
                  <button onClick={() => removeTime(t)} aria-label={`Remover ${t}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="w-32" />
              <Button type="button" variant="outline" size="sm" onClick={addTime}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Os lembretes são enviados pelo servidor nos dias e horários escolhidos (hora de São Paulo) para todos os dispositivos inscritos, mesmo com o app fechado, sempre que houver solicitações pendentes.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}