# Finances — Frontend

Sistema de finanças pessoais multi-usuário familiar (BRL / USD / PYG).

Stack: Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui + React Router + TanStack Query + axios.

## Dev

```bash
cp .env.example .env
npm install
npm run dev
```

Servidor sobe em `http://localhost:5173`. A página inicial faz `GET /api/health` — é esperado erro até o backend estar no ar.

A `VITE_API_URL` controla o `baseURL` do axios (default `/api`, proxiado pelo nginx em produção).

## Build

```bash
npm run build      # gera dist/
npm run preview    # serve dist/ local pra inspeção
```

## Docker

Build é multi-stage (node + nginx). A `VITE_API_URL` é injetada como build-arg:

```bash
docker build --build-arg VITE_API_URL=/api -t finances-frontend .
docker run -p 8080:80 finances-frontend
```

## Estrutura

```
src/
├── components/ui/   shadcn primitives
├── features/        domínio (vazio na Fase 0)
├── hooks/           hooks compartilhados (vazio na Fase 0)
├── lib/
│   ├── api/         axios client + endpoints
│   └── utils.ts     cn helper
└── routes/          páginas (root layout + home)
```

## Status

**Fase 0** — scaffold pronto. Sem telas de domínio. Próxima fase: schema DB + auth.
