import { useRef, useState } from "react";
import type { QuizState } from "../types";

export default function Step1Photo({ quiz, set, onNext }: { quiz: QuizState; set: (p: Partial<QuizState>) => void; onNext: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const valid = quiz.childName.trim().length >= 2 && quiz.age !== "" && quiz.gender !== "" && (Boolean(quiz.photoDataUrl) || quiz.sendPhotoLater);

  function handleFile(file: File | undefined | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Envie um arquivo de imagem (JPG ou PNG)."); return; }
    const reader = new FileReader();
    reader.onload = () => set({ photoDataUrl: String(reader.result), photoName: file.name, sendPhotoLater: false });
    reader.readAsDataURL(file);
  }
  return (
    <section className="card">
      <h2>Quem vai ser o protagonista?</h2>
      <p className="muted">Conte pra gente quem é a estrela dessa história.</p>
      <label className="field"><span>Nome da criança *</span>
        <input value={quiz.childName} onChange={(e) => set({ childName: e.target.value })} placeholder="Ex.: Pedro" autoComplete="off" />
      </label>
      <div className="row">
        <label className="field"><span>Idade *</span>
          <select value={quiz.age} onChange={(e) => set({ age: e.target.value ? Number(e.target.value) : "" })}>
            <option value="">Selecione</option>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((a) => <option key={a} value={a}>{a} {a === 1 ? "ano" : "anos"}</option>)}
          </select>
        </label>
        <div className="field"><span>É um... *</span>
          <div className="toggle">
            {(["Menino", "Menina"] as const).map((g) => (
              <button type="button" key={g} className={quiz.gender === g ? "chip active" : "chip"} onClick={() => set({ gender: g })}>{g}</button>
            ))}
          </div>
        </div>
      </div>
      <div className={drag ? "dropzone dragging" : "dropzone"}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]); }}
        onClick={() => fileRef.current?.click()} role="button" tabIndex={0}>
        {quiz.photoDataUrl ? (
          <div className="photo-preview"><img src={quiz.photoDataUrl} alt="Foto enviada da criança" /><div><strong>{quiz.photoName}</strong><p className="muted">Toque para trocar a foto</p></div></div>
        ) : (
          <div><div className="drop-icon">＋</div><strong>Enviar a foto da criança</strong><p className="muted">Arraste a foto aqui ou toque para escolher (JPG/PNG)</p></div>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>
      <label className="check">
        <input type="checkbox" checked={quiz.sendPhotoLater} onChange={(e) => set({ sendPhotoLater: e.target.checked, ...(e.target.checked ? { photoDataUrl: null, photoName: null } : {}) })} />
        Enviar a foto depois por e-mail
      </label>
      <button className="btn primary big" disabled={!valid} onClick={onNext}>Próximo →</button>
      {!valid && <p className="hint">Preencha nome, idade, gênero e a foto (ou marque enviar depois) para continuar.</p>}
    </section>
  );
}
