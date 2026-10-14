import { STYLES, type QuizState } from "../types";
export default function Step2Style({ quiz, set, onBack, onNext }: { quiz: QuizState; set: (p: Partial<QuizState>) => void; onBack: () => void; onNext: () => void }) {
  return (
    <section className="card">
      <h2>Como {quiz.childName || "a criança"} vai aparecer no livro?</h2>
      <p className="muted">Escolha o estilo das ilustrações — o rostinho da foto vira desenho nesse estilo.</p>
      <div className="style-grid">
        {STYLES.map((s) => (
          <button type="button" key={s.id} className={quiz.style === s.id ? "style-card selected" : "style-card"} onClick={() => set({ style: s.id })}>
            <span className="style-art" style={{ background: s.grad }}><img src={s.img} alt={s.label} loading="lazy" /></span>
            <strong>{s.label}</strong><small>{s.desc}</small>
            {quiz.style === s.id && <span className="badge check-chip" aria-label="Selecionado">✓</span>}
          </button>
        ))}
      </div>
      <div className="pages-fixed">6 Páginas <span>(Incluído no plano)</span></div>
      <div className="nav-row"><button className="btn ghost" onClick={onBack}>← Voltar</button><button className="btn primary" onClick={onNext}>Próximo →</button></div>
    </section>
  );
}
