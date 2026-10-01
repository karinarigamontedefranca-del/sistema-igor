# Check-in do Hackathon

Sistema para o dia do evento, com duas funções:

1. **Lista de presença (recepção):** a equipe digita o nome da pessoa e toca em **Chegou**. Vários recepcionistas podem usar ao mesmo tempo (a tela atualiza sozinha a cada 5 s).
2. **Formação de grupos (organização):** forma grupos **só com quem chegou**, de **5 a 6 pessoas**, misturando ao máximo faculdades e cursos diferentes.

Tecnologia: Next.js (Vercel) + Supabase (banco de dados). Tudo que é feito fica salvo no Supabase.

---

## Passo a passo para colocar no ar

### 1. Criar o banco no Supabase (≈ 5 min)

1. Em [supabase.com](https://supabase.com), crie uma conta e um **New project** (anote a senha do banco, mas você não vai precisar dela aqui).
2. No menu lateral, abra **SQL Editor → New query**, cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
3. Vá em **Project Settings → API** e copie:
   - **Project URL** → vai virar `SUPABASE_URL`
   - a chave **service_role** (ou "secret") → vai virar `SUPABASE_SERVICE_ROLE_KEY`

> A chave service_role dá acesso total ao banco. Ela só fica no servidor da Vercel e **nunca** deve ir para o GitHub nem receber `NEXT_PUBLIC_` na frente do nome.

### 2. Testar no seu computador (opcional)

```bash
npm install
cp .env.example .env.local     # preencha os valores (veja abaixo)
npm run dev                    # abre em http://localhost:3000
```

### 3. Subir no Vercel

1. Crie um repositório no GitHub e envie esta pasta (`git init`, `git add .`, `git commit`, `git push`). O `.gitignore` já impede que `.env.local` vá junto.
2. Em [vercel.com](https://vercel.com): **Add New → Project**, escolha o repositório. O Vercel reconhece Next.js sozinho.
3. Antes de clicar em **Deploy**, em **Environment Variables**, cadastre:

| Variável | O que colocar |
|---|---|
| `SUPABASE_URL` | Project URL do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | chave service_role / secret |
| `STAFF_PIN` | PIN da equipe da recepção (ex.: `4821`) |
| `ADMIN_PIN` | PIN da organização (diferente do anterior!) |
| `SESSION_SECRET` | texto aleatório longo. Gere com `openssl rand -hex 32` |

4. **Deploy.** O link `https://seu-projeto.vercel.app` é o que a recepção abre no celular/tablet/notebook.

> Se mudar uma variável depois, faça **Redeploy** para ela valer.

---

## Como usar no dia

**Antes do evento (organização, PIN de admin → tela *Organização*):**
1. Abra **2. Importar lista de inscritos** e envie o CSV ou cole as linhas direto do Excel/Google Sheets. Colunas: `Nome`, `Faculdade`, `Curso` (pode ter cabeçalho ou não; se tiver, a ordem das colunas não importa). Aceita `,` `;` ou tab. Quem já está na lista (mesmo nome + faculdade) é ignorado, então dá para importar de novo sem duplicar.
2. Dê o **PIN da recepção** para a equipe.

**Na recepção (PIN da recepção):**
- Digite parte do nome (sem se preocupar com acento ou maiúscula) → toque em **Chegou**. Pronto.
- Marcou errado? Aparece um aviso embaixo da tela com **desfazer** por 6 s; depois disso, use **desfazer** no próprio cartão da pessoa.
- Abas **Faltam / Chegaram / Todos** mostram quem falta e quem já entrou.
- Alguém não estava na lista? **Cadastrar agora** (já entra como "chegou").

**Formar os grupos (organização):**
1. Quando a maioria tiver chegado, abra a tela *Organização* e clique em **Formar grupos**. Mínimo e máximo vêm como 5 e 6, mas dá para mudar ali mesmo.
2. Use **Imprimir** ou **Baixar CSV** para divulgar os grupos.
3. **Refazer grupos** sorteia de novo (útil se quiser outra combinação). **Encaixar retardatários** mantém os grupos que já existem e coloca só quem chegou depois, sem mexer em ninguém que já tem grupo.

### Como os grupos são formados

- O número de grupos é escolhido para que todos tenham entre 5 e 6 pessoas (ex.: 47 pessoas → 8 grupos: 7 de 6 e 1 de 5; 30 pessoas → 5 grupos de 6).
- Alguns totais **não têm solução exata** com 5–6: 7, 8, 9, 13, 14 e 19 pessoas. Nesses casos o sistema escolhe a divisão que menos se afasta (ex.: 13 → 7 + 6) e mostra um aviso.
- Diversidade: cada par de pessoas do mesmo grupo com a **mesma faculdade** conta 1 ponto de repetição, e com o **mesmo curso** conta 1 ponto. O sistema distribui em rodízio e depois troca pessoas entre grupos enquanto a repetição total diminuir. É uma preferência, não uma regra rígida: se 60% do evento for da mesma faculdade, algumas repetições são inevitáveis.
- Quem está sem faculdade/curso preenchido não pesa na conta.

---

## Segurança (resumo)

- Dois PINs: **recepção** (só marca presença e cadastra quem não estava na lista) e **organização** (tudo, inclusive importar, apagar e formar grupos).
- O login vira um cookie assinado e protegido (`httpOnly`), válido por 24 h.
- O banco tem RLS ligado e **sem** policies: o navegador nunca fala direto com o Supabase; só as rotas `/api/*` do servidor, com a chave service_role.
- Os dados são nomes, faculdades e cursos de estudantes. Use PINs que não sejam óbvios e apague os participantes (botão em *Organização*) depois do evento.

## Dicas

- Projetos gratuitos do Supabase são **pausados após ~1 semana sem uso**. Crie ou "acorde" o projeto perto do dia do evento.
- Teste tudo na véspera com alguns nomes de mentira.
- Rodar os testes do algoritmo de grupos: `npm test`.

## Estrutura

```
app/page.tsx, ReceptionClient.tsx   tela da recepção (busca + "Chegou")
app/admin/                          tela da organização (importar, grupos)
app/login/                          entrada por PIN
app/api/                            rotas do servidor (falam com o Supabase)
lib/groups.ts                       algoritmo de formação de grupos
supabase/schema.sql                 tabela do banco
```
