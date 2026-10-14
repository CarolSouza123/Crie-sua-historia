import { useCallback, useEffect, useRef, useState } from "react";
import ProgressBar from "./components/ProgressBar";
import Step1Photo from "./components/Step1Photo";
import Step2Style from "./components/Step2Style";
import Step3Adventure from "./components/Step3Adventure";
import Step4Review from "./components/Step4Review";
import Step5Checkout from "./components/Step5Checkout";
import AdminPanel from "./components/AdminPanel";
import { INITIAL_QUIZ, PRICE, type QuizState, type Synopsis } from "./types";
import { initPixel, pixelInitiateCheckout, pixelLead, pixelViewContent } from "./lib/pixel";
import { trackStep } from "./lib/track";
import { captureTracking } from "./lib/tracking";

function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem("csh_session_id");
    if (existing) return existing;
    const id = crypto.randomUUID(); sessionStorage.setItem("csh_session_id", id); return id;
  } catch { return `session-${Date.now()}`; }
}
function isAdminRoute(): boolean {
  // Rota oculta do painel — sem nenhum link na página; só quem sabe o endereço chega aqui.
  try { return window.location.hash === "#/dashboardfunil" || window.location.pathname === "/dashboardfunil" || window.location.pathname === "/dashboardfunil/"; }
  catch { return false; }
}
export default function App() {
  const [admin, setAdmin] = useState(isAdminRoute());
  useEffect(() => {
    const onHash = () => setAdmin(isAdminRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  if (admin) return <AdminPanel />;
  return <Quiz />;
}
function Quiz() {
  const [step, setStep] = useState(1);
  const [quiz, setQuiz] = useState<QuizState>(INITIAL_QUIZ);
  const [synopsis, setSynopsis] = useState<Synopsis | null>(null);
  const sessionId = useRef(getSessionId());
  const set = useCallback((p: Partial<QuizState>) => setQuiz((q) => ({ ...q, ...p })), []);

  useEffect(() => { captureTracking(); initPixel(); pixelViewContent(); trackStep(sessionId.current, 1, INITIAL_QUIZ); }, []);
  function goTo(next: number) {
    setStep(next); window.scrollTo({ top: 0, behavior: "smooth" });
    trackStep(sessionId.current, next, quiz);
    if (next === 4) pixelLead();
    if (next === 5) pixelInitiateCheckout(PRICE);
  }
  return (
    <div className="app">
      <header className="hero">
        <div className="logo">Crie Sua História</div>
        <h1>Um livro onde seu filho é o herói da história</h1>
        <p>Monte em menos de 2 minutos: foto, estilo, aventura e uma moral para guardar para sempre.</p>
      </header>
      <main>
        <ProgressBar step={step} />
        {step === 1 && <Step1Photo quiz={quiz} set={set} onNext={() => goTo(2)} />}
        {step === 2 && <Step2Style quiz={quiz} set={set} onBack={() => goTo(1)} onNext={() => goTo(3)} />}
        {step === 3 && <Step3Adventure quiz={quiz} set={set} onBack={() => goTo(2)} onNext={() => goTo(4)} />}
        {step === 4 && <Step4Review quiz={quiz} synopsis={synopsis} setSynopsis={setSynopsis} onBack={() => goTo(3)} onNext={() => goTo(5)} />}
        {step === 5 && <Step5Checkout quiz={quiz} synopsis={synopsis} sessionId={sessionId.current} onBack={() => goTo(4)} />}
      </main>
      <footer className="footer">Crie Sua História · Livro digital personalizado · Feito com carinho para famílias</footer>
    </div>
  );
}
