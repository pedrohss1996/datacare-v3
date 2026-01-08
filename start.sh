#!/bin/bash

echo "🚀 Iniciando configuração do Tailscale..."

# 1. Iniciar o daemon do Tailscale em modo userspace
# --tun=userspace-networking: Essencial para Railway
# --socks5-server=localhost:1055: Cria o proxy SOCKS local
tailscaled --tun=userspace-networking --socks5-server=localhost:1055 &

# 2. Aguardar o daemon iniciar (breve pausa)
sleep 2

# 3. Autenticar na rede Tailscale
# Usa a chave definida nas variáveis de ambiente do Railway
tailscale up --authkey=${TAILSCALE_AUTH_KEY} --hostname=railway-app-${RAILWAY_GIT_COMMIT_SHA::7}

echo "✅ Tailscale conectado!"

# 4. (O PULO DO GATO) Criar túnel para o Oracle via Socat
# Isso faz com que 'localhost:1521' no container aponte para o IP do seu PC remoto
# Substitua as variáveis ou deixe fixo se preferir.
# REMOTE_DB_IP: O IP do seu computador na rede Tailscale (ex: 100.x.y.z)
if [ -n "$REMOTE_DB_IP" ]; then
    echo "🔗 Criando túnel para Oracle: localhost:1521 -> $REMOTE_DB_IP:1521"
    socat TCP-LISTEN:1521,fork,bind=127.0.0.1 SOCKS5:127.0.0.1:$REMOTE_DB_IP:1521,socksport=1055 &
fi

# 5. Iniciar sua aplicação
echo "🟢 Iniciando aplicação Node.js..."
exec npm start
