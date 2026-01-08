FROM node:18-bullseye-slim

# 1. Instalar dependências básicas, libaio (para Oracle) e socat
RUN apt-get update && apt-get install -y \
    curl \
    libaio1 \
    socat \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 2. Instalar Tailscale
RUN curl -fsSL https://tailscale.com/install.sh | sh

# 3. Configurar diretório da aplicação
WORKDIR /app

# 4. Copiar arquivos de dependências e instalar
COPY package*.json ./
RUN npm install

# 5. Copiar o restante do código
COPY . .

# 6. Copiar o script de inicialização e dar permissão de execução
COPY start.sh /start.sh
RUN chmod +x /start.sh

# 7. Definir o comando de entrada
CMD ["/start.sh"]
