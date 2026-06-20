FROM node:18-bullseye

# Instalar Java e dependências para o Android SDK
RUN apt-get update && apt-get install -y openjdk-17-jdk unzip wget

# Instalar Android SDK Command Line Tools
RUN mkdir -p /opt/android-sdk/cmdline-tools &&     wget https://dl.google.com/android/repository/commandlinetools-linux-9477386_latest.zip -O tools.zip &&     unzip tools.zip -d /opt/android-sdk/cmdline-tools &&     rm tools.zip

# Configurar variáveis de ambiente do Android
ENV ANDROID_HOME=/opt/android-sdk
ENV PATH=$PATH:$ANDROID_HOME/cmdline-tools/cmdline-tools/bin:$ANDROID_HOME/platform-tools

# Aceitar licenças do Android SDK automaticamente
RUN yes | sdkmanager --licenses --sdk_root=${ANDROID_HOME}

# Instalar pacotes essenciais de build do Android
RUN sdkmanager "build-tools;33.0.0" "platforms;android-33" --sdk_root=${ANDROID_HOME}

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
