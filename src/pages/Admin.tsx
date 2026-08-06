import { useCallback, useEffect, useMemo, useState } from "react";
import { Shield, ShieldCheck, Search, KeyRound, Loader2, Mail, RefreshCw, UserCog, UserPlus, Eye, EyeOff, LayoutGrid, ClipboardList, CheckCircle2, Lock, Unlock, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type AdminUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  workspace: string | null;
  roles: string[];
  screen_permissions: any[];
  schedule_permissions: Record<string, string>;
};

type LiteSchedule = {
  id: string;
  client_name: string;
};

const formatDate = (v?: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

const Admin = () => {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useIsAdmin();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [allSchedules, setAllSchedules] = useState<LiteSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [editPermsTarget, setEditPermsTarget] = useState<AdminUser | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newUser, setNewUser] = useState({ 
    email: "", 
    fullName: "", 
    password: "", 
    role: "member" as "admin" | "member",
    screen_permissions: [] as string[],
    schedule_permissions: {} as Record<string, string>
  });

  const call = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("admin-users", { body: payload });
    if (error) {
      let serverMsg: string | null = (data as any)?.error ?? null;
      const ctx = (error as any)?.context;
      if (!serverMsg && ctx && typeof ctx.json === "function") {
        try {
          const body = await ctx.json();
          serverMsg = body?.error ?? null;
        } catch {
          /* corpo não é JSON */
        }
      }
      throw new Error(serverMsg || error.message);
    }
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await call({ action: "list" });
      setUsers(data.users ?? []);
      setAllSchedules(data.all_schedules ?? []);
    } catch (e: any) {
      toast.error(e.message || "Erro ao carregar contas");
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    if (!roleLoading && isAdmin) load();
    if (!roleLoading && !isAdmin) setLoading(false);
  }, [roleLoading, isAdmin, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.full_name ?? "").toLowerCase().includes(q),
    );
  }, [users, query]);

  const savePassword = async () => {
    if (!target) return;
    if (password.length < 6) return toast.error("A senha deve ter pelo menos 6 caracteres");
    if (password !== confirm) return toast.error("As senhas não coincidem");
    try {
      setSaving(true);
      await call({ action: "set_password", user_id: target.id, password });
      toast.success(`Senha de ${target.email} atualizada`);
      setTarget(null);
      setPassword("");
      setConfirm("");
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar senha");
    } finally {
      setSaving(false);
    }
  };

  const sendReset = async (u: AdminUser) => {
    if (!u.email) return;
    try {
      setBusyId(u.id);
      await call({ action: "send_reset", email: u.email, redirect_to: `${window.location.origin}/auth` });
      toast.success("E-mail de redefinição enviado");
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar e-mail");
    } finally {
      setBusyId(null);
    }
  };

  const toggleAdmin = async (u: AdminUser) => {
    const makeAdmin = !u.roles.includes("admin");
    try {
      setBusyId(u.id);
      await call({ action: "set_admin", user_id: u.id, admin: makeAdmin });
      setUsers((prev) =>
        prev.map((p) =>
          p.id === u.id
            ? { ...p, roles: makeAdmin ? [...p.roles, "admin"] : p.roles.filter((r) => r !== "admin") }
            : p,
        ),
      );
      toast.success(makeAdmin ? "Agora é administrador" : "Acesso de administrador removido");
    } catch (e: any) {
      toast.error(e.message || "Erro ao alterar permissão");
    } finally {
      setBusyId(null);
    }
  };

  const createUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.fullName) {
      return toast.error("Preencha todos os campos obrigatórios");
    }
    if (newUser.password.length < 6) {
      return toast.error("A senha deve ter pelo menos 6 caracteres");
    }
    try {
      setSaving(true);
      await call({ 
        action: "create_user", 
        email: newUser.email, 
        password: newUser.password, 
        full_name: newUser.fullName,
        role: newUser.role,
        screen_permissions: newUser.screen_permissions,
        schedule_permissions: newUser.schedule_permissions
      });
      toast.success(`Usuário ${newUser.email} criado com sucesso`);
      setIsCreating(false);
      setNewUser({ 
        email: "", 
        fullName: "", 
        password: "", 
        role: "member",
        screen_permissions: [],
        schedule_permissions: {}
      });
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar usuário");
    } finally {
      setSaving(false);
    }
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <SEO title="Administração — TreinaCheck" description="Área administrativa do sistema." path="/admin" />
        <AppHeader />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
          <BackButton />
          <section className="mt-6 rounded-2xl border border-border bg-card/60 p-8 text-center">
            <Shield className="h-10 w-10 mx-auto text-muted-foreground" />
            <h1 className="text-2xl font-semibold mt-4">Acesso restrito</h1>
            <p className="text-muted-foreground mt-2">
              Somente administradores podem visualizar as contas do sistema.
            </p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Controle de Acessos — TreinaCheck" description="Gerencie contas e permissões do sistema." path="/admin" />
      <AppHeader />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
        <div>
          <BackButton />
          <div className="flex flex-wrap items-end justify-between gap-3 mt-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Controle de Acessos</h1>
              <p className="text-muted-foreground mt-1">
                Gerencie os usuários e permissões administrativas do sistema.
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setIsCreating(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Novo Usuário
              </Button>
              <Button variant="outline" onClick={load} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-2">Atualizar</span>
              </Button>
            </div>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="py-16 text-center text-muted-foreground">Carregando contas...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">Nenhuma conta encontrada.</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((u) => {
              const admin = u.roles.includes("admin");
              return (
                <article
                  key={u.id}
                  className="rounded-2xl border border-border bg-card/60 p-4 sm:p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-semibold truncate">{u.full_name || "Sem nome"}</h2>
                      {admin && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5">
                          <ShieldCheck className="h-3 w-3" /> Admin
                        </span>
                      )}
                      {!u.email_confirmed && (
                        <span className="rounded-full bg-muted text-muted-foreground text-xs px-2 py-0.5">
                          E-mail não confirmado
                        </span>
                      )}
                      {u.id === user?.id && (
                        <span className="rounded-full bg-muted text-muted-foreground text-xs px-2 py-0.5">
                          Você
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Base: {u.workspace ?? "—"} · Criada em {formatDate(u.created_at)} · Último acesso{" "}
                      {formatDate(u.last_sign_in_at)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditPermsTarget(u)}
                      disabled={admin}
                      title={admin ? "Administradores têm acesso total" : "Editar permissões"}
                    >
                      <Lock className="h-4 w-4 mr-2" /> Permissões
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setTarget(u);
                        setPassword("");
                        setConfirm("");
                      }}
                    >
                      <KeyRound className="h-4 w-4 mr-2" /> Definir senha
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => sendReset(u)}
                      disabled={busyId === u.id || !u.email}
                    >
                      <Mail className="h-4 w-4 mr-2" /> Enviar redefinição
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleAdmin(u)}
                      disabled={busyId === u.id || u.id === user?.id}
                    >
                      <UserCog className="h-4 w-4 mr-2" />
                      {admin ? "Remover admin" : "Tornar admin"}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Definir nova senha</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A senha de <strong>{target?.email}</strong> será alterada imediatamente.
            </p>
            <div className="space-y-2">
              <Label htmlFor="new-pass">Nova senha</Label>
              <Input
                id="new-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pass">Confirmar senha</Label>
              <Input
                id="confirm-pass"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={savePassword} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
              Salvar senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar novo usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-name">Nome Completo</Label>
              <Input
                id="new-name"
                value={newUser.fullName}
                onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                placeholder="Ex: João Silva"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-email">E-mail</Label>
              <Input
                id="new-email"
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="usuario@exemplo.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-pass-user">Senha Inicial</Label>
              <Input
                id="new-pass-user"
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div className="space-y-4">
              <Label>Permissões</Label>
              
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-2">
                  <LayoutGrid className="h-3 w-3" /> Telas acessíveis
                </Label>
                <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border bg-muted/30">
                  {[
                    { id: 'schedules', label: 'Cronogramas' },
                    { id: 'reports', label: 'Relatórios' },
                    { id: 'notes', label: 'Notas' }
                  ].map((screen) => (
                    <div key={screen.id} className="flex items-center space-x-2">
                      <Checkbox 
                        id={`new-screen-${screen.id}`}
                        disabled={newUser.role === 'admin'}
                        checked={newUser.role === 'admin' || newUser.screen_permissions.some(p => (p as any).screen === screen.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setNewUser(prev => ({
                              ...prev,
                              screen_permissions: [...prev.screen_permissions, { screen: screen.id, actions: ['read', 'write'] }]
                            }));
                          } else {
                            setNewUser(prev => ({
                              ...prev,
                              screen_permissions: prev.screen_permissions.filter(p => (p as any).screen !== screen.id)
                            }));
                          }
                        }}
                      />
                      <label htmlFor={`new-screen-${screen.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        {screen.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-2">
                  <ClipboardList className="h-3 w-3" /> Acesso a Cronogramas específicos
                </Label>
                <div className="max-h-[200px] overflow-y-auto space-y-2 p-3 rounded-lg border bg-muted/30">
                  {allSchedules.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-2 italic">Nenhum cronograma cadastrado.</div>
                  ) : allSchedules.map((s) => {
                    const currentMode = newUser.schedule_permissions[s.id];
                    return (
                      <div key={s.id} className="flex items-center justify-between gap-2 p-1.5 rounded border bg-card/50">
                        <span className="text-xs font-medium truncate flex-1">{s.client_name}</span>
                        <div className="flex gap-1 shrink-0">
                          <Button 
                            variant={currentMode === 'read' ? 'default' : 'outline'} 
                            size="icon" 
                            className="h-6 w-6" 
                            disabled={newUser.role === 'admin'}
                            onClick={() => {
                              const next = { ...newUser.schedule_permissions };
                              if (currentMode === 'read') delete next[s.id];
                              else next[s.id] = 'read';
                              setNewUser(prev => ({ ...prev, schedule_permissions: next }));
                            }}
                            title="Somente visualizar"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button 
                            variant={currentMode === 'write' ? 'default' : 'outline'} 
                            size="icon" 
                            className="h-6 w-6" 
                            disabled={newUser.role === 'admin'}
                            onClick={() => {
                              const next = { ...newUser.schedule_permissions };
                              if (currentMode === 'write') delete next[s.id];
                              else next[s.id] = 'write';
                              setNewUser(prev => ({ ...prev, schedule_permissions: next }));
                            }}
                            title="Visualizar e Alterar"
                          >
                            <UserCog className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground italic">
                  * Se o usuário tiver permissão na tela "Cronogramas", ele verá todos da base. Use esta seção para restringir a cronogramas específicos se ele NÃO tiver a tela de Cronogramas habilitada.
                </p>
              </div>

              <div className="space-y-2 mt-4 pt-4 border-t">
                <Label>Cargo</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="role"
                      checked={newUser.role === "member"}
                      onChange={() => setNewUser({ ...newUser, role: "member" })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Usuário Padrão</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-primary">
                    <input
                      type="radio"
                      name="role"
                      checked={newUser.role === "admin"}
                      onChange={() => setNewUser({ ...newUser, role: "admin" })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" /> Administrador
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCreating(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={createUser} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
              Criar Usuário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editPermsTarget} onOpenChange={(o) => !o && setEditPermsTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Permissões de {editPermsTarget?.full_name || editPermsTarget?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-2">
                <LayoutGrid className="h-3 w-3" /> Telas acessíveis
              </Label>
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border bg-muted/30">
                {[
                  { id: 'schedules', label: 'Cronogramas' },
                  { id: 'reports', label: 'Relatórios' },
                  { id: 'notes', label: 'Notas' }
                ].map((screen) => (
                  <div key={screen.id} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`edit-screen-${screen.id}`}
                      checked={editPermsTarget?.screen_permissions?.some(p => (p as any).screen === screen.id)}
                      onCheckedChange={(checked) => {
                        if (!editPermsTarget) return;
                        let nextScreens = [...(editPermsTarget.screen_permissions || [])];
                        if (checked) {
                          nextScreens.push({ screen: screen.id, actions: ['read', 'write'] });
                        } else {
                          nextScreens = nextScreens.filter(p => (p as any).screen !== screen.id);
                        }
                        setEditPermsTarget({ ...editPermsTarget, screen_permissions: nextScreens });
                      }}
                    />
                    <label htmlFor={`edit-screen-${screen.id}`} className="text-sm font-medium leading-none">
                      {screen.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-2">
                <ClipboardList className="h-3 w-3" /> Acesso a Cronogramas específicos
              </Label>
              <div className="max-h-[250px] overflow-y-auto space-y-2 p-3 rounded-lg border bg-muted/30">
                {allSchedules.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-2 italic">Nenhum cronograma cadastrado.</div>
                ) : allSchedules.map((s) => {
                  const currentMode = editPermsTarget?.schedule_permissions?.[s.id];
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-2 p-1.5 rounded border bg-card/50">
                      <span className="text-xs font-medium truncate flex-1">{s.client_name}</span>
                      <div className="flex gap-1 shrink-0">
                        <Button 
                          variant={currentMode === 'read' ? 'default' : 'outline'} 
                          size="icon" 
                          className="h-6 w-6" 
                          onClick={() => {
                            if (!editPermsTarget) return;
                            const next = { ...(editPermsTarget.schedule_permissions || {}) };
                            if (currentMode === 'read') delete next[s.id];
                            else next[s.id] = 'read';
                            setEditPermsTarget({ ...editPermsTarget, schedule_permissions: next });
                          }}
                          title="Somente visualizar"
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button 
                          variant={currentMode === 'write' ? 'default' : 'outline'} 
                          size="icon" 
                          className="h-6 w-6" 
                          onClick={() => {
                            if (!editPermsTarget) return;
                            const next = { ...(editPermsTarget.schedule_permissions || {}) };
                            if (currentMode === 'write') delete next[s.id];
                            else next[s.id] = 'write';
                            setEditPermsTarget({ ...editPermsTarget, schedule_permissions: next });
                          }}
                          title="Visualizar e Alterar"
                        >
                          <UserCog className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditPermsTarget(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button 
              onClick={async () => {
                if (!editPermsTarget) return;
                try {
                  setSaving(true);
                  await call({
                    action: 'set_permissions',
                    user_id: editPermsTarget.id,
                    screen_permissions: editPermsTarget.screen_permissions,
                    schedule_permissions: editPermsTarget.schedule_permissions
                  });
                  toast.success("Permissões atualizadas");
                  setEditPermsTarget(null);
                  load();
                } catch (e: any) {
                  toast.error(e.message || "Erro ao salvar permissões");
                } finally {
                  setSaving(false);
                }
              }} 
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar Permissões
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;