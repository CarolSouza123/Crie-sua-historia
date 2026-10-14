import { useEffect, useRef, useState } from "react";
import type { QuizState, Synopsis } from "../types";
import { mockSynopsis } from "../lib/mockSynopsis";

export default function Step4Review({ quiz, synopsis, setSynopsis, onBack, onNext }: {
  quiz: QuizState; synopsis: Synopsis | null; setSynopsis: (s: Synopsis) => void; onBack: () => void; onNext: () => void;
}) {
  const [loading, setLoading] = useState(!synopsis);
  const [adjustment, setAdjustment] = useState("");
  const [refining, setRefining] = useState(false);
  const started = useRef(false);

  async function generate(adj = "") {
    const startedAt = Date.now();
    try {
      const r = await fetch("/api/generate-synopsis", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: quiz.childName, age: quiz.age, gender: quiz.gender, theme: quiz.adventure, moral: quiz.moral, style: quiz.style, adjustment: adj || undefined }) });
      if (!r.ok) throw new Error("api");
      setSynopsis(await r.json());
    } catch {
      setSynopsis(mockSynopsis(quiz.childName, quiz.adventure, quiz.moral, adj));
    } finally {
      const wait = Math.max(0, 1200 - (Date.now() - startedAt));
      setTimeout(() => { setLoading(false); setRefining(false); }, adj ? 0 : wait);
      if (adj) setLoading(false);
    }
  }
  useEffect(() => { if (!started.current) { started.current = true; if (!synopsis) generate(); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && !synopsis) return (
    <section className="card center">
      <div className="spinner" aria-hidden /><h2>Nossa IA está escrevendo os primeiros capítulos de {quiz.childName}...</h2>
      <p className="muted">Preparando uma aventura de {quiz.adventure.toLowerCase()} com a lição: {quiz.moral.toLowerCase()}.</p>
    </section>
  );
  if (!synopsis) return null;
  return (
    <section className="card synopsis-card">
      <span className="badge soft">Prévia da história {synopsis.mock ? "· modo demonstração" : ""}</span>
      <h2>{synopsis.title}</h2>
      <p className="summary">{synopsis.summary}</p>
      <h3>O que acontece em cada uma das 6 páginas</h3>
      <ol className="chapters">{synopsis.chapters.map((c, i) => <li key={i}><strong>Página {i + 1}.</strong> {c}</li>)}</ol>
      <div className="refine">
        <label htmlFor="adj"><strong>Quer ajustar alguma coisa?</strong></label>
        <div className="refine-row">
          <input id="adj" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} placeholder='Ex.: Quero que ele salve um cachorrinho' onKeyDown={(e) => { if (e.key === "Enter" && adjustment.trim()) { setRefining(true); generate(adjustment.trim()); } }} />
          <button className="btn secondary" disabled={refining || !adjustment.trim()} onClick={() => { setRefining(true); generate(adjustment.trim()); }}>{refining ? "Reescrevendo..." : "Ajustar"}</button>
        </div>
        <p className="hint">A sinopse é atualizada na hora com o seu pedido.</p>
      </div>
      <div className="nav-row"><button className="btn ghost" onClick={onBack}>← Voltar</button>
      <button className="btn primary big" onClick={onNext}>Confirmar História e Ver Meu Livro</button></div>
    </section>
  );
}
