export type ResponsibleProfile = {
  id?: string | null;
  user_id?: string | null;
  full_name?: string | null;
  email?: string | null;
} | null;

export type TrainingResponsibleAssignment = {
  responsible_user_id?: string | null;
  responsible_profile?: ResponsibleProfile;
};

export type TrainingResponsibleOption = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  display_name: string;
};

const RESPONSIBLE_CHOICES = [
  { label: "Matheus Zanin", aliases: ["matheus zanin"] },
  { label: "Pablo Cassiano", aliases: ["pablo cassiano", "el pablon"] },
  { label: "João Pedro", aliases: ["joao pedro", "joao pedro de souza gois"] },
  { label: "Claudinei", aliases: ["claudinei"] },
] as const;

const normalizeName = (name: string | null | undefined): string =>
  (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");

/** Converte os perfis conhecidos nos quatro nomes de exibição autorizados. */
export const canonicalResponsibleName = (profile: ResponsibleProfile): string | null => {
  const normalizedName = normalizeName(profile?.full_name);
  const choice = RESPONSIBLE_CHOICES.find(({ aliases }) =>
    (aliases as readonly string[]).includes(normalizedName),
  );
  return choice?.label ?? null;
};

/** Mantém somente as pessoas autorizadas e na ordem pedida para os campos de seleção. */
export const filterTrainingResponsibleOptions = (
  profiles: Omit<TrainingResponsibleOption, "display_name">[],
): TrainingResponsibleOption[] => {
  const normalizedProfiles = profiles.map((profile) => ({
    profile,
    normalizedName: normalizeName(profile.full_name),
  }));

  return RESPONSIBLE_CHOICES.flatMap(({ label, aliases }) => {
    const match = aliases
      .map((alias) => normalizedProfiles.find(({ normalizedName }) => normalizedName === alias))
      .find((candidate) => candidate !== undefined);
    if (!match) return [];

    return [{
      ...match.profile,
      full_name: label,
      display_name: label,
    }];
  });
};

export const responsibleDisplayName = (profile: ResponsibleProfile): string => {
  const canonicalName = canonicalResponsibleName(profile);
  const name = profile?.full_name?.trim();
  const email = profile?.email?.trim();
  return canonicalName || name || email || "Não definido";
};

export const responsibleOptionLabel = (profile: ResponsibleProfile): string => {
  const canonicalName = canonicalResponsibleName(profile);
  const name = profile?.full_name?.trim();
  const email = profile?.email?.trim();
  return canonicalName || name || email || "Usuário sem nome";
};

export const getTrainingResponsibleIds = (
  assignments: TrainingResponsibleAssignment[] | null | undefined,
  legacyResponsibleUserId?: string | null,
): string[] => {
  const assignedIds = (assignments ?? [])
    .map((assignment) =>
      assignment.responsible_user_id ??
      assignment.responsible_profile?.user_id ??
      assignment.responsible_profile?.id ??
      null,
    )
    .filter((id): id is string => Boolean(id));
  const uniqueIds = Array.from(new Set(assignedIds));
  return uniqueIds.length > 0
    ? uniqueIds
    : legacyResponsibleUserId
      ? [legacyResponsibleUserId]
      : [];
};

/** Retorna os nomes atribuídos; null indica que o treinamento está sem responsável. */
export const trainingResponsibleNames = (
  assignments: TrainingResponsibleAssignment[] | null | undefined,
  legacyProfile?: ResponsibleProfile,
): string | null => {
  const assignedProfiles = (assignments ?? [])
    .map((assignment) => assignment.responsible_profile)
    .filter((profile): profile is Exclude<ResponsibleProfile, null> => Boolean(profile))
    .filter((profile) => Boolean(profile.full_name?.trim() || profile.email?.trim()));

  if (assignedProfiles.length > 0) {
    const names = Array.from(new Set(assignedProfiles.map(responsibleDisplayName)));
    return names.join(", ");
  }

  if (legacyProfile?.full_name?.trim() || legacyProfile?.email?.trim()) {
    return responsibleDisplayName(legacyProfile);
  }

  return null;
};
