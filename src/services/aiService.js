// src/services/aiService.js
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `Você é um especialista em Front-end Developer utilizando Tailwind CSS.
Sua tarefa é gerar código HTML baseado na solicitação do usuário.
REGRAS OBRIGATÓRIAS:
1. Retorne APENAS o código HTML. Não explique nada.
2. Não use tags <html>, <head> ou <body>. Retorne apenas o componente (ex: uma <div> ou <form>).
3. Use classes do Tailwind CSS para todo o estilo.
4. O design deve ser limpo, profissional e "clean" (estilo hospitalar/corporativo).
5. Não use blocos de código markdown (como \`\`\`html). Retorne o texto puro.
6. Se precisar de ícones, use SVG inline.`;

exports.generateComponent = async (userPrompt) => {
    try {
        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Solicitação do usuário: ${userPrompt}`,
            config: { systemInstruction: SYSTEM_INSTRUCTION },
        });
        let text = result.text || '';

        // Limpeza de segurança (caso a IA teime em mandar markdown)
        text = text.replace(/```html/g, '').replace(/```/g, '');

        return text;

    } catch (error) {
        console.error("Erro no Gemini Service:", error);
        throw new Error("Falha ao gerar componente com IA.");
    }
};