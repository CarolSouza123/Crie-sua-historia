const LABELS = ["Foto", "Visual", "Aventura", "Revisão", "Pagamento"];
export default function ProgressBar({ step }: { step: number }) {
  return (
    <nav className="progress" aria-label="Progresso">
      <div className="progress-track"><div className="progress-fill" style={{ width: `${(step / 5) * 100}%` }} /></div>
      <ol className="progress-steps">
        {LABELS.map((l, i) => (
          <li key={l} className={i + 1 === step ? "active" : i + 1 < step ? "done" : ""}>
            <span className="dot">{i + 1 < step ? "✓" : i + 1}</span><span className="lbl">{l}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
