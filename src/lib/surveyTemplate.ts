export type SurveyTemplateQuestion = {
  section: string;
  label: string;
  help_text?: string;
  type: "text" | "longtext" | "number" | "date" | "select" | "multiselect" | "boolean" | "file";
  options?: string[];
  required?: boolean;
};

/** Padrão Use Sistemas de levantamento de processos (editável depois de aplicado). */
export const SURVEY_TEMPLATE: SurveyTemplateQuestion[] = [
  // ---------- Comercial ----------
  {
    section: "Comercial",
    label: "Qual o tipo de produto que vocês comercializam? A empresa industrializa, revende ou faz os dois?",
    type: "select",
    options: ["Industrialização", "Revenda", "Industrialização e revenda"],
    required: true,
  },
  {
    section: "Comercial",
    label: "Hoje existem muitos controles feitos fora do sistema (planilhas, cadernos, aplicativos à parte)?",
    help_text: "Se existirem, conte quais são e para que servem.",
    type: "longtext",
    required: true,
  },
  {
    section: "Comercial",
    label: "Como é composta a equipe de vendas? Há vendedores internos, externos, representantes?",
    help_text: "Informe a quantidade de pessoas em cada caso.",
    type: "longtext",
    required: true,
  },
  {
    section: "Comercial",
    label: "De que forma os pedidos dos representantes chegam até a empresa hoje?",
    help_text: "Ex.: WhatsApp, e-mail, telefone, portal, aplicativo próprio.",
    type: "longtext",
    required: true,
  },
  {
    section: "Comercial",
    label: "Vocês controlam ficha de custos dos produtos?",
    type: "select",
    options: ["Sim, no sistema atual", "Sim, em planilha", "Não controlamos"],
    required: true,
  },
  {
    section: "Comercial",
    label: "Tabelas de preço e políticas de desconto em uso atualmente (anexar arquivo, se houver)",
    type: "file",
  },

  // ---------- Financeiro ----------
  {
    section: "Financeiro",
    label: "Como vocês pagam os fornecedores hoje?",
    help_text: "Selecione todas as formas utilizadas.",
    type: "multiselect",
    options: ["Pix", "Boleto (código de barras / DDA)", "Transferência / TED", "Cheque próprio", "Cheque de terceiros", "Dinheiro", "Cartão"],
    required: true,
  },
  {
    section: "Financeiro",
    label: "Como vocês recebem dos clientes?",
    type: "multiselect",
    options: ["Boleto", "Pix", "Cartão de crédito", "Cartão de débito", "Cheque", "Dinheiro", "Carteira / cobrança própria"],
    required: true,
  },
  {
    section: "Financeiro",
    label: "Vocês controlam limite de crédito por cliente?",
    type: "boolean",
    required: true,
  },
  {
    section: "Financeiro",
    label: "A empresa faz desconto de documentos (factoring ou banco)?",
    help_text: "Se sim, informe com quais instituições.",
    type: "longtext",
  },
  {
    section: "Financeiro",
    label: "Quais bancos a empresa utiliza e há necessidade de remessa/retorno de boletos?",
    type: "longtext",
  },

  // ---------- Estoque ----------
  {
    section: "Estoque",
    label: "A empresa faz controle de estoque hoje?",
    type: "select",
    options: ["Sim, no sistema", "Sim, em planilha", "Controle parcial", "Não controlamos"],
    required: true,
  },
  {
    section: "Estoque",
    label: "Existe controle por lote, validade ou número de série?",
    type: "multiselect",
    options: ["Lote", "Validade", "Número de série", "Não se aplica"],
  },
  {
    section: "Estoque",
    label: "Vocês utilizam pedido de compra para abastecer o estoque?",
    type: "boolean",
    required: true,
  },
  {
    section: "Estoque",
    label: "Quantos depósitos ou locais de estoque existem?",
    type: "number",
  },
  {
    section: "Estoque",
    label: "Relação de produtos / cadastro atual para importação (anexar planilha)",
    type: "file",
  },

  // ---------- Produção ----------
  {
    section: "Produção",
    label: "Atualmente a empresa faz controle da produção?",
    help_text: "Se sim, explique como é feito hoje (ordem de produção, apontamento, ficha técnica).",
    type: "longtext",
    required: true,
  },
  {
    section: "Produção",
    label: "Vocês produzem com terceirizados?",
    type: "select",
    options: ["Sim, parte da produção", "Sim, toda a produção", "Não"],
  },
  {
    section: "Produção",
    label: "Na emissão de notas e boletos existe muito retrabalho entre produção e financeiro?",
    help_text: "Descreva onde hoje o processo trava ou precisa ser refeito.",
    type: "longtext",
  },

  // ---------- Faturamento ----------
  {
    section: "Faturamento",
    label: "Quais documentos fiscais a empresa emite?",
    type: "multiselect",
    options: ["NF-e", "NFC-e", "NFS-e", "CT-e", "MDF-e", "NF de devolução", "Outros"],
    required: true,
  },
  {
    section: "Faturamento",
    label: "É necessário gerar SPED (Fiscal / Contribuições)?",
    type: "select",
    options: ["Sim, geramos internamente", "Sim, a contabilidade gera", "Não"],
    required: true,
  },
  {
    section: "Faturamento",
    label: "Contato do responsável pela parte fiscal/contábil",
    help_text: "Nome, telefone e e-mail.",
    type: "text",
  },

  // ---------- PDV ----------
  {
    section: "PDV",
    label: "A empresa emite NFC-e no ponto de venda?",
    type: "boolean",
  },
  {
    section: "PDV",
    label: "Há controle de cashback ou programa de fidelidade?",
    help_text: "Se sim, explique como funcionam as regras hoje.",
    type: "longtext",
  },
  {
    section: "PDV",
    label: "Quantos caixas / pontos de venda existem?",
    type: "number",
  },
];
