# Cabeçalhos de segurança, incluídos em cada `location` do nginx.conf.
# connect-src libera a API e o WebSocket do ActionCable (/cable).
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), interest-cohort=()" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://api.107-152-37-59.sslip.io wss://api.107-152-37-59.sslip.io; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'" always;
