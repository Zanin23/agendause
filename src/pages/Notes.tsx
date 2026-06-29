import { useEffect, useMemo, useState } from "react";
import { StickyNote, Plus, Trash2, Pencil, Save, X, Building2, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
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

const formatDate = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex items-center gap-2 mb-4">
          <BackButton to="/" />
        </div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <StickyNote className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Anotações por empresa</h1>
            <p className="text-sm text-muted-foreground">Selecione a empresa, o dia e registre suas observações.</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-[280px_1fr] gap-6">
          {/* Sidebar empresas */}
          <aside className="space-y-3">
            <Input
              placeholder="Buscar empresa..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="rounded-xl border border-border bg-card divide-y divide-border max-h-[60vh] overflow-y-auto">
              {filteredCompanies.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground">Nenhuma empresa ainda. Adicione uma anotação ao lado.</div>
              )}
              {filteredCompanies.map((c) => {
                const count = notes.filter((n) => n.company === c).length;
                const active = selectedCompany === c;
                return (
                  <button
                    key={c}
                    onClick={() => setSelectedCompany(c)}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between gap-2 transition-colors ${
                      active ? "bg-primary/10 text-primary" : "hover:bg-muted"
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Building2 className="h-4 w-4 shrink-0" />
                      <span className="truncate text-sm font-medium">{c}</span>
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">{count}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Painel principal */}
          <section className="space-y-6">
            <Card>
              <CardContent className="p-5">
                <form onSubmit={submit} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Empresa</Label>
                      {companies.length > 0 ? (
                        <div className="flex gap-2">
                          <select
                            value={selectedCompany}
                            onChange={(e) => {
                              setSelectedCompany(e.target.value);
                              setCompanyInput("");
                            }}
                            className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                          >
                            <option value="">— Nova empresa —</option>
                            {companies.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                      {!selectedCompany && (
                        <Input
                          placeholder="Nome da empresa"
                          value={companyInput}
                          onChange={(e) => setCompanyInput(e.target.value)}
                        />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Dia</Label>
                      <Input type="date" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Anotação</Label>
                    <Textarea
                      rows={3}
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="Escreva aqui o que precisa registrar sobre esta empresa neste dia..."
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" disabled={saving}>
                      <Plus className="h-4 w-4" />
                      {saving ? "Salvando..." : "Adicionar anotação"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {!selectedCompany ? (
              <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
                Selecione uma empresa para ver as anotações.
              </div>
            ) : loading ? (
              <div className="text-sm text-muted-foreground">Carregando...</div>
            ) : groupedByDate.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
                Nenhuma anotação para <strong className="text-foreground">{selectedCompany}</strong> ainda.
              </div>
            ) : (
              <div className="space-y-6">
                {groupedByDate.map(([date, items]) => (
                  <div key={date}>
                    <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-muted-foreground">
                      <CalendarDays className="h-4 w-4 text-primary" />
                      {formatDate(date)}
                    </div>
                    <div className="space-y-2">
                      {items.map((n) => (
                        <Card key={n.id} className="transition-colors hover:border-primary/40">
                          <CardContent className="p-4">
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
                                <p className="flex-1 whitespace-pre-wrap text-sm leading-relaxed">{n.content}</p>
                                {user?.id === n.user_id && (
                                  <div className="flex gap-1 shrink-0">
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
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default Notes;