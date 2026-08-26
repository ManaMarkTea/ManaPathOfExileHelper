const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

const tradeApi = require('./src/tradeApi');
const { StatMatcher } = require('./src/statMatcher');
const { BaseTypeResolver } = require('./src/baseTypeResolver');
const { checkPrice } = require('./src/priceEngine');

let mainWindow;
const statMatcher = new StatMatcher();
const baseTypeResolver = new BaseTypeResolver();
let dataReady = Promise.resolve();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 620,
    alwaysOnTop: true,
    resizable: true,
    title: 'PoE Price Check',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  dataReady = Promise.all([statMatcher.init().catch(() => {}), baseTypeResolver.init().catch(() => {})]);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('get-leagues', async () => {
  const leagues = await tradeApi.getLeagues();
  const current = tradeApi.pickCurrentLeague(leagues);
  return { leagues: leagues.map((l) => ({ id: l.id, text: l.text })), current };
});

ipcMain.handle('check-price', async (event, { itemText, league }) => {
  // The first check right after launch can otherwise race the stat/item data fetches and
  // silently fall back to a broad, unmatched search instead of waiting the extra moment.
  await dataReady;
  return checkPrice(itemText, league, statMatcher, baseTypeResolver);
});

ipcMain.handle('open-external', async (event, url) => {
  if (typeof url === 'string' && url.startsWith('https://www.pathofexile.com/')) {
    await shell.openExternal(url);
  }
});
