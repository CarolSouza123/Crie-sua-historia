export type Gender = "Menino" | "Menina" | "";
export interface QuizState {
  childName: string; age: number | ""; gender: Gender;
  photoDataUrl: string | null; photoName: string | null; sendPhotoLater: boolean;
  style: string; adventure: string; moral: string; dedication: string;
}
export interface Synopsis { title: string; summary: string; chapters: string[]; mock?: boolean }
export interface Buyer { name: string; email: string; phone: string; cpf: string }
export interface PixResult {
  id: string; status: string; mock: boolean;
  qr_code: string | null; qr_code_base64: string | null; qr_image_data_url: string | null;
  ticket_url: string | null; expires_at: string; amount: number;
}
export const INITIAL_QUIZ: QuizState = {
  childName: "", age: "", gender: "", photoDataUrl: null, photoName: null,
  sendPhotoLater: false, style: "Disney/Pixar (3D)", adventure: "", moral: "", dedication: "",
};
export const STYLES = [
  { id: "Disney/Pixar (3D)", label: "Disney/Pixar (3D)", desc: "Fofo, redondinho e cheio de brilho", grad: "linear-gradient(135deg,#ffd9a0,#ff9d76)", img: "/images/styles/estilo-pixar.webp" },
  { id: "Desenho Realista", label: "Desenho Realista", desc: "Traços fiéis à foto da criança", grad: "linear-gradient(135deg,#cfe8d8,#7fb069)", img: "/images/styles/estilo-realista.webp" },
  { id: "Aquarela Suave", label: "Aquarela Suave", desc: "Leve, delicado e poético", grad: "linear-gradient(135deg,#dbeafe,#c4b5fd)", img: "/images/styles/estilo-aquarela.webp" },
  { id: "Anime/Manga", label: "Anime/Mangá", desc: "Olhos grandes e muita energia", grad: "linear-gradient(135deg,#fbcfe8,#f472b6)", img: "/images/styles/estilo-anime.webp" },
];
export const ADVENTURES = ["Aventura Espacial","Reino Encantado","Dinossauros","Fundo do Mar","Super-Herói","Floresta Mágica","Craque de Futebol","Ilha dos Piratas do Bem","Circo dos Sonhos"];
export const MORALS = ["Coragem para enfrentar desafios","A importância da amizade","Acreditar em si mesmo","Respeitar as diferenças","Aprender a dormir sozinho","Obedecer aos pais","Dividir e ser generoso","Cuidar da natureza","Ser paciente e persistente"];
export const PRICE = 37.9; export const PRICE_FROM = 79.9;
export const BUMP_COLORING = 9.9; export const BUMP_AUDIO = 12.9;
export const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
