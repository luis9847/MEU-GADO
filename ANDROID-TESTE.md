# Aplicativo Android — Meu Gado

Este repositório mantém o site em produção separado do aplicativo Android. O aplicativo usa o mesmo sistema e login do site, sem alterar os dados dos clientes.

## Como gerar o APK de teste

1. No GitHub, abra **Settings → Secrets and variables → Actions**.
2. Crie o segredo de repositório com o nome exato `GOOGLE_SERVICES_JSON`.
3. Cole o conteúdo completo do arquivo `google-services.json` baixado do Firebase.
4. Abra **Actions → Gerar APK de teste → Run workflow** e selecione a branch `android-native-setup`.
5. Quando terminar, baixe o artefato **Meu-Gado-APK-teste** e instale o APK no Android.

O arquivo do Firebase não deve ser enviado como arquivo normal ao GitHub nem colocado no site.

## Limitação desta primeira versão

Este APK é uma versão de teste para validar login, cadastro e recebimento do token de notificação. A publicação na Play Store exige uma assinatura de lançamento e uma etapa adicional para o servidor enviar as mensagens pelo Firebase.
