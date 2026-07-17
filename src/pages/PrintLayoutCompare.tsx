import { Link } from "react-router-dom";
import { BackButton } from "@/components/BackButton";
import useLogo from "@/assets/logo-use-sistemas-v2.png.asset.json";

const ORANGE = "#F26B1F";
const BLUE = "#6F7FB8";

// Sample week data used only for visual preview
const DAYS = [
  { d: "13", l: "SEG", morning: ["08:00 · Use Sistemas — Reunião semanal"], afternoon: ["14:00 · Agropec — Ajuste interno"] },
  { d: "14", l: "TER", morning: ["08:00 · Agropecuária — Ajuste tela emissão"], afternoon: [] },
  { d: "15", l: "QUA", morning: ["09:00 · New Star — Visita ao suporte"], afternoon: ["15:00 · Reverso — Treinamento remoto"] },
  { d: "16", l: "QUI", morning: ["09:00 · Reverso — Levantamento telas"], afternoon: [] },
  { d: "17", l: "SEX", morning: ["09:00 · Use Sistemas — Reunião de implantação"], afternoon: ["16:00 · Agropec — Follow-up"] },
];

// A4 dimensions in mm scaled visually. We render fake "paper" divs.
// Landscape ratio 297:210, Portrait ratio 210:297.
const PAPER_LANDSCAPE = { w: 594, h: 420 }; // 2× mm
const PAPER_PORTRAIT = { w: 420, h: 594 };

const Paper = ({ w, h, children }: { w: number; h: number; children: React.ReactNode }) => (
  <div
    className="bg-white text-black shadow-lg border border-neutral-300 overflow-hidden mx-auto"
    style={{ width: w, height: h, padding: 12 }}
  >
    {children}
  </div>
);

const Header = ({ small = false }: { small?: boolean }) => (
  <div className="flex items-start justify-between mb-2">
    <div className="min-w-0">
      <div
        className="font-bold uppercase leading-none tracking-tight"
        style={{ fontSize: small ? 18 : 26, fontFamily: "'Clash Display', Archivo, sans-serif" }}
      >
        Agenda Semanal
      </div>
      <div className="italic font-semibold" style={{ color: ORANGE, fontSize: small ? 9 : 12 }}>
        visitas, reuniões e configurações internas
      </div>
      <div className="text-[7px] text-neutral-500">*Agenda pode mudar até confirmações.</div>
    </div>
    <img src={useLogo.url} alt="" className="object-contain" style={{ width: small ? 34 : 48, height: small ? 34 : 48 }} />
  </div>
);

const DayCard = ({
  d, l, morning, afternoon, compact = false,
}: { d: string; l: string; morning: string[]; afternoon: string[]; compact?: boolean }) => (
  <div className="border-[2px] rounded-md flex flex-col h-full overflow-hidden" style={{ borderColor: ORANGE }}>
    <div
      className="font-bold border-b-[2px] px-1.5 py-0.5"
      style={{ borderColor: ORANGE, fontSize: compact ? 10 : 13, fontFamily: "'Clash Display', Archivo, sans-serif" }}
    >
      {d} {l}
    </div>
    <div className="p-1 space-y-1 flex-1 overflow-hidden" style={{ fontSize: compact ? 6.5 : 8 }}>
      <div className="font-bold uppercase" style={{ color: ORANGE, fontSize: compact ? 6 : 7 }}>Manhã</div>
      {morning.length === 0 ? <div className="italic text-neutral-400">—</div> :
        morning.map((e, i) => (
          <div key={i} className="border rounded px-1 py-0.5 truncate" style={{ borderColor: BLUE, background: "#EEF1FB" }}>{e}</div>
        ))}
      <div className="border-t border-dashed my-0.5" style={{ borderColor: ORANGE }} />
      <div className="font-bold uppercase" style={{ color: ORANGE, fontSize: compact ? 6 : 7 }}>Tarde</div>
      {afternoon.length === 0 ? <div className="italic text-neutral-400">—</div> :
        afternoon.map((e, i) => (
          <div key={i} className="border rounded px-1 py-0.5 truncate" style={{ borderColor: BLUE, background: "#EEF1FB" }}>{e}</div>
        ))}
    </div>
  </div>
);

// -------- LAYOUTS --------

const LayoutA = () => (
  <Paper {...PAPER_LANDSCAPE}>
    <Header />
    <div className="grid grid-cols-5 gap-1.5" style={{ height: "calc(100% - 70px)" }}>
      {DAYS.map((d) => <DayCard key={d.d} {...d} />)}
    </div>
  </Paper>
);

const LayoutB = () => (
  <Paper {...PAPER_PORTRAIT}>
    <Header small />
    <div className="grid grid-cols-5 gap-1" style={{ height: "calc(100% - 60px)" }}>
      {DAYS.map((d) => <DayCard key={d.d} {...d} compact />)}
    </div>
  </Paper>
);

const LayoutC = () => {
  const pairs = [[DAYS[0], DAYS[1]], [DAYS[2], DAYS[3]], [DAYS[4], null]];
  return (
    <Paper {...PAPER_PORTRAIT}>
      <Header small />
      <div className="flex flex-col gap-2" style={{ height: "calc(100% - 60px)" }}>
        {pairs.map((row, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 flex-1 min-h-0">
            {row.map((d, j) => d ? <DayCard key={d.d} {...d} /> : <div key={j} />)}
          </div>
        ))}
      </div>
    </Paper>
  );
};

const LayoutD = () => {
  const rows: { day: string; time: string; client: string; type: string; note: string }[] = [];
  DAYS.forEach((d) => {
    [...d.morning, ...d.afternoon].forEach((e) => {
      const [time, rest] = e.split(" · ");
      const [client, note] = (rest || "").split(" — ");
      rows.push({ day: `${d.d} ${d.l}`, time, client: client || "", type: "Presencial", note: note || "" });
    });
  });
  return (
    <Paper {...PAPER_LANDSCAPE}>
      <Header />
      <table className="w-full border-collapse" style={{ fontSize: 9 }}>
        <thead>
          <tr style={{ background: ORANGE, color: "white" }}>
            <th className="text-left px-2 py-1 border">Dia</th>
            <th className="text-left px-2 py-1 border">Hora</th>
            <th className="text-left px-2 py-1 border">Cliente</th>
            <th className="text-left px-2 py-1 border">Tipo</th>
            <th className="text-left px-2 py-1 border">Descrição</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 ? "bg-neutral-50" : ""}>
              <td className="px-2 py-1 border font-semibold">{r.day}</td>
              <td className="px-2 py-1 border">{r.time}</td>
              <td className="px-2 py-1 border">{r.client}</td>
              <td className="px-2 py-1 border" style={{ color: BLUE }}>{r.type}</td>
              <td className="px-2 py-1 border">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Paper>
  );
};

const Card = ({
  id, title, subtitle, pros, cons, children,
}: { id: string; title: string; subtitle: string; pros: string; cons: string; children: React.ReactNode }) => (
  <section className="bg-neutral-50 rounded-xl p-5 border border-neutral-200">
    <div className="flex items-baseline justify-between mb-1">
      <h2 className="text-2xl font-bold tracking-tight">
        <span style={{ color: ORANGE }}>Opção {id}</span> — {title}
      </h2>
      <span className="text-xs text-neutral-500">{subtitle}</span>
    </div>
    <div className="text-sm text-neutral-600 mb-3">
      <strong className="text-green-700">Prós:</strong> {pros} · <strong className="text-red-700">Contras:</strong> {cons}
    </div>
    <div className="bg-neutral-200 rounded-lg p-6 overflow-auto flex justify-center">
      {children}
    </div>
  </section>
);

const PrintLayoutCompare = () => {
  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-neutral-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <BackButton to="/agenda/imprimir" />
          <div className="text-sm text-neutral-500">Escolha o layout de impressão que prefere</div>
          <Link to="/agenda/imprimir" className="text-sm text-orange-600 hover:underline">Voltar à agenda</Link>
        </div>
      </div>
      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Comparar layouts de impressão</h1>
          <p className="text-neutral-600 mt-1">
            Prévias em escala real (A4). Escolha uma opção e me avise: <strong>A</strong>, <strong>B</strong>, <strong>C</strong> ou <strong>D</strong>.
          </p>
        </header>

        <Card id="A" title="Paisagem · 5 colunas" subtitle="A4 297×210mm" pros="Espelha a tela, semana em relance." cons="Cards pequenos, texto longo pode truncar.">
          <LayoutA />
        </Card>

        <Card id="B" title="Retrato · 5 colunas estreitas" subtitle="A4 210×297mm" pros="Mais altura por dia, cabem mais eventos." cons="Colunas estreitas, texto quebra mais.">
          <LayoutB />
        </Card>

        <Card id="C" title="Retrato · pares (2×3)" subtitle="A4 210×297mm" pros="Cards grandes e legíveis." cons="Não é o formato calendário tradicional.">
          <LayoutC />
        </Card>

        <Card id="D" title="Paisagem · tabela compacta" subtitle="A4 297×210mm" pros="Cabe garantido em 1 folha, fácil de ler." cons="Perde o visual de agenda semanal.">
          <LayoutD />
        </Card>
      </main>
    </div>
  );
};

export default PrintLayoutCompare;