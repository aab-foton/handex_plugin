# Catálogo textual do hac

Este diretório concentra o inventário dos textos e termos que aparecem no
plugin. O catálogo aponta sempre para o arquivo-fonte; `ui.html` e
`code.bundle.js` ficam fora porque são artefatos gerados e duplicariam o
conteúdo.

## Arquivos

- `text-catalog.csv`: tabela principal, pronta para abrir no Excel. Usa UTF-8
  com BOM e `;` como separador, adequado ao locale pt-BR.
- `text-catalog.json`: a mesma base em formato estruturado, com totais por
  arquivo e classificação.
- `text-groups.csv`: agrupa frases idênticas e mostra todos os locais onde
  cada uma se repete.

Regere as três saídas com:

```bash
npm run texts:catalog
```

## Como ler a tabela

| Campo | Uso |
|---|---|
| `field_id` | Identificador de uma ocorrência no código. |
| `canonical_id` | Agrupa ocorrências que hoje têm exatamente o mesmo texto. |
| `text` | Texto atual encontrado no fonte. |
| `proposed_text` | Coluna editorial reservada para a proposta de redação. |
| `classification` | Interface, acessibilidade, mensagem de sistema, vocabulário etc. |
| `source_file`, `source_line`, `source_column` | Referência navegável do local atual. |
| `locator` | Âncora estrutural usada na composição do ID. |
| `editable` | `no` indica template dinâmico ou arquivo gerado, que exige cuidado. |
| `generated` | Quando `yes`, a alteração deve ser feita na fonte do pipeline. |
| `review_status`, `notes` | Colunas para o fluxo editorial. |

`source_line` é uma fotografia do momento em que o catálogo foi gerado. O
`field_id` ajuda a discutir cada campo, mas a referência deve ser regenerada
depois de mudanças grandes no código.

## Arquitetura recomendada para editar e refletir no plugin

O CSV atual é um **inventário de auditoria**, não deve sobrescrever o código
automaticamente. Substituir literais por linha/coluna seria frágil: uma linha
movida poderia aplicar um texto no campo errado.

Para transformar o catálogo em banco editorial, a migração segura é:

1. Criar uma fonte versionada `src/plugin/content/pt-BR.json`, indexada por
   chaves semânticas estáveis, por exemplo `home.start.title`.
2. Trocar textos estáticos do HTML por `data-text-id` e literais JavaScript
   por `t('home.start.title')`.
3. Gerar um módulo embutido no `bundle:ui` e no `bundle:code`. Assim o plugin
   continua funcionando offline dentro do Figma.
4. Usar Excel ou Supabase somente como camada editorial. Um comando de build
   valida as chaves, baixa/exporta os dados e atualiza o JSON versionado antes
   de gerar o plugin.

### Excel ou Supabase?

Comece pelo CSV/Excel se uma pessoa ou uma equipe pequena mantém os textos.
É simples, revisável no Git e não cria infraestrutura.

Use Supabase quando forem necessários edição simultânea, perfis de acesso,
histórico editorial ou aprovação. Mesmo nesse caso, prefira sincronização
no build/CI. Consultar o Supabase em runtime exigiria liberar domínio no
manifest, lidar com indisponibilidade de rede e expor no cliente qualquer
credencial pública usada na leitura.

### Schema mínimo sugerido no Supabase

```sql
create table plugin_texts (
  key text primary key,
  locale text not null default 'pt-BR',
  value text not null,
  description text,
  surface text,
  status text not null default 'draft',
  updated_at timestamptz not null default now(),
  updated_by uuid
);
```

O campo `key` deve ser semântico e permanente. Local de arquivo e linha são
metadados gerados pelo build, não a chave primária editorial.
