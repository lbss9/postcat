# Aba de Scripts (Pré-envio / Pós-envio)

Documentação da funcionalidade de scripts do PostCat — o equivalente ao
"Pre-request / Tests" do Postman, mas com a nossa própria API (`pc.*`) e
identidade. Cobre o que está implementado, como funciona por baixo, e o que
ficou pendente.

> Estado: **funcional e testado ao vivo.** Editor de código atual: **CodeMirror 6**
> (houve uma tentativa de trocar por Monaco — revertida, ver o fim do documento).

---

## 1. Visão geral

Cada requisição tem uma aba **Scripts** com dois editores:

- **Pré-envio** — roda **antes** da requisição ser enviada. Pode ler/alterar a
  requisição (método, URL, headers) e criar/atualizar variáveis de ambiente.
- **Pós-envio** — roda **depois** da resposta chegar. Pode inspecionar a
  resposta, rodar testes (asserts) e salvar valores no ambiente (ex.: capturar
  um token de login).

Os resultados dos testes aparecem numa aba **Testes** dentro do painel de
Resposta (verde = passou, vermelho = falhou, com a mensagem do erro), além de um
console próprio.

Os scripts são **JavaScript** e rodam num **sandbox isolado (Web Worker)**, sem
acesso ao DOM. É isolamento para uma ferramenta local — **não** é uma barreira de
segurança contra código hostil.

---

## 2. Fluxo de execução (dentro de `send()`)

1. **Pré-envio** roda com o contexto `{ request, env, envName }`.
   - Alterações de variáveis (`pc.env.set`) entram num mapa **local** para já
     valerem na resolução desta requisição, e também são **persistidas** no
     ambiente ativo.
   - Se o script pré falhar, o envio é **abortado** e o erro aparece.
   - Mutações de `pc.request` (método/URL/headers) são aplicadas a uma cópia de
     trabalho.
2. **Resolução** de `{{variáveis}}` e `:path` params usando o mapa de variáveis
   já atualizado pelo pré-envio.
3. **Envio** da requisição (motor HTTP em Rust).
4. **Pós-envio** roda com `{ request, response, env, envName }`.
   - Coleta resultados de `pc.test(...)`, logs e mudanças de ambiente.
   - Mudanças de ambiente são persistidas.
5. O painel de Resposta abre a aba **Testes** automaticamente quando há testes.

---

## 3. A API `pc.*`

Disponível nos dois scripts (a menos que indicado). `response` só faz sentido no
pós-envio.

| Membro | Assinatura | Descrição |
|---|---|---|
| `pc.phase` | `"pre" \| "post"` | Fase atual do script. |
| `pc.environmentName` | `string \| null` | Nome do ambiente ativo. |
| `pc.env.get(name)` | `=> string \| undefined` | Lê uma variável (refletindo mudanças feitas antes nesta execução). |
| `pc.env.set(name, value)` | `=> void` | Cria/atualiza variável no ambiente ativo (persiste). |
| `pc.env.unset(name)` | `=> void` | Remove variável do ambiente ativo. |
| `pc.env.has(name)` | `=> boolean` | Se a variável existe. |
| `pc.variables` | — | Alias de `pc.env`. |
| `pc.request.method` | `string` | Método HTTP (mutável no pré). |
| `pc.request.url` | `string` | URL (com `{{}}` ainda não resolvido; mutável no pré). |
| `pc.request.headers.get/has/set/remove/all` | — | Manipula headers da requisição (no pré). |
| `pc.request.body` | `string` | Corpo raw (somente leitura). |
| `pc.response.code` | `number` | Código de status (ex.: 200). |
| `pc.response.status` | `string` | Texto do status (ex.: "OK"). |
| `pc.response.json()` | `=> any` | Faz parse do corpo como JSON. |
| `pc.response.text()` | `=> string` | Corpo cru. |
| `pc.response.headers.get/has/all` | — | Headers da resposta. |
| `pc.response.time` / `responseTime` | `number` | Tempo em ms. |
| `pc.response.size` | `number` | Tamanho em bytes. |
| `pc.test(name, fn)` | `=> void` | Define um teste nomeado; falha se `fn` lançar. |
| `pc.expect(value)` | `=> Expectation` | Assert estilo chai (ver abaixo). |
| `pc.console.log/warn/error(...)` | `=> void` | Loga no painel de Testes. |

### `pc.expect` (assertion estilo chai)

Encadeia palavras de ligação (`to`, `be`, `have`, `that`, `is`, `and`) e `not`,
depois um matcher ou terminal:

- Matchers: `.equal(y)`, `.eql(y)` (deep), `.a("string")`, `.include(x)`,
  `.property("k")`, `.above(n)`, `.below(n)`, `.status(n)`, `.match(/re/)`.
- Terminais (getters): `.ok`, `.true`, `.false`, `.null`, `.undefined`,
  `.exist`, `.empty`.

```js
pc.expect(pc.response.code).to.equal(200);
pc.expect(data).to.have.property("id");
pc.expect(list).to.not.be.empty;
```

### Exemplos

**Capturar token no pós-envio e reutilizar** (o caso clássico de auth):

```js
// Pós-envio da requisição de login
pc.test("login ok", () => {
  pc.expect(pc.response.code).to.equal(200);
});
pc.env.set("token", pc.response.json().token);
```

Nas próximas requisições, na aba Headers:

```
Authorization: Bearer {{token}}
```

**Injetar header dinâmico no pré-envio:**

```js
pc.request.headers.set("X-Request-Id", crypto.randomUUID());
```

---

## 4. Arquitetura e arquivos

| Arquivo | Papel |
|---|---|
| `src/lib/scripts.ts` | `runScript(phase, code, ctx, timeout)` — cria um Web Worker novo por execução, com timeout (4s) que mata o worker. Tipos `ScriptContext`, `ScriptOutcome`, `TestResult`, `LogLine`. |
| `src/lib/script.worker.ts` | O sandbox. Monta o objeto `pc`, sombreia as globais perigosas (`self`, `globalThis`, `postMessage`, `fetch`, `importScripts`, `XMLHttpRequest`, `WebSocket`, `Worker`, `indexedDB`) via parâmetros de `new Function`, e roda o código do usuário. Inclui a lib de asserts chai-like (`makeExpect`). |
| `src/lib/pcApi.ts` | Metadados da API `pc.*` (label / kind / assinatura / descrição) que alimentam o autocomplete do editor. **Manter em sincronia com `script.worker.ts`.** |
| `src/components/CodeEditor.tsx` | Editor de código (CodeMirror 6): syntax highlight via tema, autocomplete do `pc.*` a partir de `pcApi.ts`, `ref.insert(text)` para os snippets. |
| `src/App.tsx` → `ScriptEditor` | UI da aba: segmento **Pré-envio / Pós-envio**, chips de snippet que inserem código no cursor, e o `<CodeEditor>`. |
| `src/App.tsx` → `send()` | Orquestra pré → resolução → envio → pós (ver seção 2). Helpers: `toScriptRequest`, `toScriptResponse`, `applyScriptRequest`, `applyEnvToMap`, `persistEnv`. |
| `src/App.tsx` → `ResponsePanel` | Aba **Testes** com resumo passou/falhou, linhas ✓/✕ com mensagem, e console. |

O modelo `RequestState` ganhou `preScript` e `postScript` (migrados em
`normalizeRequest`), então os scripts são salvos junto com a requisição.

### Isolamento das globais

O worker roda o código do usuário assim (resumido):

```js
const fn = new Function("pc", "console", ...shadow, `"use strict";\n${code}`);
fn(pc, pcConsole, ...shadow.map(() => undefined));
```

onde `shadow` é a lista de globais perigosas passadas como `undefined`. É
suficiente para uso local; ver "Limitações".

---

## 5. Editor de código

Atual: **CodeMirror 6** (`@codemirror/*` + `@lezer/highlight`).

- **Syntax highlight** de JS/TS via `HighlightStyle` mapeando tags para as
  variáveis de tema (segue light/dark automaticamente).
- **Autocomplete do `pc.*`**: fonte de conclusão custom (`pcCompletions` em
  `CodeEditor.tsx`) que casa o caminho digitado (`pc.`, `pc.env.`,
  `pc.response.` …) e devolve os membros de `pcApi.ts` com **tipo/assinatura**
  na linha e **descrição** no painel lateral. Métodos inserem `nome()` com o
  cursor dentro.
- Numeração de linha, match de parênteses, auto-fechamento de chaves, histórico
  (Ctrl+Z), Tab para indentar.
- Os chips de snippet ("status 200", "save token", "pc.env.set" …) chamam
  `CodeEditor.insert()` e escrevem no cursor.

---

## 6. O que está feito ✅

- [x] Sandbox `pc.*` em Web Worker com timeout e globais sombreadas.
- [x] Pré-envio: `pc.env.*`, mutação de `pc.request` (método/URL/headers).
- [x] Pós-envio: `pc.response.*`, `pc.test`, `pc.expect` (chai-like), `pc.console`.
- [x] Persistência de variáveis de ambiente a partir dos scripts (cria "Global"
      se não houver ambiente ativo).
- [x] Integração no `send()` na ordem correta (pré → resolve `{{}}` → envio → pós).
- [x] UI: aba Scripts, segmento Pré/Pós-envio, chips de snippet.
- [x] Painel de Testes na Resposta (passou/falhou + mensagem + console).
- [x] Editor CodeMirror com cores + autocomplete do `pc.*` (rótulo + descrição).
- [x] Testado ao vivo: testes passando/falhando e captura de token → ambiente.

---

## 7. O que ficou faltando / próximos passos

- [ ] **Mutação de corpo no pré-envio** — hoje `pc.request.body` é somente
      leitura. Permitir setar/alterar o corpo (raw / form) antes do envio.
- [ ] **Scripts em nível de coleção/pasta** — herdar um pré/pós script comum de
      uma coleção (como o Postman faz), rodando antes do da requisição.
- [ ] **Mais da API**: `pc.expect` com mais matchers, `pc.response.headers` como
      objeto iterável, helpers de cookies, `pc.sendRequest` (disparar uma
      requisição auxiliar de dentro do script).
- [ ] **IntelliSense com tipos reais** (estilo VS Code, inferindo tipos de
      `pc.response.json()` etc.) — exigiria Monaco ou um serviço de tipos; ver
      abaixo por que foi adiado.
- [ ] **Biblioteca de snippets** maior e/ou editável pelo usuário.
- [ ] **Limite de segurança real** — se um dia rodar coleções compartilhadas de
      terceiros, trocar o sandbox atual (isolamento leve) por algo mais forte
      (ex.: um interpretador embarcado no Rust). Hoje o isolamento é adequado
      apenas para scripts que o próprio usuário escreve.
- [ ] **Timeout/limites configuráveis** por requisição (hoje fixo em 4s).

---

## 8. Nota: a tentativa com Monaco (revertida)

Chegamos a trocar o editor por **Monaco** (o motor do VS Code) para ter
IntelliSense completo com tipos. Foi revertido para o CodeMirror por uma série de
problemas, documentados aqui para quem for tentar de novo:

- **`monaco-editor` 0.56.0 (mais recente)** reescreveu a arquitetura para um
  cliente LSP e **removeu** a API clássica `monaco.languages.typescript.javascriptDefaults`
  (`addExtraLib`), que é justamente o que dá o autocomplete tipado. Foi preciso
  fixar em **0.52.2** (última estável antes da reescrita).
- **Vite + Monaco**: adicionar uma dependência tão grande no meio da sessão fez
  o otimizador de deps do Vite entrar em loop (`504 Outdated Optimize Dep`),
  colocando `react`/`react-dom` em gerações diferentes e quebrando a página
  (erro `reading 'metadata'`). Precisou de `optimizeDeps.include: ["monaco-editor"]`
  + limpar o cache `.vite` e o cache do WebView2.
- **Rótulos do autocomplete invisíveis**: no WebView2 (Tauri), o popup de
  sugestão do Monaco renderizava só os ícones, sem o texto dos rótulos — não
  resolvido.
- **Peso**: Monaco é vários MB, contra ~centenas de KB do CodeMirror — vai
  contra o objetivo de app leve.

Conclusão: para descobrir a nossa API `pc.*` (e como a resposta é `any`, a
inferência profunda de tipos ajudaria pouco), o **CodeMirror com autocomplete
curado** entrega o essencial (cores + sugestões com tipo e descrição) sem o peso
nem os problemas. Se um dia o IntelliSense tipado completo virar prioridade, a
rota é Monaco **0.52.x** com a integração de workers do Vite e a investigação do
bug de rótulos no WebView2.
