#!/bin/sh

echo "🔌 Inicializando Tailscale..."

# Inicia o daemon do Tailscale em background (modo userspace)
# O socks5-server é opcional, mas útil se o tunelamento direto falhar
tailscaled --tun=userspace-networking --socks5-server=localhost:1055 &

# Espera 5 segundos para garantir que o daemon subiu
sleep 5

# Conecta na rede Tailscale
# --accept-routes: Aceita as rotas que você anunciou no pfSense (o IP do Oracle)
tailscale up --authkey=${TAILSCALE_AUTH_KEY} --hostname=railway-app --accept-routes

echo "✅ Tailscale conectado!"

# ----------------------------------------------------------------
# COMANDO DE INICIALIZAÇÃO DA SUA APLICAÇÃO
# ----------------------------------------------------------------
# Substitua a linha abaixo pelo comando que inicia seu app.
# Exemplos:
# npm start
# python main.py
# java -jar app.jar
# ./meu-binario

npm run start