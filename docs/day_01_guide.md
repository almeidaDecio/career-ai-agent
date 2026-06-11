# Guia Prático - Dia 1: Configurando o Motor de Inteligência Local com Llama 3.2 🦙

Este guia prático foi personalizado sob medida para o hardware do seu notebook: **Intel i7 (10ª Geração)**, **20 GB de RAM** e **Placa Gráfica Integrada Intel Iris Plus**. 

Para garantir a melhor experiência de usuário, com respostas ultra-rápidas e sem sobrecarregar sua CPU, adotaremos o modelo **Llama 3.2 (3B)** como o nosso motor principal de desenvolvimento.

---

## 🚀 Passo a Passo de Configuração

### Passo 1: Download e Instalação do Ollama
1. Abra seu navegador e acesse: [ollama.com/download](https://ollama.com/download)
2. Clique no botão de download para **Windows**.
3. Execute o arquivo baixado `OllamaSetup.exe`.
4. Clique em **Install** e aguarde a conclusão automática (leva menos de 1 minuto).
5. Certifique-se de que o ícone do Ollama (uma lhama cinza) está visível na barra de tarefas do Windows (perto do relógio).

---

### Passo 2: Inicializando o Llama 3.2 (3B)
Como o Llama 3.2 (3B) é extremamente leve e otimizado (ocupa apenas ~2.0 GB de espaço), ele rodará incrivelmente rápido no seu i7!

1. Abra o **PowerShell** ou o **Prompt de Comando (CMD)** do Windows.
2. Execute o comando abaixo para iniciar o download e abrir o terminal da IA:
   ```powershell
   ollama run llama3.2
   ```
3. O terminal mostrará o progresso do download:
   * `pulling manifest...`
   * `downloading 2.0 GB...`
   * `verifying sha256 digest...`
   * `success!`
4. Uma vez concluído, o terminal exibirá a linha de diálogo interativa:
   ```text
   >>> Send a message (/? for help)
   ```

---

### Passo 3: Seu Primeiro Teste Clínico (Foco em UX Design)
Vamos colocar a IA para rodar um teste típico de avaliação de requisitos de Produto Digital. Envie a seguinte mensagem no prompt do terminal:

```text
Aja como um Product Designer Sênior e faça uma avaliação crítica deste requisito em três tópicos curtos focando em UX: "A página principal deve listar todas as vagas e ter filtros de busca."
```

#### O que observar durante a resposta:
1. **Velocidade (Latência):** Veja como as palavras surgem quase instantaneamente (devem aparecer a mais de 15 palavras por segundo no seu i7).
2. **Qualidade do Raciocínio:** O modelo 3B é extremamente ágil e inteligente para mapear falhas de usabilidade (como a falta de paginação e a complexidade de múltiplos filtros em mobile).

---

### Passo 4: Encerrando e Verificando a API local
1. Para sair do prompt interativo do Ollama, digite `/bye` e aperte Enter:
   ```text
   >>> /bye
   ```
2. Para provar que o Ollama criou uma API local que nosso n8n e nosso servidor Express poderão acessar depois, abra o seu navegador e acesse a URL abaixo:
   ```text
   http://localhost:11434
   ```
3. Se você ver a mensagem: **"Ollama is running"**, parabéns! Sua API local de Inteligência Artificial está ativa e pronta para ser integrada!

---

## 🧠 Conceitos-Chave para Fixar

*   **Llama 3.2 (3B):** O modelo leve de última geração da Meta. A sigla **3B** significa *3 Billion Parameters* (3 bilhões de parâmetros). Ele foi treinado especificamente para ser muito ágil em dispositivos locais sem exigir placas de vídeo dedicadas caríssimas.
*   **API Local (`localhost:11434`):** O Ollama roda um microservidor web no seu computador. Quando criarmos nossos códigos, faremos requisições HTTP para este endereço local para mandar textos e receber análises de IA, sem depender de internet!

---

## 🎯 Desafio do Dia
Tente perguntar ao Llama 3.2 local:
> *"Quais são as 3 principais heurísticas de Nielsen mais importantes para uma página de dashboard de vagas de emprego?"*

Copie a resposta que ele gerou e cole no nosso chat como comprovação da sua primeira inferência local!
