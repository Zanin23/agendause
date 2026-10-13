import { ArrowUpRight, CalendarDays, Check, ClipboardList, FileCheck2 } from "lucide-react";
import logoAsset from "@/assets/logo-use-sistemas.png.asset.json";

export function AuthWelcome() {
  return (
    <aside className="auth-welcome">
      <div className="auth-brand">
        <span className="auth-logo"><img src={logoAsset.url} alt="Use Sistemas" /></span>
        <span>TreinaCheck<span className="auth-brand-caption">GESTÃO QUE CONECTA</span></span>
      </div>
      <div className="auth-welcome-copy">
        <p className="auth-eyebrow"><span /> MENOS RUÍDO. MAIS CLAREZA.</p>
        <h2>Sua equipe.<br />Seu ritmo.<br /><span>Tudo conectado.</span></h2>
        <p>Da primeira visita ao último aceite, um lugar para organizar o trabalho e acompanhar cada próximo passo.</p>
      </div>
      <div className="auth-agenda-scene" aria-hidden="true">
        <div className="auth-scene-orbit" />
        <div className="auth-agenda-card">
          <div className="auth-agenda-top"><span><CalendarDays size={16} /> Sua rotina, organizada</span><ArrowUpRight size={17} /></div>
          <div className="auth-week">{["S", "T", "Q", "Q", "S"].map((day, index) => <span key={index} className={index === 2 ? "is-current" : ""}>{day}<i /></span>)}</div>
          <div className="auth-agenda-item"><span className="auth-item-icon"><ClipboardList size={18} /></span><div><strong>Planejar o próximo passo</strong><small>Cronogramas e implantações</small></div><span className="auth-item-dot" /></div>
          <div className="auth-agenda-item"><span className="auth-item-icon completed"><FileCheck2 size={18} /></span><div><strong>Registrar cada entrega</strong><small>Treinamentos e aceites</small></div><Check size={16} className="auth-item-check" /></div>
        </div>
        <div className="auth-scene-note"><span><Check size={13} /></span> Cada etapa faz a diferença.</div>
      </div>
      <div className="auth-welcome-footer"><span>AGENDA · CRONOGRAMAS · ACEITES</span><span>USE SISTEMAS <ArrowUpRight size={12} /></span></div>
    </aside>
  );
}
