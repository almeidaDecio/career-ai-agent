# AI_CONTEXT.md

# AjustaCV

## Objetivo do produto

O AjustaCV é uma plataforma de IA que ajuda candidatos a emprego a aumentar suas chances de aprovação em processos seletivos.

O sistema acompanha todo o fluxo da candidatura, desde a análise da vaga até a geração de currículos personalizados e o acompanhamento das candidaturas.

O foco principal é reduzir o trabalho manual do candidato e aumentar a compatibilidade com sistemas ATS.

---

# Fluxo principal

O fluxo ideal do usuário é:

1. Carregar uma vaga.
2. Informar ou revisar o título da vaga.
3. A IA analisa a descrição da vaga.
4. Extrair requisitos, competências e palavras-chave.
5. Gerar um currículo otimizado.
6. Revisar o currículo.
7. Gerar PDF.
8. Salvar a candidatura.
9. Acompanhar o status da candidatura.

Sempre que possível, novas funcionalidades devem respeitar esse fluxo.

---

# Objetivos de UX

O produto deve transmitir:

* simplicidade;
* confiança;
* organização;
* rapidez;
* foco na tarefa.

Evite interfaces poluídas.

Sempre priorize clareza sobre quantidade de informações.

---

# Público

Profissionais procurando emprego.

Níveis:

* Júnior
* Pleno
* Sênior
* Especialistas

O sistema deve funcionar para qualquer profissão.

---

# Filosofia de Design

O produto segue princípios de Product Design.

Sempre priorizar:

* consistência;
* previsibilidade;
* feedback visual;
* baixa carga cognitiva;
* componentes reutilizáveis.

Evitar soluções específicas para uma única tela.

---

# Arquitetura

Antes de criar novos componentes:

* verificar se já existe componente semelhante;
* reutilizar componentes sempre que possível;
* evitar duplicação de lógica.

---

# Estado da aplicação

Evitar estados duplicados.

Sempre que possível existir apenas uma fonte de verdade.

Ao adicionar novos campos:

* atualizar o modelo principal;
* evitar estados paralelos;
* propagar alterações através da arquitetura existente.

---

# Modelos

As entidades principais são:

* Vaga
* Currículo
* Candidatura
* Usuário

Sempre que adicionar propriedades novas, verificar impacto em:

* persistência;
* geração do currículo;
* geração do PDF;
* revisão do CV.

---

# PDF

O PDF é o produto final entregue ao usuário.

Alterações visuais devem priorizar:

* legibilidade;
* alinhamento;
* consistência;
* evitar quebras inesperadas de página ou linha.

---

# Componentes

Sempre preferir:

Componentes pequenos.

Componentes reutilizáveis.

Responsabilidade única.

Evitar componentes gigantes.

---

# Código

Antes de implementar qualquer funcionalidade:

1. entender o fluxo existente;
2. identificar onde a lógica já existe;
3. reutilizar funções existentes;
4. evitar código duplicado.

---

# Refatoração

Ao encontrar código repetido:

* sugerir refatoração;
* não criar uma terceira implementação semelhante.

---

# Boas práticas

Sempre utilizar:

* TypeScript corretamente;
* tipagem forte;
* nomes claros;
* funções pequenas;
* componentes reutilizáveis.

---

# UX

Sempre pensar primeiro na experiência do usuário.

Depois na implementação.

---

# Antes de alterar qualquer código

Sempre siga esta sequência:

1. Entender o problema.
2. Identificar arquivos envolvidos.
3. Explicar a estratégia.
4. Implementar.
5. Validar possíveis regressões.
6. Explicar o que mudou.

---

# Resposta esperada

Ao finalizar qualquer implementação, informar:

* arquivos alterados;
* motivo das alterações;
* impactos;
* possíveis melhorias futuras.

---

# O que evitar

* Código duplicado.
* Estados duplicados.
* Componentes enormes.
* Valores hardcoded.
* CSS específico para apenas um caso.
* Gambiarras visuais.
* Regressões em funcionalidades existentes.

---

# Objetivo final

Toda implementação deve deixar o projeto mais organizado do que estava antes.

Sempre que houver duas soluções possíveis, escolher a mais simples, reutilizável e consistente com a arquitetura existente.
