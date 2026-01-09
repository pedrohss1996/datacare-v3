#!/bin/bash

echo "🚀 [1/4] Iniciando Daemon do Tailscale..."

# MUDANÇA AQUI: 
# 1. Usamos --outbound-http-proxy-listen (HTTP) em vez de SOCKS5 para compatibilidade com Socat.
# 2. Usamos --mtu=1280 para evitar fragmentação de pacotes do Oracle.
tailscaled --tun=userspace-networking --outbound-http-proxy-listen=localhost:1055 --mtu=1280 &

# Espera o Daemon subir
sleep 5

echo "🔑 [2/4] Autenticando no Tailscale..."
tailscale up --authkey=${TAILSCALE_AUTH_KEY} --hostname=railway-app --accept-routes

echo "🔗 [3/4] Subindo túnel Socat (Local 1521 -> Remoto 10.0.10.222:1521)..."
# Usa o protocolo PROXY (HTTP Connect) na porta 1055
socat -d -d TCP-LISTEN:1521,fork,bind=127.0.0.1 PROXY:127.0.0.1:10.0.10.222:1521,proxyport=1055 &

echo "⏳ [WAIT] Aguardando a porta 1521 abrir..."
while ! nc -z 127.0.0.1 1521; do   
  sleep 2
  echo "zzz... esperando túnel..."
done

echo "✅ [4/4] Túnel pronto! Iniciando aplicação..."
npm start
