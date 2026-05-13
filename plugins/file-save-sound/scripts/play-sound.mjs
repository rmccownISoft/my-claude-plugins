import { platform } from 'node:os'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Consume stdin to avoid broken pipe (hook runtime always pipes JSON in)
process.stdin.resume()
await new Promise(resolve => process.stdin.once('end', resolve))

const os = platform()

// Resolution order: user override → bundled sound → system sound
const bundled = process.env.CLAUDE_PLUGIN_ROOT
    ? join(process.env.CLAUDE_PLUGIN_ROOT, 'sounds', 'chime.mp3')
    : null
const soundFile = process.env.CLAUDE_SOUND_FILE
    || (bundled && existsSync(bundled) ? bundled : null)

function playFile(file) {
    if (os === 'win32') {
        // MediaPlayer handles WAV, MP3, WMA, etc.
        spawnSync('powershell', [
            '-NoProfile', '-NonInteractive', '-Command',
            `Add-Type -AssemblyName presentationCore; $m = [System.Windows.Media.MediaPlayer]::new(); $m.Open([uri]'${file}'); $m.Play(); Start-Sleep -Seconds 3`
        ], { stdio: 'ignore' })
    } else if (os === 'darwin') {
        spawnSync('afplay', [file], { stdio: 'ignore' })
    } else {
        for (const [cmd, ...args] of [
            ['paplay', file],
            ['aplay', file],
            ['ffplay', '-nodisp', '-autoexit', file],
        ]) {
            if (spawnSync(cmd, args, { stdio: 'ignore' }).status === 0) break
        }
    }
}

function playSystemSound() {
    if (os === 'win32') {
        spawnSync('powershell', [
            '-NoProfile', '-NonInteractive', '-Command',
            '[System.Media.SystemSounds]::Asterisk.Play(); Start-Sleep -Milliseconds 500'
        ], { stdio: 'ignore' })
    } else if (os === 'darwin') {
        spawnSync('afplay', ['/System/Library/Sounds/Ping.aiff'], { stdio: 'ignore' })
    } else {
        spawnSync('paplay', ['/usr/share/sounds/freedesktop/stereo/complete.oga'], { stdio: 'ignore' })
    }
}

if (soundFile) {
    playFile(soundFile)
} else {
    playSystemSound()
}

process.exit(0)
