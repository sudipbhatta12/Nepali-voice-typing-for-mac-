# Nepali Voice Typer for macOS

Nepali Voice Typer is a small floating microphone app for macOS. After setup, it starts listening automatically, streams Nepali speech to Google Speech-to-Text using `ne-NP`, and types finalized Nepali text into the currently active app.

You can build and edit the project on Windows, but the final target is macOS.

## What Is Included

- Floating always-on-top Electron window
- Real-time mic streaming with a visual recording state
- Automatic live listening on macOS after Google credentials are set
- Automatic stop after 3 minutes of silence
- Google Cloud Speech-to-Text transcription for Nepali
- Always-on clipboard copy and live paste of finalized speech chunks
- Settings page for credentials, language, shortcuts, always-on-top, and start at login
- Start at login support for the packaged macOS app
- Menu bar icon to show/hide the floating mic, open settings, and quit
- GitHub Actions workflow that builds a macOS `.dmg` and `.zip`

## Install Node.js

1. Go to [https://nodejs.org](https://nodejs.org).
2. Download the LTS version.
3. Install it.
4. Open a terminal and check:

```bash
node -v
npm -v
```

## Install The App Dependencies

Open a terminal in this folder:

```bash
cd Nepali-voice-typing-for-mac-
npm install
```

## Run Locally

```bash
npm start
```

On Windows, you can test the UI, recording flow, Google recognition, clipboard copy, and a simple `Ctrl+V` paste into the active text field. The final target remains macOS.

## Set Up Google Cloud Credentials

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create or choose a project.
3. Enable the Speech-to-Text API.
4. Create a service account.
5. Create a JSON key for that service account.
6. Keep the JSON file private. Do not commit it to GitHub.

You can use credentials in either of these ways:

```bash
set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json
```

On macOS or Linux:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
```

Or open the app settings and choose the JSON file path.

## macOS Permissions

The app needs permission before recording and pasting can work:

- System Settings > Privacy & Security > Microphone
- System Settings > Privacy & Security > Accessibility
- System Settings > Privacy & Security > Input Monitoring, if paste still does not work

If paste fails, the text is still copied to the clipboard. Enable Accessibility permission, then try again.

## Build For macOS On GitHub Actions

This is the easiest option when you are coding from Windows.

1. Create a GitHub repository.
2. Push this project to GitHub.
3. Open the repository on GitHub.
4. Go to Actions.
5. Run the "Build macOS App" workflow.
6. Download the artifact named `nepali-voice-typer-macos`.

The artifact contains the macOS `.dmg` and `.zip` files.

## Install On A Mac Without Developer Commands

The Mac user does not need `npm install`, `npm start`, Node.js, or the terminal.

1. Download the macOS artifact from GitHub Actions.
2. Open the `.dmg`.
3. Drag **Nepali Voice Typer** into the **Applications** folder.
4. Open **Nepali Voice Typer** from Applications.
5. Open Settings from the floating mic or the menu bar icon.
6. Select the Google service account JSON file.
7. Leave **Start Nepali Voice Typer automatically when the Mac starts** turned on.
8. Allow Microphone and Accessibility permissions when macOS asks.
9. After credentials and permissions are ready, the app starts listening automatically and types finalized Nepali speech into the active app.

If the app is not code signed with an Apple Developer ID, macOS may show an unidentified developer warning the first time it opens. For a smoother beginner install, sign and notarize the app before sharing it.

## Build For macOS On A Mac

```bash
npm install
npm run build:mac
```

The output appears in the `dist` folder.

## Audio Format Note

For real-time recognition, the app captures browser microphone audio, converts it to mono `LINEAR16` PCM at 16 kHz, and streams small chunks to Google Speech-to-Text. Interim words appear in the floating window. Finalized chunks are copied and pasted into the active app.

## Common Errors

### Microphone permission denied

Enable Microphone permission in macOS System Settings, then restart the app.

### Google credentials are missing

Set `GOOGLE_APPLICATION_CREDENTIALS` or choose the service account JSON in Settings.

### Google API error

Check that Speech-to-Text API is enabled and your service account has permission.

### No speech detected

Speak clearly after the mic turns red. Try moving closer to the microphone.

### Paste permission missing

Enable Accessibility permission for Nepali Voice Typer. If needed, also enable Input Monitoring.

### Windows testing behaves differently

Windows is only for coding and UI testing. The final target is macOS, where paste uses Command+V through AppleScript and requires Accessibility permission.

## Future Improvements

- TODO: Add direct replacement of interim draft text inside the active app.
- TODO: Add better full-screen app auto-hide detection.
- TODO: Add an offline speech recognition option.
- TODO: Add direct native macOS Accessibility text insertion.
