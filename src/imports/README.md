# OCR Service — Microserviço de Extração de Texto

Microserviço Python com Flask que recebe imagens e retorna o texto extraído
via **Tesseract OCR**. Integra com o backend Java do sistema de digitalização de documentos.

---

## 📋 Pré-requisitos

### 1. Python 3.11+
```bash
python --version   # deve ser >= 3.11
```

### 2. Tesseract OCR — Instalação no Windows

Baixe o instalador oficial:
👉 https://github.com/UB-Mannheim/tesseract/wiki

**Durante a instalação:**
- Marque **"Add to PATH"**
- Em "Additional language data", selecione **"Portuguese"** (por)

Verifique a instalação:
```bash
tesseract --version
```

Para instalar idiomas manualmente depois:
- Baixe arquivos `.traineddata` de https://github.com/tesseract-ocr/tessdata
- Coloque em `C:\Program Files\Tesseract-OCR\tessdata\`

---

## 🚀 Setup do Projeto

### Passo 1 — Criar o ambiente virtual

```bash
# Navegue até a pasta do serviço
cd "c:\Users\João\Desktop\FACULDADE JOÃO\3 SEMESTRE\DIGITALIZAR DOCUMENTOS\ocr-service"

# Criar o venv
python -m venv venv

# Ativar o venv (Windows PowerShell)
.\venv\Scripts\Activate.ps1

# Ativar o venv (Windows CMD)
venv\Scripts\activate.bat

# Verificar que o venv está ativo (deve mostrar o caminho do venv)
where python
```

### Passo 2 — Instalar as dependências

```bash
# Com o venv ativo:
pip install --upgrade pip
pip install -r requirements.txt
```

### Passo 3 — Configurar variáveis de ambiente

```bash
# Copiar o template
copy .env.example .env

# Editar o .env (ajuste o caminho do Tesseract se necessário)
notepad .env
```

Conteúdo típico do `.env` para Windows:
```env
FLASK_PORT=5000
FLASK_DEBUG=True
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
OCR_DEFAULT_LANG=por+eng
```

---

## ▶️ Executando o Serviço

```bash
# Com o venv ativo:
python main.py
```

Saída esperada:
```
2024-04-24 17:00:00 [INFO] app — Iniciando OCR Service — porta: 5000, debug: True
2024-04-24 17:00:00 [INFO] app — Blueprint 'ocr' registrado
2024-04-24 17:00:00 [INFO] app.services.ocr_service — OcrService inicializado — idiomas padrão: por+eng
 * Running on http://0.0.0.0:5000
```

---

## 📡 Endpoints da API

### `POST /ocr` — Extrair texto de uma imagem

**Request:**
```
Content-Type: multipart/form-data
```

| Campo  | Tipo   | Obrigatório | Descrição                          |
|--------|--------|-------------|-------------------------------------|
| `file` | File   | ✅ Sim      | Imagem PNG, JPG, TIFF, BMP ou WebP |
| `lang` | String | ❌ Não      | Idioma(s): `por`, `eng`, `por+eng` |

**Teste com curl:**
```bash
curl -X POST http://localhost:5000/ocr \
  -F "file=@/caminho/para/sua-imagem.png" \
  -F "lang=por+eng"
```

**Resposta de sucesso (200):**
```json
{
  "pages": [
    {
      "page_number": 1,
      "text": "Texto extraído da imagem...",
      "confidence": 87.45
    }
  ],
  "total_pages": 1,
  "status": "success"
}
```

**Respostas de erro:**

| Status | Situação                              |
|--------|---------------------------------------|
| 400    | Campo `file` ausente ou arquivo vazio |
| 413    | Arquivo maior que 20 MB               |
| 415    | Tipo MIME não suportado               |
| 422    | Imagem inválida ou falha no OCR       |
| 500    | Erro interno inesperado               |

---

### `GET /health` — Status do serviço

```bash
curl http://localhost:5000/health
```

**Resposta (200):**
```json
{
  "status": "ok",
  "service": "ocr-service",
  "tesseract": {
    "installed": true,
    "version": "5.3.4.20240224",
    "available_languages": ["eng", "osd", "por"]
  }
}
```

---

## 🧪 Testando Manualmente

### Usando Python (requests):
```python
import requests

with open("documento.png", "rb") as f:
    response = requests.post(
        "http://localhost:5000/ocr",
        files={"file": ("documento.png", f, "image/png")},
        data={"lang": "por+eng"}
    )

print(response.json())
```

### Usando PowerShell:
```powershell
$file = Get-Item ".\documento.png"
$form = @{ file = $file; lang = "por+eng" }
Invoke-RestMethod -Uri "http://localhost:5000/ocr" -Method POST -Form $form
```

---

## 🏗️ Estrutura do Projeto

```
ocr-service/
├── main.py                    ← Entry point (Flask dev + Gunicorn)
├── requirements.txt           ← Dependências Python
├── .env.example               ← Template de configuração
├── .env                       ← Suas configurações (não commitar!)
│
└── app/
    ├── __init__.py            ← Application Factory (create_app)
    ├── config.py              ← Leitura centralizada do .env
    ├── models.py              ← Schemas de dados (PageResult, OcrResponse)
    │
    ├── services/
    │   ├── __init__.py
    │   └── ocr_service.py     ← Lógica Tesseract (pré-processamento + extração)
    │
    └── routes/
        ├── __init__.py
        └── ocr_routes.py      ← Endpoints Flask (POST /ocr, GET /health)
```

---

## ⚙️ Configurações do Tesseract (`--psm`)

O parâmetro `--psm` controla o modo de segmentação de página. O padrão é `3` (automático).
Para tipos específicos de documentos, pode melhorar a precisão:

| PSM | Descrição                              |
|-----|----------------------------------------|
| 3   | Segmentação automática (padrão)        |
| 6   | Bloco único de texto uniforme          |
| 11  | Texto esparso sem ordenação            |
| 13  | Linha única de texto                   |

Para mudar, edite `custom_config` em `ocr_service.py`.

---

## 🐛 Problemas Comuns

**`TesseractNotFoundError`**
→ Tesseract não está no PATH. Defina `TESSERACT_CMD` no `.env` com o caminho completo.

**`Error opening data file .../por.traineddata`**
→ Pacote de idioma Português não instalado. Baixe `por.traineddata` em
https://github.com/tesseract-ocr/tessdata e coloque na pasta `tessdata`.

**`venv\Scripts\Activate.ps1 não pode ser carregado`**
→ Execute: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

---

## 📦 Desativar o venv

```bash
deactivate
```
