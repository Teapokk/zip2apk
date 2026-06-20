const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Servir a interface HTML
app.use(express.static(path.join(__dirname, 'public')));

// Criar diretoria temporária global
const tempUploadsDir = '/tmp/uploads/';
if (!fs.existsSync(tempUploadsDir)){
    fs.mkdirSync(tempUploadsDir, { recursive: true });
}

const upload = multer({ dest: tempUploadsDir });

app.post('/api/build', upload.fields([
  { name: 'appIcon', maxCount: 1 },
  { name: 'zipFile', maxCount: 1 }
]), (req, res) => {
    try {
        const { appName, packageName, versionName } = req.body;
        
        if (!req.files || !req.files['zipFile']) {
            return res.status(400).json({ error: 'Ficheiro .zip do projeto é obrigatório.' });
        }

        const zipFile = req.files['zipFile'][0];
        const uniqueId = Date.now().toString();
        const buildFolder = path.join('/tmp', 'builds', uniqueId);

        // Criar diretoria para o projeto
        fs.mkdirSync(buildFolder, { recursive: true });

        // 1. Extrair o ficheiro ZIP (usando o unzip nativo do Linux instalado via Docker)
        const unzipCommand = `unzip -q ${zipFile.path} -d ${buildFolder}`;
        
        exec(unzipCommand, (unzipErr, stdout, stderr) => {
            if (unzipErr) {
                return res.status(500).json({ error: 'Falha ao extrair o ficheiro ZIP.', details: stderr });
            }

            // Descobrir a diretoria raiz extraída (caso o zip tenha uma diretoria principal dentro)
            const extractedFiles = fs.readdirSync(buildFolder);
            let projectRoot = buildFolder;
            if (extractedFiles.length === 1 && fs.statSync(path.join(buildFolder, extractedFiles[0])).isDirectory()) {
                projectRoot = path.join(buildFolder, extractedFiles[0]);
            }

            // 2. Dar permissão de execução ao gradlew e executar o build
            const command = `cd ${projectRoot} && chmod +x gradlew && ./gradlew assembleRelease`;
            
            exec(command, (buildErr, buildStdout, buildStderr) => {
                if (buildErr) {
                    console.error(`Erro no Gradle: ${buildStderr}`);
                    return res.status(500).json({ error: 'Falha ao compilar o APK via Gradle.', details: buildStderr });
                }

                // Caminho padrão do APK gerado pelo Gradle
                const apkPath = path.join(projectRoot, 'app/build/outputs/apk/release/app-release.apk');
                const apkPathDebug = path.join(projectRoot, 'app/build/outputs/apk/debug/app-debug.apk'); // Alternativa
                
                const finalApkPath = fs.existsSync(apkPath) ? apkPath : (fs.existsSync(apkPathDebug) ? apkPathDebug : null);

                if (finalApkPath) {
                    // Enviar o ficheiro para o utilizador
                    res.download(finalApkPath, `${appName.replace(/\s+/g, '_')}.apk`, () => {
                        // Limpeza para evitar que o Render fique sem espaço em disco
                        try {
                            fs.rmSync(buildFolder, { recursive: true, force: true });
                            fs.unlinkSync(zipFile.path);
                            if (req.files['appIcon']) {
                                fs.unlinkSync(req.files['appIcon'][0].path);
                            }
                        } catch(e) { console.error("Erro na limpeza de ficheiros:", e); }
                    });
                } else {
                    res.status(500).json({ error: 'Compilação concluída, mas o ficheiro APK não foi encontrado no destino esperado.' });
                }
            });
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro interno no servidor.', details: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor de compilação Render ativo na porta ${PORT}`);
});
