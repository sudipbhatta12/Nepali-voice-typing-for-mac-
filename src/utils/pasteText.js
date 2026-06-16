const { clipboard } = require('electron');
const { execFile } = require('child_process');

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }

      resolve(stdout);
    });
  });
}

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: 5000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }

        resolve(stdout);
      }
    );
  });
}

async function pasteText(text) {
  const cleanText = String(text || '').trim();

  if (!cleanText) {
    throw new Error('No speech detected. Try speaking a little closer to the microphone.');
  }

  clipboard.writeText(cleanText);

  if (process.platform === 'win32') {
    try {
      await runPowerShell('$shell = New-Object -ComObject WScript.Shell; Start-Sleep -Milliseconds 150; $shell.SendKeys("^v")');
      return {
        pasted: true,
        message: 'Text pasted with Ctrl+V.'
      };
    } catch (error) {
      throw new Error(`Text was copied, but Windows paste failed. Click in a text box and press Ctrl+V manually. Original error: ${error.message}`);
    }
  }

  if (process.platform !== 'darwin') {
    return {
      pasted: false,
      message: 'Text copied. Live paste is only implemented for macOS and Windows.'
    };
  }

  try {
    await runAppleScript('tell application "System Events" to keystroke "v" using command down');
    return {
      pasted: true,
      message: 'Text pasted.'
    };
  } catch (error) {
    throw new Error(`Text was copied, but paste failed. Open System Settings > Privacy & Security > Accessibility and allow Nepali Voice Typer. Original error: ${error.message}`);
  }
}

module.exports = {
  pasteText
};
