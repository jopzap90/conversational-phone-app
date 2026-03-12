# Phone AI Friend — Android call (voz only)

Single flow: **open app → toca a ligação → atender → conversa por voz** em português (persona **paulista**). Quem liga é **aleatório** (nomes masculinos e femininos). **Desligar** encerra como num telefone.

## Setup

```bash
npm install
cp .env.example .env.local
# OPENAI_API_KEY obrigatório (chat + Whisper + TTS)
npm run dev
```

## Fluxo

1. **Ligação recebida** — toque (Web Audio), tela estilo Android escura, avatar + nome aleatório.
2. **Verde** atende — para o toque; a pessoa fala primeiro (TTS em PT).
3. **Loop** — grava ~5s → Whisper (pt) → resposta → TTS; repete até desligar.
4. **Vermelho** recusa ou desliga — tela “Ligação encerrada”; **Nova ligação** sorteia outro contato.

## APIs

| Rota            | Uso                          |
|-----------------|------------------------------|
| `POST /api/chat`| Histórico + persona do caller|
| `POST /api/transcribe` | Whisper `language: pt` |
| `POST /api/tts` | OpenAI TTS (voz por gênero)  |

## Accent / voz

- **Paulista** está no *prompt* (cadência SP, sem exagero).
- TTS OpenAI não tem controle fino de sotaque; o texto em PT-BR + voz `onyx`/`echo` (M) ou `nova`/`shimmer` (F) aproxima.

## Stack

Next.js, OpenAI (chat + whisper-1 + tts-1). Sem campo de texto.
