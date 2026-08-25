// Rasterizes build/icon.svg into build/icon.png using Electron's own Chromium renderer,
// so the app icon can be edited as plain SVG without needing any image-editing tools or
// extra npm dependencies. electron-builder auto-generates the Windows .ico from the PNG.

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const SIZE = 256; // matches build/icon.svg's own viewBox/width/height

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    useContentSize: true,
    frame: false,
    show: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });

  await win.loadFile(path.join(__dirname, '..', 'build', 'icon.svg'));
  await new Promise((resolve) => setTimeout(resolve, 100));

  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.png'), image.toPNG());

  console.log('Wrote build/icon.png');
  app.quit();
});
