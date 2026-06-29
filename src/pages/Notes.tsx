import { useEffect, useMemo, useState } from "react";
import { StickyNote, Plus, Trash2, Pencil, Save, X, Building2, CalendarDays, PlusCircle, Search, Feather } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Note = {
  id: string;
  user_id: string;
  company: string;
  note_date: string;
  content: string;
  created_at: string;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

const MONTHS_PT = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const WEEKDAYS_PT = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"];

const parseLocalDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
};
const formatDateLong = (d: string) => {
  const dt = parseLocalDate(d);
  return `${WEEKDAYS_PT[dt.getDay()]}, ${dt.getDate()} de ${MONTHS_PT[dt.getMonth()]} de ${dt.getFullYear()}`;
};
const formatTime = (iso: string) => {
  const dt = new Date(iso);
  return dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

const Notes = () => {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [companyInput, setCompanyInput] = useState("");
  const [noteDate, setNoteDate] = useState(todayStr());
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editDate, setEditDate] = useState("");

  const [filter, setFilter] = useState("");

  const [addCompanyOpen, setAddCompanyOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");

  const load = async () => {
    setLoading(true);
    const [notesRes, trainingsRes] = await Promise.all([
      supabase.from("company_notes").select("*").order("note_date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("trainings").select("client").not("client", "is", null),
    ]);
    if (notesRes.error) toast.error(notesRes.error.message);
    const list = (notesRes.data ?? []) as Note[];
    setNotes(list);
    const setNames = new Set<string>();
    list.forEach((n) => setNames.add(n.company));
    (trainingsRes.data ?? []).forEach((t: any) => t.client && setNames.add(t.client));
    setCompanies(Array.from(setNames).sort((a, b) => a.localeCompare(b, "pt-BR")));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const company = (selectedCompany || companyInput).trim();
    if (!company) return toast.error("Selecione ou informe uma empresa");
    if (!content.trim()) return toast.error("Escreva uma anotação");
    setSaving(true);
    const { error } = await supabase.from("company_notes").insert({
      user_id: user.id,
      company,
      note_date: noteDate,
      content: content.trim(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Anotação adicionada");
    setContent("");
    setCompanyInput("");
    if (!selectedCompany) setSelectedCompany(company);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remover esta anotação?")) return;
    const { error } = await supabase.from("company_notes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setNotes((p) => p.filter((n) => n.id !== id));
  };

  const startEdit = (n: Note) => {
    setEditingId(n.id);
    setEditContent(n.content);
    setEditDate(n.note_date);
  };

  const saveEdit = async (id: string) => {
    const { error } = await supabase
      .from("company_notes")
      .update({ content: editContent.trim(), note_date: editDate })
      .eq("id", id);
    if (error) return toast.error(error.message);
    setEditingId(null);
    load();
  };

  const filteredCompanies = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return companies;
    return companies.filter((c) => c.toLowerCase().includes(f));
  }, [companies, filter]);

  const addCompany = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCompanyName.trim();
    if (!name) return toast.error("Informe o nome da empresa");
    if (companies.some((c) => c.toLowerCase() === name.toLowerCase())) {
      const existing = companies.find((c) => c.toLowerCase() === name.toLowerCase())!;
      setSelectedCompany(existing);
      setAddCompanyOpen(false);
      setNewCompanyName("");
      toast.info("Empresa já existente, selecionada na lista");
      return;
    }
    setCompanies((prev) => [...prev, name].sort((a, b) => a.localeCompare(b, "pt-BR")));
    setSelectedCompany(name);
    setAddCompanyOpen(false);
    setNewCompanyName("");
    toast.success("Empresa adicionada. Registre a primeira anotação ao lado.");
  };

  const visibleNotes = useMemo(() => {
    if (!selectedCompany) return [];
    return notes.filter((n) => n.company === selectedCompany);
  }, [notes, selectedCompany]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, Note[]>();
    visibleNotes.forEach((n) => {
      const arr = map.get(n.note_date) ?? [];
      arr.push(n);
      map.set(n.note_date, arr);
    });
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [visibleNotes]);

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Anotações por empresa" description="Registre anotações por empresa e data." path="/anotacoes" />
      <AppHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex items-center gap-2 mb-6">
          <BackButton to="/" />
        </div>

        {/* Vintage editorial header */}
        <header className="mb-10">
          <div className="flex items-center gap-3 text-[11px] tracking-[0.32em] uppercase text-primary/80 mb-3">
            <span className="h-px w-10 bg-primary/50" />
            <Feather className="h-3.5 w-3.5" />
            <span>Caderno de Campo</span>
          </div>
          <h1 className="font-display text-5xl sm:text-6xl leading-[1.05] tracking-tight">
            Anotações <em className="italic text-primary">por empresa</em>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground max-w-xl">
            Um diário para registrar o que importa de cada cliente — escolha a empresa,
            anote o dia e deixe a memória do atendimento por escrito.
          </p>
          <hr className="vintage-rule mt-6" />
        </header>

        <div className="grid lg:grid-cols-[300px_1fr] gap-8 lg:gap-10">
          {/* Sidebar empresas — directory style */}
          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="flex items-center justify-between">
              <span className="text-[11px] tracking-[0.28em] uppercase text-muted-foreground">
                Diretório
              </span>
              <Dialog open={addCompanyOpen} onOpenChange={setAddCompanyOpen}>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    title="Adicionar empresa"
                    className="inline-flex items-center gap-1.5 text-[11px] tracking-[0.18em] uppercase text-primary hover:text-primary/80 transition-colors"
                  >
                    <PlusCircle className="h-3.5 w-3.5" /> Nova
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Adicionar empresa</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={addCompany} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>Nome da empresa</Label>
                      <Input
                        autoFocus
                        value={newCompanyName}
                        onChange={(e) => setNewCompanyName(e.target.value)}
                        placeholder="Ex.: Agropecuária 2 Irmãos"
                      />
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="ghost" onClick={() => setAddCompanyOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit">
                        <Plus className="h-4 w-4" /> Adicionar
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {/* Vintage search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar empresa…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-9 h-10 bg-transparent border-x-0 border-t-0 border-b border-border rounded-none focus-visible:ring-0 focus-visible:border-primary"
              />
            </div>

            <ul className="max-h-[60vh] overflow-y-auto -mx-2 pr-1">
              {filteredCompanies.length === 0 && (
                <li className="px-2 py-3 text-sm text-muted-foreground italic">
                  Nenhuma empresa ainda.
                </li>
              )}
              {filteredCompanies.map((c) => {
                const count = notes.filter((n) => n.company === c).length;
                const active = selectedCompany === c;
                return (
                  <li key={c}>
                    <button
                      onClick={() => setSelectedCompany(c)}
                      className={`group w-full text-left px-2 py-2.5 flex items-center gap-3 border-b border-border/50 transition-colors ${
                        active ? "text-primary" : "hover:text-foreground text-muted-foreground"
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-md text-[10px] font-semibold tracking-wider shrink-0 transition-colors ${
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary"
                        }`}
                      >
                        {initials(c) || <Building2 className="h-3.5 w-3.5" />}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-sm font-medium">{c}</span>
                      <span
                        className={`shrink-0 text-[10px] tracking-widest uppercase ${
                          active ? "text-primary" : "text-muted-foreground/70"
                        }`}
                      >
                        {String(count).padStart(2, "0")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Painel principal */}
          <section className="space-y-10 min-w-0">
            {/* Compositor */}
            <div className="paper-surface rounded-2xl border border-border/70 p-6 sm:p-7 relative overflow-hidden">
              <div className="relative flex items-center justify-between mb-5">
                <div className="flex items-center gap-2 text-[11px] tracking-[0.28em] uppercase text-primary/80">
                  <Feather className="h-3.5 w-3.5" />
                  Nova entrada
                </div>
                <div className="hidden sm:block text-[11px] tracking-[0.22em] uppercase text-muted-foreground">
                  {selectedCompany || "Empresa não selecionada"}
                </div>
              </div>

              <form onSubmit={submit} className="relative space-y-5">
                <div className="grid sm:grid-cols-[1fr_180px] gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground">
                      Empresa
                    </Label>
                    {companies.length > 0 && (
                      <select
                        value={selectedCompany}
                        onChange={(e) => {
                          setSelectedCompany(e.target.value);
                          setCompanyInput("");
                        }}
                        className="flex h-10 w-full bg-transparent border-x-0 border-t-0 border-b border-border rounded-none px-0 text-base font-display focus-visible:outline-none focus-visible:border-primary"
                      >
                        <option value="">— Nova empresa —</option>
                        {companies.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    )}
                    {!selectedCompany && (
                      <Input
                        placeholder="Nome da empresa"
                        value={companyInput}
                        onChange={(e) => setCompanyInput(e.target.value)}
                        className="mt-2 bg-transparent border-x-0 border-t-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary"
                      />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground">
                      Dia
                    </Label>
                    <Input
                      type="date"
                      value={noteDate}
                      onChange={(e) => setNoteDate(e.target.value)}
                      className="bg-transparent border-x-0 border-t-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary font-display text-base"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground">
                    Anotação
                  </Label>
                  <Textarea
                    rows={3}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Escreva aqui o que precisa registrar sobre esta empresa neste dia…"
                    className="bg-background/40 border-border/70 rounded-lg text-[15px] leading-relaxed resize-none focus-visible:border-primary"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] italic text-muted-foreground">
                    {content.length} caracteres
                  </span>
                  <Button type="submit" disabled={saving} className="rounded-full px-5">
                    <Feather className="h-4 w-4" />
                    {saving ? "Salvando…" : "Registrar"}
                  </Button>
                </div>
              </form>
            </div>

            {/* Lista */}
            {!selectedCompany ? (
              <div className="text-center py-16 px-6 border border-dashed border-border/60 rounded-2xl">
                <CalendarDays className="h-7 w-7 text-primary/60 mx-auto mb-3" />
                <p className="font-display text-2xl">Escolha uma empresa para começar</p>
                <p className="text-sm text-muted-foreground mt-1">
                  As anotações aparecerão organizadas por data.
                </p>
              </div>
            ) : loading ? (
              <div className="text-sm italic text-muted-foreground">Carregando…</div>
            ) : groupedByDate.length === 0 ? (
              <div className="text-center py-16 px-6 border border-dashed border-border/60 rounded-2xl">
                <p className="font-display text-2xl">Nada anotado ainda</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Comece registrando a primeira observação sobre{" "}
                  <strong className="text-foreground not-italic">{selectedCompany}</strong>.
                </p>
              </div>
            ) : (
              <div className="space-y-10">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-display text-3xl leading-none">
                    {selectedCompany}
                  </h2>
                  <span className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground">
                    {visibleNotes.length} {visibleNotes.length === 1 ? "entrada" : "entradas"}
                  </span>
                </div>

                {groupedByDate.map(([date, items]) => {
                  const dt = parseLocalDate(date);
                  return (
                    <div key={date} className="relative">
                      <div className="flex items-center gap-4 mb-4">
                        <span className="date-stamp">
                          <span className="day">{String(dt.getDate()).padStart(2, "0")}</span>
                          <span className="mon">{MONTHS_PT[dt.getMonth()]}</span>
                        </span>
                        <div className="min-w-0">
                          <div className="font-display text-xl leading-tight capitalize">
                            {formatDateLong(date).split(",")[0]}
                          </div>
                          <div className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground">
                            {formatDateLong(date).split(", ")[1]}
                          </div>
                        </div>
                        <hr className="vintage-rule flex-1 ml-2" />
                      </div>

                      <div className="pl-[72px] space-y-3">
                        {items.map((n) => (
                          <article
                            key={n.id}
                            className="group relative rounded-xl border border-border/60 bg-card/60 hover:border-primary/40 hover:bg-card transition-colors"
                          >
                            <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r bg-primary/0 group-hover:bg-primary/70 transition-colors" />
                            <div className="p-4 sm:p-5">
                              {editingId === n.id ? (
                                <div className="space-y-2">
                                  <Input
                                    type="date"
                                    value={editDate}
                                    onChange={(e) => setEditDate(e.target.value)}
                                  />
                                  <Textarea
                                    rows={3}
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value)}
                                  />
                                  <div className="flex justify-end gap-2">
                                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                      <X className="h-4 w-4" /> Cancelar
                                    </Button>
                                    <Button size="sm" onClick={() => saveEdit(n.id)}>
                                      <Save className="h-4 w-4" /> Salvar
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start gap-3">
                                  <div className="flex-1 min-w-0">
                                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/95">
                                      {n.content}
                                    </p>
                                    <p className="mt-3 text-[11px] tracking-[0.22em] uppercase text-muted-foreground/80">
                                      Registrado às {formatTime(n.created_at)}
                                    </p>
                                  </div>
                                  {user?.id === n.user_id && (
                                    <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(n)}>
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(n.id)}>
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default Notes;