export type ResponsibleProfile = {
  id?: string | null;
  user_id?: string | null;
  full_name?: string | null;
  email?: string | null;
} | null;

export const responsibleDisplayName = (profile: ResponsibleProfile): string => {
  const name = profile?.full_name?.trim();
  const email = profile?.email?.trim();
  return name || email || "Não definido";
};

export const responsibleOptionLabel = (profile: ResponsibleProfile): string => {
  const name = profile?.full_name?.trim();
  const email = profile?.email?.trim();
  if (name && email) return `${name} · ${email}`;
  return name || email || "Usuário sem nome";
};
