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

---

## Deploy na Vercel (via GitHub)

Repo: [jopzap90/conversational-phone-app](https://github.com/jopzap90/conversational-phone-app)

### Passos

1. **Vercel** → [vercel.com/new](https://vercel.com/new) → **Import Git Repository**.
2. Conecte a conta **GitHub** se ainda não estiver conectada.
3. Escolha **`jopzap90/conversational-phone-app`** → **Import**.
4. **Environment Variables** (obrigatório — **a Vercel não lê `.env.local`**; esse arquivo não sobe no Git):
   - `OPENAI_API_KEY` = sua chave `sk-...` (cole no painel da Vercel).
   - Opcional: `OPENAI_MODEL` = `gpt-4o-mini`.
   - Marque para **Production** (e **Preview** se quiser).
5. **Deploy**. Depois de adicionar a chave, faça **Redeploy** se já tiver deployado sem ela.

### Depois do deploy

- Abra a URL `https://<projeto>.vercel.app` — o microfone só funciona em **HTTPS** (a Vercel já serve assim).
- Cada push na branch ligada ao projeto (ex.: `main`) gera um **novo deploy** automaticamente.

### Segurança

- **Nunca** commite `.env.local`. Na Vercel as variáveis ficam só no painel (**Settings → Environment Variables**).
- Se a chave vazar, revogue em [OpenAI API keys](https://platform.openai.com/api-keys) e crie outra.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/jopzap90/conversational-phone-app)
