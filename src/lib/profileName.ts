export function normalizeProfileName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new Error("Informe um nome com pelo menos 2 caracteres.");
  if (name.length > 80) throw new Error("O nome deve ter no máximo 80 caracteres.");
  return name;
}

export function firstNameOf(value: unknown): string {
  return typeof value === "string" ? value.trim().split(/\s+/)[0] : "";
}

export function greetingForHour(hour: number): string {
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}
