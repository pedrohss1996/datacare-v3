FROM node:18-bullseye-slim

# 1. Atualizar a lista de repositórios
RUN apt-get update

# 2. Instalar CURL (Necessário para baixar o script do Tailscale)
RUN apt-get install -y curl

# 3. Instalar LIBAIO1 (Obrigatório para o driver do Oracle funcionar)
RUN apt-get install -y libaio1

# 4. Instalar SOCAT (Cria o túnel entre a porta local e o Tailscale)
RUN apt-get install -y socat

# 5. Instalar NETCAT (Essencial para o comando 'nc' do seu start.sh funcionar)
RUN apt-get install -y netcat-openbsd

# 6. Instalar Certificados (Para garantir conexões seguras HTTPS)
RUN apt-get install -y ca-certificates

# 7. Limpar o cache do apt para deixar a imagem menor
RUN rm -rf /var/lib/apt/lists/*

# ----------------------------------------------------------------
# Fim das instalações do sistema. Agora começa a aplicação.
# ----------------------------------------------------------------

# 8. Instalar o Tailscale
RUN curl -fsSL https://tailscale.com/install.sh | sh

# 9. Definir diretório de trabalho
WORKDIR /app

# 10. Copiar arquivos de dependências e instalar
COPY package*.json ./
RUN npm install

# 11. Copiar todo o resto do código
COPY . .

# 12. Copiar o script de inicialização e dar permissão de execução
COPY start.sh /start.sh
RUN sed -i 's/\r$//' /start.sh && chmod +x /start.sh
RUN chmod +x /start.sh

# 13. Comando de entrada
CMD ["bash", "/start.sh"]
