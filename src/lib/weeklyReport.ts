type FunctionError = { name?: string; message?: string; context?: unknown };

/** FunctionsHttpError guarda o JSON de erro em context, não em message. */
export async function weeklyReportError(error: FunctionError): Promise<string> {
  if (error.context instanceof Response) {
    const response = error.context;
    if (response.status === 401) return "Sua sessão expirou. Saia e entre novamente.";
    if (response.status === 403) return "Você não tem permissão para gerar relatórios.";
    if (response.status === 404) return "A função weekly-report não está publicada no Supabase deste site. Solicite a publicação ao administrador.";
    try {
      const body = await response.clone().json();
      if (typeof body?.error === "string" && body.error.trim()) return body.error;
    } catch { /* O gateway pode responder sem JSON. */ }
    if (response.status === 402) return "Créditos de IA esgotados. Adicione créditos no workspace para continuar.";
    if (response.status === 429) return "Limite de requisições atingido. Tente novamente em instantes.";
    if (response.status === 504) return "A IA demorou demais para responder. Tente novamente ou selecione um período menor.";
    return "O serviço de relatórios está indisponível. Tente novamente em instantes.";
  }
  if (error.name === "FunctionsFetchError" || error.name === "FunctionsRelayError") {
    return "Não foi possível acessar a função weekly-report. Verifique a conexão e se ela está publicada no Supabase deste site.";
  }
  return error.message || "Não foi possível gerar o relatório. Tente novamente.";
}

export function validReportRange(start: string, end: string): boolean {
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  return validDate(start) && validDate(end) && end >= start;
}
