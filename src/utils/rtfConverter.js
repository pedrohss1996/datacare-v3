/**
 * Utilitário para converter RTF para HTML
 * 
 * O TASY armazena evoluções em formato RTF (Rich Text Format)
 * Este módulo converte RTF para HTML preservando a formatação
 */

const RTFParser = require('rtf-parser');

/**
 * Converte RTF para HTML
 * @param {string} rtfContent - Conteúdo em formato RTF
 * @returns {Promise<string>} - HTML formatado
 */
async function rtfToHtml(rtfContent) {
    if (!rtfContent) {
        return '';
    }

    try {
        // Remove possíveis prefixos/sufixos do Oracle
        let cleanRtf = rtfContent.toString().trim();
        
        // Se não começar com {\rtf, não é RTF válido
        if (!cleanRtf.startsWith('{\\rtf')) {
            return cleanRtf; // Retorna como texto puro
        }

        return new Promise((resolve, reject) => {
            RTFParser.string(cleanRtf, (err, doc) => {
                if (err) {
                    console.error('Erro ao parsear RTF:', err);
                    resolve(cleanRtf); // Retorna texto original em caso de erro
                    return;
                }

                const html = convertDocToHtml(doc);
                resolve(html);
            });
        });
    } catch (error) {
        console.error('Erro ao converter RTF:', error);
        return rtfContent; // Retorna texto original em caso de erro
    }
}

/**
 * Converte documento parseado para HTML
 * @param {Object} doc - Documento RTF parseado
 * @returns {string} - HTML formatado
 */
function convertDocToHtml(doc) {
    let html = '';
    
    if (!doc.content || doc.content.length === 0) {
        return '';
    }

    doc.content.forEach(item => {
        html += processContent(item);
    });

    return html;
}

/**
 * Processa conteúdo recursivamente
 * @param {Object} item - Item do conteúdo
 * @returns {string} - HTML do item
 */
function processContent(item) {
    if (!item) return '';

    let html = '';
    let styles = [];

    // Aplica estilos
    if (item.style) {
        if (item.style.bold) styles.push('font-weight: bold');
        if (item.style.italic) styles.push('font-style: italic');
        if (item.style.underline) styles.push('text-decoration: underline');
        if (item.style.fontSize) styles.push(`font-size: ${item.style.fontSize}pt`);
        if (item.style.foreground) {
            const color = rgbToHex(item.style.foreground);
            styles.push(`color: ${color}`);
        }
    }

    const styleAttr = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';

    // Processa diferentes tipos de conteúdo
    if (item.value) {
        // Texto simples
        const text = escapeHtml(item.value);
        html += styleAttr ? `<span${styleAttr}>${text}</span>` : text;
    }

    if (item.content && Array.isArray(item.content)) {
        // Conteúdo aninhado
        item.content.forEach(child => {
            html += processContent(child);
        });
    }

    // Quebras de linha e parágrafos
    if (item.type === 'paragraph') {
        html = `<p>${html}</p>`;
    }

    return html;
}

/**
 * Converte RGB para hexadecimal
 * @param {Object} rgb - Objeto com r, g, b
 * @returns {string} - Cor em formato hex
 */
function rgbToHex(rgb) {
    if (!rgb) return '#000000';
    
    const r = (rgb.red || 0).toString(16).padStart(2, '0');
    const g = (rgb.green || 0).toString(16).padStart(2, '0');
    const b = (rgb.blue || 0).toString(16).padStart(2, '0');
    
    return `#${r}${g}${b}`;
}

/**
 * Escapa caracteres HTML e trata caracteres especiais RTF
 * @param {string} text - Texto para escapar
 * @returns {string} - Texto escapado
 */
function escapeHtml(text) {
    if (!text) return '';
    
    // Mapa de códigos hexadecimais RTF comuns para caracteres
    const rtfChars = {
        'c7': 'Ç',
        'd5': 'Õ',
        'e3': 'ã',
        'e1': 'á',
        'e9': 'é',
        'ed': 'í',
        'f3': 'ó',
        'fa': 'ú',
        'e7': 'ç',
        'f5': 'õ',
        'e2': 'â',
        'ea': 'ê',
        'f4': 'ô',
        'c1': 'Á',
        'c9': 'É',
        'cd': 'Í',
        'd3': 'Ó',
        'da': 'Ú',
        'c3': 'Ã'
    };
    
    // Substitui códigos hex por caracteres
    text = text.replace(/\\'([0-9a-f]{2})/gi, (match, hex) => {
        return rtfChars[hex.toLowerCase()] || match;
    });
    
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Converte RTF para HTML preservando formatação completa
 * Usa máquina de estados para processar comandos RTF corretamente
 * @param {string} rtfContent - Conteúdo em formato RTF
 * @returns {string} - HTML formatado
 */
function rtfToFormattedHtml(rtfContent) {
    if (!rtfContent) return '';

    try {
        let text = rtfContent.toString();
        
        // PASSO 1: Remove headers e blocos de configuração RTF
        text = text.replace(/\{\\fonttbl[\s\S]*?\}\}/g, '');
        text = text.replace(/\{\\colortbl[\s\S]*?\}/g, '');
        text = text.replace(/\{\\stylesheet[\s\S]*?\}/g, '');
        text = text.replace(/\{\\*\\listtable[\s\S]*?\}/g, '');
        text = text.replace(/\{\\*\\listoverridetable[\s\S]*?\}/g, '');
        text = text.replace(/\{\\*\\generator[\s\S]*?\}/g, '');
        
        // PASSO 2: Remove configurações de página
        text = text.replace(/\\deftab\d+/g, '');
        text = text.replace(/\\paperw\d+/g, '');
        text = text.replace(/\\paperh\d+/g, '');
        text = text.replace(/\\psz\d+/g, '');
        text = text.replace(/\\margl\d+/g, '');
        text = text.replace(/\\margr\d+/g, '');
        text = text.replace(/\\margt\d+/g, '');
        text = text.replace(/\\margb\d+/g, '');
        text = text.replace(/\\sectd[\s\S]*?(?=\\pard|\\d\s|$)/g, '');
        text = text.replace(/\\headery\d+/g, '');
        text = text.replace(/\\footery\d+/g, '');
        text = text.replace(/\\cols\d+/g, '');
        text = text.replace(/\\colsx\d+/g, '');
        text = text.replace(/\\sbknone/g, '');
        text = text.replace(/\\pgwsxn\d+/g, '');
        text = text.replace(/\\pghsxn\d+/g, '');
        text = text.replace(/\\marglsxn\d+/g, '');
        text = text.replace(/\\margrsxn\d+/g, '');
        text = text.replace(/\\margtsxn\d+/g, '');
        text = text.replace(/\\margbsxn\d+/g, '');
        text = text.replace(/\\rtf\d+/g, '');
        text = text.replace(/\\ansi\w*/g, '');
        text = text.replace(/\\ansicpg\d+/g, '');
        text = text.replace(/\\deff\d+/g, '');
        text = text.replace(/\\deflang\d+/g, '');
        text = text.replace(/\\uc\d+/g, '');
        
        // PASSO 3: Tokenização - quebra o RTF em tokens (comandos e texto)
        const tokens = text.split(/(\\[a-z0-9*]+(?:\s|;)?|[{}]|[\r\n])/gi).filter(t => t);
        
        // PASSO 4: Máquina de Estados
        let html = '';
        let isBold = false;
        let isUnderline = false;
        let isItalic = false;
        let currentParagraph = '';
        
        for (let token of tokens) {
            // Converte códigos hexadecimais para caracteres
            if (token.includes("\\'")) {
                token = token.replace(/\\'([0-9a-f]{2})/gi, (match, hex) => {
                    return String.fromCharCode(parseInt(hex, 16));
                });
            }
            
            // Processa comandos RTF
            if (token.startsWith('\\')) {
                const cmd = token.replace(/[\\;\s]/g, '').toLowerCase();
                
                // PLAIN: Reseta TODA formatação
                if (cmd === 'plain') {
                    if (isBold) {
                        currentParagraph += '</strong>';
                        isBold = false;
                    }
                    if (isUnderline) {
                        currentParagraph += '</u>';
                        isUnderline = false;
                    }
                    if (isItalic) {
                        currentParagraph += '</em>';
                        isItalic = false;
                    }
                }
                // NEGRITO
                else if (cmd === 'b') {
                    if (!isBold) {
                        currentParagraph += '<strong>';
                        isBold = true;
                    }
                }
                else if (cmd === 'b0') {
                    if (isBold) {
                        currentParagraph += '</strong>';
                        isBold = false;
                    }
                }
                // ITÁLICO
                else if (cmd === 'i') {
                    if (!isItalic) {
                        currentParagraph += '<em>';
                        isItalic = true;
                    }
                }
                else if (cmd === 'i0') {
                    if (isItalic) {
                        currentParagraph += '</em>';
                        isItalic = false;
                    }
                }
                // SUBLINHADO
                else if (cmd === 'ul') {
                    if (!isUnderline) {
                        currentParagraph += '<u>';
                        isUnderline = true;
                    }
                }
                else if (cmd === 'ulnone' || cmd === 'ul0') {
                    if (isUnderline) {
                        currentParagraph += '</u>';
                        isUnderline = false;
                    }
                }
                // QUEBRA DE LINHA / PARÁGRAFO
                else if (cmd === 'par' || cmd === 'line') {
                    // Fecha tags abertas antes de quebrar linha
                    if (isBold) currentParagraph += '</strong>';
                    if (isUnderline) currentParagraph += '</u>';
                    if (isItalic) currentParagraph += '</em>';
                    
                    // Adiciona parágrafo se tiver conteúdo
                    if (currentParagraph.trim()) {
                        html += `<p>${currentParagraph.trim()}</p>\n`;
                    } else {
                        html += '<div class="h-3"></div>\n';
                    }
                    
                    currentParagraph = '';
                    
                    // Reabre tags se ainda estavam ativas
                    if (isBold) currentParagraph += '<strong>';
                    if (isUnderline) currentParagraph += '<u>';
                    if (isItalic) currentParagraph += '<em>';
                }
                // Ignora outros comandos RTF
            }
            // Ignora chaves
            else if (token === '{' || token === '}') {
                continue;
            }
            // Ignora quebras de linha cruas
            else if (token === '\r' || token === '\n') {
                continue;
            }
            // Adiciona texto puro
            else if (token.trim()) {
                // Remove lixo específico
                let cleanToken = token
                    .replace(/JWord\d+;/gi, '')
                    .replace(/^d\s+/g, '')
                    .replace(/^-\d+\s*$/, '')
                    .trim();
                
                if (cleanToken) {
                    currentParagraph += cleanToken;
                }
            }
        }
        
        // Fecha tags abertas no final
        if (isBold) currentParagraph += '</strong>';
        if (isUnderline) currentParagraph += '</u>';
        if (isItalic) currentParagraph += '</em>';
        
        // Adiciona último parágrafo se existir
        if (currentParagraph.trim()) {
            html += `<p>${currentParagraph.trim()}</p>`;
        }
        
        // Remove linhas vazias consecutivas
        html = html.replace(/(<div class="h-3"><\/div>\n){2,}/g, '<div class="h-3"></div>\n');
        
        return html || '<p class="text-slate-500 italic">Conteúdo não disponível</p>';
        
    } catch (error) {
        console.error('Erro ao converter RTF:', error);
        return '<p class="text-slate-500 italic">Erro ao processar conteúdo</p>';
    }
}

/**
 * Versão simplificada: extrai apenas o texto do RTF
 * @param {string} rtfContent - Conteúdo em formato RTF
 * @returns {string} - Texto puro
 */
function rtfToPlainText(rtfContent) {
    if (!rtfContent) return '';

    try {
        let text = rtfContent.toString();
        
        // Remove comandos RTF comuns
        text = text.replace(/\\par\s*/g, '\n');
        text = text.replace(/\\line\s*/g, '\n');
        text = text.replace(/\\tab\s*/g, '    ');
        text = text.replace(/\\[a-z]+\d*\s?/gi, ''); // Remove comandos
        text = text.replace(/[{}]/g, ''); // Remove chaves
        text = text.replace(/\\/g, ''); // Remove barras invertidas
        text = text.replace(/ +/g, ' '); // Normaliza espaços
        text = text.trim();
        
        return text;
    } catch (error) {
        console.error('Erro ao extrair texto do RTF:', error);
        return rtfContent;
    }
}

module.exports = {
    rtfToHtml,
    rtfToPlainText,
    rtfToFormattedHtml
};
