<div align="center">

<br/>

```text
██╗    ██╗██╗███╗   ██╗██████╗ ███████╗ ██████╗ ██╗   ██╗███╗   ██╗██████╗
██║    ██║██║████╗  ██║██╔══██╗██╔════╝██╔═══██╗██║   ██║████╗  ██║██╔══██╗
██║ █╗ ██║██║██╔██╗ ██║██║  ██║███████╗██║   ██║██║   ██║██╔██╗ ██║██║  ██║
██║███╗██║██║██║╚██╗██║██║  ██║╚════██║██║   ██║██║   ██║██║╚██╗██║██║  ██║
╚███╔███╔╝██║██║ ╚████║██████╔╝███████║╚██████╔╝╚██████╔╝██║ ╚████║██████╔╝
 ╚══╝╚══╝ ╚═╝╚═╝  ╚═══╝╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝╚═════╝
```

**Um player de música moderno, alimentado pelo YouTube Music.**

[![Status](https://img.shields.io/badge/status-beta-orange?style=flat-square)](https://github.com)
[![Versão](https://img.shields.io/badge/versão-0.1.0--beta-blue?style=flat-square)](https://github.com)
[![API](https://img.shields.io/badge/API-Innertube-red?style=flat-square)](https://github.com)
[![Licença](https://img.shields.io/badge/licença-GPLv3-green?style=flat-square)](LICENSE)

</div>

---

> ⚠️ **Aviso:** Este projeto está em desenvolvimento ativo e em fase **beta**. Bugs são esperados. Contribuições e feedbacks são muito bem-vindos.

---

## 🎵 O que é o WindSound?

**WindSound** é um player de música desktop em desenvolvimento que utiliza a **Innertube API** para buscar, organizar e reproduzir músicas diretamente do YouTube Music. Com login via conta do usuário, o app oferece uma experiência mais personalizada, com home conectada, busca integrada e fila inteligente.

O projeto nasceu com a ideia de criar uma interface musical limpa e intuitiva, aproveitando o enorme acervo disponível no YouTube, sem depender de serviços de streaming pagos.

---

## ✨ Funcionalidades atuais

- 🔐 **Login com YouTube Music** — autenticação pela conta do usuário no app desktop
- 🎶 **Reprodução de músicas** — streaming com backend local
- 🔍 **Busca integrada** — músicas e playlists
- 📋 **Fila de reprodução** — controle da próxima sequência
- 🧠 **Rádio automática** — continua músicas parecidas quando necessário
- 🎨 **Tema customizável** — interface escura com identidade própria

> 🚧 Mais funcionalidades estão sendo desenvolvidas.

---

## 🛠️ Stack

| Tecnologia | Uso |
|---|---|
| **Electron** | Aplicação desktop |
| **React + TypeScript** | Interface |
| **Vite** | Build e desenvolvimento |
| **Innertube API** | Comunicação com o ecossistema do YouTube Music |
| **yt-dlp** | Resolução de stream de áudio |
| **Zustand** | Estado global |

---

## 📦 Instalação

### 1. Pré-requisitos

Antes de tudo, você precisa ter instalado:

- **Node.js 20 ou superior**
- **npm** ou **pnpm**
- **Python 3.10 ou superior**

Para conferir:

```bash
node -v
npm -v
python --version
```

### 2. Clonar o repositório

```bash
git clone https://github.com/murasssh/WindSound.git
cd WindSound
```

### 3. Instalar dependências do projeto

Se usar `npm`:

```bash
npm install
```

Se usar `pnpm`:

```bash
pnpm install
```

### 4. Instalar o `yt-dlp`

O backend atual usa `yt-dlp` para resolver os streams de áudio. Instale com:

```bash
python -m pip install -U yt-dlp
```

Depois, confirme:

```bash
python -m yt_dlp --version
```

### 5. Rodar em modo de desenvolvimento

Com `npm`:

```bash
npm run dev
```

Com `pnpm`:

```bash
pnpm dev
```

Isso abre o app desktop com Electron.

### 6. Build local

Para validar a build do frontend:

```bash
npm run build:web
```

Ou:

```bash
pnpm build:web
```

Para gerar a build desktop:

```bash
npm run build
```

Ou:

```bash
pnpm build
```

> Por enquanto o uso principal ainda é por comando. O instalador executável pode vir em uma release futura.

---

## 🔑 Como conectar sua conta

1. Abra o WindSound.
2. Use o bloco da conta na barra lateral.
3. Faça login com sua conta do YouTube Music.
4. Depois disso, a Home e as recomendações passam a usar sua sessão local.

---

## ⚠️ Aviso legal

O WindSound utiliza a **Innertube API**, que é a API interna do YouTube. O uso desta API não é oficialmente suportado pelo Google. Este projeto é desenvolvido para fins educacionais e pessoais. Respeite os [Termos de Serviço do YouTube](https://www.youtube.com/t/terms) ao utilizar este software.

---

## 📄 Licença

Distribuído sob a licença GPLv3. Veja [`LICENSE`](LICENSE) para mais informações.

---

<div align="center">

Feito com 🎧 por **Murillo Bernardo**

*WindSound — Ao Som do Vento.*

</div>
