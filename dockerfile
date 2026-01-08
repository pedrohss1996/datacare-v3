# Use a imagem base da sua linguagem (Ex: node:18, python:3.9, openjdk:17)
FROM node:18-slim

# 1. Instalar dependências necessárias (curl e ca-certificates)
RUN apt-get update && apt-get install -y curl ca-certificates

# 2. Baixar e instalar o Tailscale
RUN curl -fsSL https://tailscale.com/install.sh | sh

# 3. Definir diretório de trabalho
WORKDIR /app

# 4. Copiar arquivos de dependências e instalar (padrão Node)
COPY package*.json ./
RUN npm install

# 5. Copiar o restante do código
COPY . .

# 6. Copiar o script start.sh e dar permissão de execução
COPY start.sh /start.sh
RUN chmod +x /start.sh

# 7. Definir o start.sh como o comando inicial
CMD ["/start.sh"]