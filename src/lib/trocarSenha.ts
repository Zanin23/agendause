/* ---------------------------------------------------------------------------
   Trocar a própria senha de acesso (Configurações → Senha de acesso).

   Regras que valem a pena lembrar:
   · o Supabase exige pelo menos 6 caracteres;
   · o bcrypt (o algoritmo do Supabase) ignora tudo além de 72 bytes — senha
     maior que isso é recusada em vez de aceita pela metade;
   · antes de trocar, confirmamos a senha atual: sem isso, qualquer pessoa que
     chegue num computador com a sessão aberta trocaria a senha do dono.

   Tudo aqui é função pura (o cliente de autenticação entra por parâmetro), para
   poder ser testado sem navegador.
--------------------------------------------------------------------------- */

import { explicarErroDeLogin, extrairErroAuth } from "./authErrors.ts";

export const TAMANHO_MINIMO = 6;
export const TAMANHO_MAXIMO = 72;

export type CampoDeSenha = "atual" | "nova" | "confirmar";

export type DadosTrocaDeSenha = {
  email: string | null | undefined;
  atual: string;
  nova: string;
  confirmar: string;
};

export type ProblemaDeSenha = { campo: CampoDeSenha; mensagem: string };

/** O cliente do Supabase, reduzido ao que a troca de senha usa. */
export type ClienteDeSenha = {
  signInWithPassword: (credenciais: { email: string; password: string }) => Promise<{ error: unknown | null }>;
  updateUser: (atributos: { password: string; current_password?: string }) => Promise<{ error: unknown | null }>;
};

export type ResultadoTrocaDeSenha =
  | { ok: true; campo?: undefined; mensagem?: undefined }
  | { ok: false; campo?: CampoDeSenha; mensagem: string };

/* --------------------------------------------------------------- validação */

/** Confere o formulário antes de falar com o servidor. `null` = pode enviar. */
export function validarTrocaDeSenha(dados: DadosTrocaDeSenha): ProblemaDeSenha | null {
  if (!dados.email) {
    return { campo: "atual", mensagem: "Não foi possível identificar seu e-mail nesta sessão. Saia e entre novamente." };
  }
  if (!dados.atual) {
    return { campo: "atual", mensagem: "Informe a sua senha atual para confirmar a troca." };
  }
  if (!dados.nova) {
    return { campo: "nova", mensagem: "Informe a nova senha." };
  }
  if (dados.nova.length < TAMANHO_MINIMO) {
    return { campo: "nova", mensagem: `A nova senha precisa ter pelo menos ${TAMANHO_MINIMO} caracteres.` };
  }
  if (dados.nova.length > TAMANHO_MAXIMO) {
    return { campo: "nova", mensagem: `A nova senha é longa demais (o limite é ${TAMANHO_MAXIMO} caracteres).` };
  }
  if (dados.nova === dados.atual) {
    return { campo: "nova", mensagem: "A nova senha precisa ser diferente da atual." };
  }
  if (!dados.confirmar) {
    return { campo: "confirmar", mensagem: "Repita a nova senha para não digitar errado." };
  }
  if (dados.confirmar !== dados.nova) {
    return { campo: "confirmar", mensagem: "As duas novas senhas não são iguais." };
  }
  return null;
}

/* ------------------------------------------------------------------- força */

export type NivelDeForca = "curta" | "fraca" | "media" | "boa" | "forte";

export type ForcaDaSenha = {
  nivel: NivelDeForca;
  rotulo: string;
  dica: string;
  /** false só quando a senha nem pode ser enviada (curta ou comum demais). */
  aceita: boolean;
  /** 0 a 4, para a barrinha da interface. */
  nivelVisual: number;
};

/** Senhas conhecidas por serem as primeiras tentativas de qualquer ataque. */
const SENHAS_COMUNS = [
  "123456", "1234567", "12345678", "123456789", "1234567890",
  "senha123", "senha1234", "password", "password1", "qwerty", "qwerty123",
  "111111", "abc123", "admin123", "treinacheck", "agendause", "usesistemas",
  "brasil123", "mudar123", "trocar123",
];

/** Avalia a força da senha nova (só orientação: quem manda é o servidor). */
export function classificarForca(nova: string): ForcaDaSenha {
  const senha = nova || "";
  const comum = SENHAS_COMUNS.includes(senha.trim().toLowerCase());

  if (senha.length < TAMANHO_MINIMO) {
    return {
      nivel: "curta",
      rotulo: "Muito curta",
      dica: `Use pelo menos ${TAMANHO_MINIMO} caracteres.`,
      aceita: false,
      nivelVisual: 0,
    };
  }

  if (comum) {
    return {
      nivel: "fraca",
      rotulo: "Fraca",
      dica: "Essa senha é muito comum — escolha outra que só você conheça.",
      aceita: false,
      nivelVisual: 1,
    };
  }

  const temMinuscula = /[a-z]/.test(senha);
  const temMaiuscula = /[A-Z]/.test(senha);
  const temNumero = /\d/.test(senha);
  const temSimbolo = /[^A-Za-z0-9]/.test(senha);

  let pontos = 0;
  if (senha.length >= 8) pontos += 1;
  if (senha.length >= 12) pontos += 1;
  if (temMinuscula && temMaiuscula) pontos += 1;
  if (temNumero) pontos += 1;
  if (temSimbolo) pontos += 1;
  // só números (ou só letras repetidas) nunca passa de fraca
  if (/^\d+$/.test(senha)) pontos = Math.min(pontos, 1);

  if (pontos >= 5) {
    return { nivel: "forte", rotulo: "Forte", dica: "Ótima escolha.", aceita: true, nivelVisual: 4 };
  }
  if (pontos >= 4) {
    return { nivel: "boa", rotulo: "Boa", dica: "Boa escolha — bem difícil de adivinhar.", aceita: true, nivelVisual: 3 };
  }
  if (pontos >= 2) {
    return {
      nivel: "media",
      rotulo: "Média",
      dica: "Está no caminho: misture maiúsculas, números ou um símbolo para ficar forte.",
      aceita: true,
      nivelVisual: 2,
    };
  }
  return {
    nivel: "fraca",
    rotulo: "Fraca",
    dica: "Misture letras, números e um símbolo para ficar mais difícil de adivinhar.",
    aceita: true,
    nivelVisual: 1,
  };
}

/* --------------------------------------------------------------- traduções */

/** Converte o erro cru do Supabase ao gravar a senha em uma frase útil. */
export function explicarErroDeSenha(erro: unknown): string {
  const { mensagem } = extrairErroAuth(erro);
  const m = `${mensagem}`.toLowerCase();

  if (/weak|easy to guess|pwned|leaked|compromised/.test(m))
    return "Esta senha apareceu em vazamentos conhecidos e foi recusada por segurança. Escolha outra (letras, números e um símbolo).";
  if (/should be at least|at least \d+ characters|too short|password.*short/.test(m))
    return `A senha é curta demais — use pelo menos ${TAMANHO_MINIMO} caracteres.`;
  if (/longer than|password.*length|72/.test(m))
    return `A senha é longa demais (o limite é ${TAMANHO_MAXIMO} caracteres).`;
  if (/different from the old|same as the old|should be different/.test(m))
    return "A nova senha precisa ser diferente da atual.";
  if (/current password|reauthentication|nonce|reauth/.test(m))
    return "A senha atual não confere (ou a sessão precisa ser confirmada de novo). Saia e entre outra vez para trocar a senha.";
  if (/rate limit|too many requests/.test(m))
    return "Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.";
  return explicarErroDeLogin(erro);
}

/* -------------------------------------------------------------- a operação */

/**
 * Troca a senha de quem está logado.
 * 1. valida o formulário; 2. confirma a senha atual (também renova a sessão);
 * 3. só então grava a nova senha.
 */
export async function trocarSenhaDeAcesso(
  cliente: ClienteDeSenha,
  dados: DadosTrocaDeSenha,
): Promise<ResultadoTrocaDeSenha> {
  const problema = validarTrocaDeSenha(dados);
  if (problema) return { ok: false, campo: problema.campo, mensagem: problema.mensagem };

  const email = (dados.email ?? "").trim();

  // Confirma a senha atual antes de qualquer coisa: sem isso, uma sessão aberta
  // num computador alheio bastaria para trocar a senha do dono da conta.
  const { error: erroAtual } = await cliente.signInWithPassword({ email, password: dados.atual });
  if (erroAtual) {
    const texto = `${extrairErroAuth(erroAtual).mensagem}`.toLowerCase();
    if (/invalid login credentials|invalid_grant|invalid credentials|invalid_credentials/.test(texto)) {
      return { ok: false, campo: "atual", mensagem: "A senha atual não confere. Se não lembrar, saia e use “Esqueci minha senha” na tela de login." };
    }
    return { ok: false, campo: "atual", mensagem: explicarErroDeLogin(erroAtual) };
  }

  const { error: erroNova } = await cliente.updateUser({ password: dados.nova, current_password: dados.atual });
  if (erroNova) return { ok: false, campo: "nova", mensagem: explicarErroDeSenha(erroNova) };

  return { ok: true };
}
