// Links compartilhados com clientes precisam apontar para o domínio público.
// O ambiente de preview (id-preview--*.lovable.app) exige login na Lovable,
// então nunca deve ser usado em links de aceite/termo enviados a terceiros.
const PUBLIC_ORIGIN = "https://agendause.lovable.app";

export const publicOrigin = () => {
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const isInternal =
    host.includes("id-preview") ||
    host.includes("lovableproject.com") ||
    host === "localhost" ||
    host === "127.0.0.1";
  return isInternal ? PUBLIC_ORIGIN : window.location.origin;
};

export const publicUrl = (path: string) => `${publicOrigin()}${path}`;
