// src/services/aiService.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Inicializa o cliente Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.generateComponent = async (userPrompt) => {
    try {
        // Usamos o modelo Flash por ser mais rápido para tarefas simples de UI
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // O segredo está no System Prompt (Engenharia de Prompt)
        const systemInstruction = `
            Você é um especialista em Front-end Developer utilizando Tailwind CSS.
            Sua tarefa é gerar código HTML baseado na solicitação do usuário.
            
            REGRAS OBRIGATÓRIAS:
            1. Retorne APENAS o código HTML. Não explique nada.
            2. Não use tags <html>, <head> ou <body>. Retorne apenas o componente (ex: uma <div> ou <form>).
            3. Use classes do Tailwind CSS para todo o estilo.
            4. O design deve ser limpo, profissional e "clean" (estilo hospitalar/corporativo).
            5. Não use blocos de código markdown (como \`\`\`html). Retorne o texto puro.
            6. Se precisar de ícones, use SVG inline.
        `;

        const fullPrompt = `${systemInstruction}\n\nSolicitação do usuário: ${userPrompt}`;

        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        let text = response.text();

        // Limpeza de segurança (caso a IA teime em mandar markdown)
        text = text.replace(/```html/g, '').replace(/```/g, '');

        return text;

    } catch (error) {
        console.error("Erro no Gemini Service:", error);
        throw new Error("Falha ao gerar componente com IA.");
    }
};