import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

/**
 * Rede de segurança contra "tela preta": se qualquer erro de renderização
 * escapar, mostramos uma mensagem legível e a opção de recarregar — nunca
 * uma página em branco sem explicação.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error ?? "Erro desconhecido");
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: "100svh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "#0f172a",
          color: "#e5e7eb",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <p style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "#94a3b8" }}>
            Algo saiu do trilho
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 0 12px" }}>
            Não foi possível abrir o sistema.
          </h1>
          <p style={{ fontSize: 14, color: "#cbd5e1", marginBottom: 20 }}>
            Isso costuma ser uma versão antiga em cache. Recarregue a página — se continuar, limpe os dados do site
            (Ctrl+Shift+R / Cmd+Shift+R) ou fale com o suporte.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              border: "1px solid #f97316",
              background: "#f97316",
              color: "#111827",
              borderRadius: 12,
              padding: "10px 22px",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Recarregar o sistema
          </button>
          {this.state.message ? (
            <p style={{ marginTop: 16, fontSize: 11, color: "#64748b", wordBreak: "break-word" }}>
              Detalhe técnico: {this.state.message}
            </p>
          ) : null}
        </div>
      </div>
    );
  }
}
