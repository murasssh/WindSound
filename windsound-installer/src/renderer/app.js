let resolvedExePath = null
let chosenDir = null
let launchContext = null

const screens = {
  welcome: document.getElementById('screen-welcome'),
  install: document.getElementById('screen-install'),
  done: document.getElementById('screen-done'),
  error: document.getElementById('screen-error'),
}

const show = (name) => {
  for (const [key, element] of Object.entries(screens)) {
    element.classList.toggle('hidden', key !== name)
  }
}

const getStepElements = () => Array.from(document.querySelectorAll('.step'))

const resetSteps = () => {
  const steps = getStepElements()
  for (let index = 0; index < steps.length; index += 1) {
    const element = steps[index]
    element.className = 'step'
    element.querySelector('.step-msg').textContent = 'Aguardando...'
    element.querySelector('.step-bar').style.width = '0%'
  }
}

const applyLaunchContext = (context) => {
  launchContext = context
  const isUpdate = context.mode === 'update'

  document.getElementById('mode-badge').textContent = isUpdate ? 'Atualização automática' : 'Instalação guiada'
  document.getElementById('header-title').textContent = isUpdate ? 'WindSound Updater' : 'WindSound Installer'
  document.getElementById('header-sub').textContent = isUpdate
    ? 'Aplicando a release nova sem apagar dados da conta.'
    : 'Pacote oficial com update seguro e dados preservados.'
  document.getElementById('welcome-kicker').textContent = isUpdate ? 'Nova versão detectada' : 'Distribuição oficial'
  document.getElementById('welcome-title').textContent = isUpdate ? 'Atualizar o WindSound' : 'Instalar o WindSound'
  document.getElementById('welcome-desc').textContent = isUpdate
    ? 'O updater baixa a release mais recente, substitui só os arquivos do programa e mantém a sessão, preferências e dados pessoais preservados fora da pasta do app.'
    : 'O instalador baixa o pacote pronto da release do GitHub, aplica a versão nova com segurança e mantém seus dados pessoais fora da pasta do programa.'
  document.getElementById('progress-title').textContent = isUpdate ? 'Aplicando atualização' : 'Preparando instalação'
  document.getElementById('dir-title').textContent = isUpdate ? 'Pasta atual do aplicativo' : 'Pasta do aplicativo'
  document.getElementById('btn-install').textContent = isUpdate ? 'Atualizar agora' : 'Instalar WindSound'
  document.getElementById('done-title').textContent = isUpdate ? 'WindSound atualizado' : 'WindSound instalado'
  document.getElementById('done-sub').textContent = isUpdate
    ? 'A atualização foi aplicada com sucesso. Seus dados ficaram preservados e o app já pode abrir na nova versão.'
    : 'O pacote foi aplicado com sucesso. Seus dados ficaram preservados e o app está pronto para abrir.'

  const browseButton = document.getElementById('btn-browse')
  browseButton.classList.toggle('hidden', isUpdate)
}

const appendLogLine = (line) => {
  const box = document.getElementById('log-box')
  const span = document.createElement('span')
  span.className = 'log-line'

  if (line.includes('[ERROR]') || line.includes('Erro') || line.includes('falha')) {
    span.classList.add('error')
  } else if (line.includes('[warn]')) {
    span.classList.add('warn')
  } else if (line.startsWith('✓') || line.startsWith('🎵')) {
    span.classList.add('ok')
  }

  span.textContent = line
  box.appendChild(span)
  box.appendChild(document.createElement('br'))
  box.scrollTop = box.scrollHeight
}

window.addEventListener('DOMContentLoaded', async () => {
  show('welcome')

  launchContext = await window.installer.getContext()
  applyLaunchContext(launchContext)

  chosenDir = launchContext.targetDir || (await window.installer.getDefaultDir())
  document.getElementById('install-dir').textContent = chosenDir

  document.getElementById('btn-browse').addEventListener('click', async () => {
    const selected = await window.installer.selectFolder()
    if (selected) {
      chosenDir = selected
      document.getElementById('install-dir').textContent = selected
    }
  })

  document.getElementById('btn-install').addEventListener('click', async () => {
    resetSteps()
    document.getElementById('log-box').innerHTML = ''
    show('install')
    await window.installer.start(chosenDir)
  })

  document.getElementById('btn-open').addEventListener('click', async () => {
    await window.installer.openExe(resolvedExePath)
  })

  document.getElementById('btn-retry').addEventListener('click', () => {
    document.getElementById('error-msg').textContent = ''
    document.getElementById('log-box').innerHTML = ''
    resetSteps()
    show('welcome')
  })

  window.installer.onStep(({ step, status, message, progress }) => {
    const element = document.querySelector(`.step[data-step="${step}"]`)
    if (!element) {
      return
    }

    element.className = `step ${status}`
    element.querySelector('.step-msg').textContent = message

    const bar = element.querySelector('.step-bar')
    if (status === 'running' && progress !== undefined) {
      bar.style.width = `${progress}%`
    }
  })

  window.installer.onLog((line) => {
    appendLogLine(line)
  })

  window.installer.onError((message) => {
    document.getElementById('error-msg').textContent = message
    show('error')
  })

  window.installer.onDone((payload) => {
    resolvedExePath = payload?.exePath || null
    show('done')
  })
})
