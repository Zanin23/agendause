import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
      return json({ error: 'Missing server configuration' }, 500);
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return json({ error: 'Não autenticado' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: 'Sessão inválida' }, 401);
    const caller = userData.user;

    const { data: isAdmin, error: roleErr } = await admin.rpc('has_role', {
      _user_id: caller.id,
      _role: 'admin',
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) return json({ error: 'Acesso restrito a administradores' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();

    if (action === 'list') {
      const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw error;
      const { data: profiles } = await admin.from('profiles').select('id, full_name, active_workspace_id');
      const { data: roles } = await admin.from('user_roles').select('user_id, role');
      const { data: workspaces } = await admin.from('workspaces').select('id, name');

      const pMap = new Map((profiles ?? []).map((p) => [p.id, p]));
      const wMap = new Map((workspaces ?? []).map((w) => [w.id, w.name]));
      const rMap = new Map<string, string[]>();
      for (const r of roles ?? []) {
        rMap.set(r.user_id, [...(rMap.get(r.user_id) ?? []), r.role]);
      }

      const users = (list.users ?? []).map((u) => {
        const p = pMap.get(u.id) as { full_name?: string | null; active_workspace_id?: string | null } | undefined;
        return {
          id: u.id,
          email: u.email ?? null,
          full_name: p?.full_name ?? (u.user_metadata as any)?.full_name ?? null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
          email_confirmed: Boolean(u.email_confirmed_at),
          workspace: p?.active_workspace_id ? wMap.get(p.active_workspace_id) ?? null : null,
          roles: rMap.get(u.id) ?? [],
        };
      });
      users.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return json({ users });
    }

    if (action === 'set_password') {
      const userId = String(body?.user_id || '').trim();
      const password = String(body?.password || '');
      if (!userId) return json({ error: 'user_id é obrigatório' }, 400);
      if (password.length < 6 || password.length > 72) {
        return json({ error: 'A senha deve ter entre 6 e 72 caracteres' }, 400);
      }
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      return json({ success: true });
    }

    if (action === 'send_reset') {
      const email = String(body?.email || '').trim();
      const redirectTo = String(body?.redirect_to || '').trim();
      if (!email) return json({ error: 'email é obrigatório' }, 400);
      const anon = createClient(SUPABASE_URL, ANON_KEY);
      const { error } = await anon.auth.resetPasswordForEmail(
        email,
        redirectTo ? { redirectTo } : undefined,
      );
      if (error) throw error;
      return json({ success: true });
    }

    if (action === 'set_admin') {
      const userId = String(body?.user_id || '').trim();
      const makeAdmin = Boolean(body?.admin);
      if (!userId) return json({ error: 'user_id é obrigatório' }, 400);
      if (userId === caller.id && !makeAdmin) {
        return json({ error: 'Você não pode remover o seu próprio acesso de administrador' }, 400);
      }
      if (makeAdmin) {
        const { error } = await admin
          .from('user_roles')
          .upsert({ user_id: userId, role: 'admin' }, { onConflict: 'user_id,role' });
        if (error) throw error;
      } else {
        const { error } = await admin
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .eq('role', 'admin');
        if (error) throw error;
      }
      return json({ success: true });
    }

    return json({ error: 'Ação inválida' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});