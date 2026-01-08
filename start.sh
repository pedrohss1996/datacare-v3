#!/bin/bash

echo "🚀 [1/4] Iniciando Daemon do Tailscale..."
# Inicia o daemon em background
tailscaled --tun=userspace-networking --socks5-server=localhost:1055 &
sleep 3

echo "🔑 [2/4] Autenticando no Tailscale..."
tailscale up --authkey=${TAILSCALE_AUTH_KEY} --hostname=railway-app

echo "🔗 [3/4] Subindo túnel Socat (Local 1521 -> Remoto 10.0.10.222:1521)..."
# -d -d: Ativa logs de debug para vermos se o socat falhar
# 10.0.10.222: É o IP do seu banco Oracle na rede interna
socat -d -d TCP-LISTEN:1521,fork,bind=127.0.0.1 SOCKS5:127.0.0.1:10.0.10.222:1521,socksport=1055 &

echo "⏳ [WAIT] Aguardando a porta 1521 abrir..."
# Loop: Tenta conectar na porta 1521 a cada 1 segundo. Só sai daqui quando conseguir.
# Se ficar preso aqui no log, significa que o socat não conseguiu subir.
while ! nc -z 127.0.0.1 1521; do   
  sleep 1
  echo "zzz... esperando túnel..."
done

echo "✅ [4/4] Túnel pronto! Iniciando aplicação..."
exec npm start
