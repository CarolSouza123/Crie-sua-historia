import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Em dev puro (npm run dev) as rotas /api/* nao rodam localmente:
// o front usa os fallbacks MOCK client-side (sinopse e PIX).
// Para testar as functions de verdade, use `npx vercel dev`.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Descomente se rodar as functions separadamente na porta 3000:
    // proxy: { "/api": "http://localhost:3000" },
  },
});
