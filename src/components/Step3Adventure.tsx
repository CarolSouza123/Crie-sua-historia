import { ADVENTURES, MORALS, type QuizState } from "../types";
export default function Step3Adventure({ quiz, set, onBack, onNext }: { quiz: QuizState; set: (p: Partial<QuizState>) => void; onBack: () => void; onNext: () => void }) {
  const valid = Boolean(quiz.adventure && quiz.moral);
  return (
    <section className="card">
      <h2>A aventura de {quiz.childName || "nosso herói"}</h2>
      <p className="muted">Escolha o mundo da história e a lição que ela vai ensinar.</p>
      <label className="field"><span>Tipo de aventura *</span>
        <select value={quiz.adventure} onChange={(e) => set({ adventure: e.target.value })}>
          <option value="">Selecione a aventura</option>
          {ADVENTURES.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </label>
      <label className="field"><span>Moral da história *</span>
        <select value={quiz.moral} onChange={(e) => set({ moral: e.target.value })}>
          <option value="">Selecione a moral</option>
          {MORALS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <label className="field"><span>Dedicatória (opcional)</span>
        <textarea rows={3} value={quiz.dedication} onChange={(e) => set({ dedication: e.target.value })} placeholder="Para nosso querido Pedro, que ilumina nossos dias com sua coragem..." />
      </label>
      <div className="nav-row"><button className="btn ghost" onClick={onBack}>← Voltar</button><button className="btn primary" disabled={!valid} onClick={onNext}>Criar minha história →</button></div>
      {!valid && <p className="hint">Escolha a aventura e a moral para a IA escrever a história.</p>}
    </section>
  );
}
