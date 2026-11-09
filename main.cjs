const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn, execFile } = require('child_process');
const { existsSync, mkdirSync, writeFileSync, copyFileSync, chmodSync, readFileSync, appendFileSync } = require('fs');
const { join, dirname } = require('path');
const https = require('https');
const YAML = require('js-yaml');

const defaultUrl = 'https://github.com/Au1rxx/free-vpn-subscriptions/raw/main/output/clash.yaml';
let core = null;
let stoppingCore = false;
let lastCoreFailure = '';
const isWindows = process.platform === 'win32';
const dataDir = () => join(app.getPath('userData'), 'mihomo');
const profilePath = () => join(dataDir(), 'profile.yaml');
const configPath = () => join(dataDir(), 'config.yaml');
const coreLogPath = () => join(dataDir(), 'engine.log');
const bundledCorePath = () => app.isPackaged ? join(process.resourcesPath, isWindows ? 'mihomo.exe' : 'mihomo') : join(__dirname, 'resources', isWindows ? 'mihomo.exe' : 'mihomo');
const bundledWintunPath = () => app.isPackaged ? join(process.resourcesPath, 'wintun.dll') : join(__dirname, 'resources', 'wintun.dll');
const runtimeCorePath = () => join(dataDir(), 'bin', isWindows ? 'freezone-engine.exe' : 'freezone-engine');
const coreApi = (path, options = {}) => new Promise((resolve, reject) => {
  const request = require('http').request({ hostname: '127.0.0.1', port: 9090, path, method: options.method || 'GET', timeout: 1500, headers: { 'content-type': 'application/json' } }, response => { let data = ''; response.setEncoding('utf8'); response.on('data', chunk => data += chunk); response.on('end', () => { if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`Connection engine returned HTTP ${response.statusCode}.`)); try { resolve(JSON.parse(data || '{}')); } catch { reject(new Error('Connection engine returned an invalid response.')); } }); });
  request.on('error', reject); request.on('timeout', () => request.destroy(new Error('Connection engine did not respond.'))); if (options.body) request.write(JSON.stringify(options.body)); request.end();
});
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
function ensureCore() {
  const bundled = bundledCorePath();
  const runtime = runtimeCorePath();
  if (!existsSync(bundled)) throw new Error('The connection engine is missing from this app. Reinstall Freezone Internet.');
  const runtimeDir = dirname(runtime);
  mkdirSync(runtimeDir, { recursive: true });
  copyFileSync(bundled, runtime);
  if (isWindows && existsSync(bundledWintunPath())) copyFileSync(bundledWintunPath(), join(runtimeDir, 'wintun.dll'));
  if (!isWindows) chmodSync(runtime, 0o755);
  return runtime;
}
function ensureConfig() {
  mkdirSync(dataDir(), { recursive: true });
  if (!existsSync(profilePath()) && existsSync(configPath())) copyFileSync(configPath(), profilePath());
  if (!existsSync(profilePath())) throw new Error('Choose a subscription or import a YAML profile first.');
}
function prepareConfig() {
  let config;
  try { config = YAML.load(readFileSync(profilePath(), 'utf8')); } catch { throw new Error('This profile is not valid YAML. Choose another profile or correct its YAML.'); }
  if (!isObject(config)) throw new Error('This profile must contain a YAML configuration object.');
  config['external-controller'] = '127.0.0.1:9090';
  config['external-ui'] = '';
  if (isWindows) {
    const profileTun = isObject(config.tun) ? config.tun : {};
    config.tun = { ...profileTun, enable: true, stack: profileTun.stack || 'mips', 'auto-route': true, 'auto-detect-interface': true, mtu: profileTun.mtu || 1500 };
  }
  writeFileSync(configPath(), YAML.dump(config, { noRefs: true, lineWidth: -1 }), 'utf8');
}
function download(url, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error('The subscription redirected too many times.'));
  let location;
  try { location = new URL(url); } catch { return Promise.reject(new Error('Enter a valid HTTPS subscription URL.')); }
  if (location.protocol !== 'https:') return Promise.reject(new Error('Only HTTPS subscription URLs are allowed.'));
  return new Promise((resolve, reject) => {
    const request = https.get(location, { timeout: 15000 }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) return resolve(download(new URL(response.headers.location, location).toString(), redirects + 1));
      if (response.statusCode !== 200) return reject(new Error(`Download failed (${response.statusCode}).`));
      let data = ''; response.setEncoding('utf8');
      response.on('data', chunk => { data += chunk; if (data.length > 10 * 1024 * 1024) request.destroy(new Error('The subscription is too large.')); });
      response.on('end', () => resolve(data));
    });
    request.on('timeout', () => request.destroy(new Error('The subscription download timed out.'))); request.on('error', reject);
  });
}
async function setProfile(type, value) {
  const yaml = type === 'default' || type === 'url' ? await download(type === 'default' ? defaultUrl : value) : value;
  try { if (!isObject(YAML.load(yaml))) throw new Error(); } catch { throw new Error('This does not look like a valid Clash YAML profile.'); }
  mkdirSync(dataDir(), { recursive: true }); writeFileSync(profilePath(), `${yaml.trim()}\n`, 'utf8'); return { saved: true };
}
function recordCoreOutput(chunk) { try { appendFileSync(coreLogPath(), chunk); } catch {} }
async function waitForCore() {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (!core || core.exitCode !== null) throw new Error(lastCoreFailure || 'The connection engine stopped before it was ready.');
    try { return await coreApi('/version'); } catch { await sleep(300); }
  }
  throw new Error(lastCoreFailure || 'The connection engine did not become ready. Check your profile and Windows firewall, then try again.');
}
async function startCore() {
  if (core && core.exitCode === null) { try { await coreApi('/version'); return { running: true }; } catch { await stopCore(); } }
  const runtime = ensureCore(); ensureConfig(); prepareConfig();
  lastCoreFailure = ''; stoppingCore = false; writeFileSync(coreLogPath(), '', 'utf8');
  const child = spawn(runtime, ['-d', dataDir(), '-f', configPath()], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  core = child; child.stdout.on('data', recordCoreOutput); child.stderr.on('data', recordCoreOutput);
  child.on('error', error => { lastCoreFailure = `The connection engine could not start: ${error.message}`; if (core === child) core = null; });
  child.on('exit', (code, signal) => { if (!child.freezoneStopping && code !== 0) lastCoreFailure = `The connection engine stopped unexpectedly (${signal || `exit code ${code}`}).`; if (core === child) core = null; });
  await waitForCore(); return { running: true };
}
async function stopCore() { stoppingCore = true; const child = core; if (child && child.exitCode === null) { child.freezoneStopping = true; child.kill(); await sleep(350); } core = null; lastCoreFailure = ''; stoppingCore = false; return { running: false }; }
async function recoverNetwork() { await stopCore(); if (isWindows) await new Promise(resolve => execFile('taskkill', ['/F', '/IM', 'freezone-engine.exe'], () => resolve())); return { recovered: true }; }
function runNetworksetup(args) { return new Promise((resolve, reject) => execFile('/usr/sbin/networksetup', args, error => error ? reject(error) : resolve())); }
async function systemProxy(enable) {
  if (isWindows) throw new Error('Windows uses the device tunnel when you connect.');
  try {
    if (enable) {
      await runNetworksetup(['-setwebproxy', 'Wi-Fi', '127.0.0.1', '7890']);
      await runNetworksetup(['-setsecurewebproxy', 'Wi-Fi', '127.0.0.1', '7890']);
      await runNetworksetup(['-setwebproxystate', 'Wi-Fi', 'on']);
      await runNetworksetup(['-setsecurewebproxystate', 'Wi-Fi', 'on']);
    } else {
      await runNetworksetup(['-setwebproxystate', 'Wi-Fi', 'off']);
      await runNetworksetup(['-setsecurewebproxystate', 'Wi-Fi', 'off']);
    }
    return { enabled: enable };
  } catch {
    throw new Error('macOS could not change the Wi‑Fi proxy. Check the active service name and permissions.');
  }
}
app.whenReady().then(() => { const win = new BrowserWindow({ width: 1120, height: 760, minWidth: 860, minHeight: 600, title: 'Freezone Internet', webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } }); win.loadFile(join(__dirname, 'renderer', 'index.html')); });
ipcMain.handle('profile:set', (_, type, value) => setProfile(type, value));
ipcMain.handle('core:start', () => startCore()); ipcMain.handle('core:stop', () => stopCore());
ipcMain.handle('core:recover', () => recoverNetwork());
ipcMain.handle('core:status', async () => { if (!core || core.exitCode !== null) return { running: false, version: null, error: lastCoreFailure }; try { return { running: true, version: await coreApi('/version'), error: '' }; } catch { return { running: false, version: null, error: lastCoreFailure }; } });
ipcMain.handle('proxy:set', (_, enable) => systemProxy(enable));
ipcMain.handle('platform:get', () => process.platform);
ipcMain.handle('profile:open-file', async () => { const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Clash YAML', extensions: ['yaml', 'yml'] }] }); if (result.canceled) return null; return require('fs').readFileSync(result.filePaths[0], 'utf8'); });
app.on('before-quit', stopCore);
