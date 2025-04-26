import { spawn, ChildProcess } from 'child_process'
import { existsSync, writeFileSync, appendFileSync } from 'fs'
import { join }                from 'path'
import { dialog, BrowserWindow, systemPreferences, desktopCapturer, app } from 'electron'
import { checkPermissions }    from './permission'
import { AssemblyAI }          from 'assemblyai'
import { ipcMain } from 'electron';


interface RecordingOptions {
  recFolder: string
  recFilename: string
  trFolder: string
  trFilename: string
  window: BrowserWindow
}

interface RecordingResponse {
  code: 'RECORDING_STARTED' | 'RECORDING_STOPPED' | 'ERROR' | 'MIC' | 'SCR'
  timestamp: string
  path?: string
  error?: string
  data?: string
}


type Transcriber = ReturnType<typeof AssemblyAI.prototype.realtime.transcriber>

let recordingProcess: ChildProcess | null = null
let transcriber1: Transcriber | null = null
let transcriber2: Transcriber | null = null
const SAMPLE_RATE = 16_000   

// Add type for MediaStream
type ExtendedAudioSourceNode = MediaStreamAudioSourceNode & {
  mediaStream?: MediaStream;
};

let micStream: ExtendedAudioSourceNode | null = null
let audioContext: AudioContext | null = null
let mediaRecorder: MediaRecorder | null = null


function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = Buffer.from(base64, 'base64').toString('binary')
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

// Global cleanup function
const cleanupResources = async () => {
  try {
    // Stop all audio tracks from microphone
    if (micStream?.mediaStream) {
      micStream.mediaStream.getTracks().forEach(track => {
        track.stop()
        console.log('🎤 Microphone track stopped')
      })
      micStream.disconnect()
      micStream = null
    }

    // Stop any active media recorder
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
      mediaRecorder = null
      console.log('📼 MediaRecorder stopped')
    }

    // Close audio context
    if (audioContext && audioContext.state !== 'closed') {
      await audioContext.close()
      audioContext = null
      console.log('🔊 AudioContext closed')
    }

    // Kill recording process
    if (recordingProcess) {
      recordingProcess.kill('SIGINT')
      recordingProcess = null
      console.log('🎙️ Recording process killed')
    }

    // Close transcribers
    if (transcriber1) {
      await transcriber1.close()
      transcriber1 = null
      console.log('📝 Screen transcriber closed')
    }
    if (transcriber2) {
      await transcriber2.close()
      transcriber2 = null
      console.log('📝 Mic transcriber closed')
    }

    // Remove any remaining event listeners
    ipcMain.removeAllListeners('audio-data')
  } catch (error) {
    console.error('Error during cleanup:', error)
  }
}

async function initAssemblyAI (window: BrowserWindow, trFolder: string, trFilename: string) {
  if (transcriber1 || transcriber2) {
    await cleanupResources() // Cleanup existing resources before reinitializing
  }

  try {
    const apiKey = process.env.ASSEMBLYAI_API_KEY
    if (!apiKey) {
      throw new Error('AssemblyAI API key not found in environment variables')
    }

    const client = new AssemblyAI({ apiKey })

    transcriber1 = client.realtime.transcriber({ sampleRate: SAMPLE_RATE })
    transcriber2 = client.realtime.transcriber({ sampleRate: SAMPLE_RATE })

    const setupErrorHandler = (transcriber: Transcriber, source: string) => {
      transcriber.on('error', (err: Error) => {
        console.error(`AssemblyAI ${source} error:`, err)
        window.webContents.send('transcription-status', 'error', err.message)
        // Attempt recovery
        setTimeout(async () => {
          try {
            await transcriber.connect()
          } catch (reconnectError) {
            console.error(`Failed to reconnect ${source}:`, reconnectError)
          }
        }, 5000)
      })
    }

    setupErrorHandler(transcriber1, 'screen')
    setupErrorHandler(transcriber2, 'microphone')

    ipcMain.on('audio-data', (_e, ab: ArrayBuffer) => {
      try {
        console.log('✅ main got chunk', ab.byteLength)
        transcriber2?.sendAudio(ab)
      } catch (error) {
        console.error('Error processing audio data:', error)
      }
    })
    

    transcriber1.on('open', ({ sessionId }) => {
      console.log('AssemblyAI realtime session', sessionId)
      window.webContents.send('transcription-status', 'connected')
    })

    transcriber2.on('open', ({ sessionId }) => {
      console.log('AssemblyAI realtime session', sessionId)
      window.webContents.send('transcription-status', 'connected')
    })

    transcriber1.on('transcript', msg => {
      if (!msg.text) return
      const isFinal = msg.message_type === 'FinalTranscript'
      console.log('msg', msg)
      if (isFinal) {
        console.log('🔵 Screen:', msg.text)
        const trFullPath = join(trFolder, `${trFilename}.txt`)
        appendFileSync(trFullPath, "\n\nScreen: " + msg.text + '\n\n\n')
      }
      window.webContents.send('transcription-update', {
        source: 'screen',
        text: msg.text,
        isFinal,
        timestamp: Date.now()
      })
    })

    transcriber2.on('transcript', msg => {
      if (!msg.text) return
      const isFinal = msg.message_type === 'FinalTranscript'
      console.log('msg', msg)
      if (isFinal) {
        console.log('🔵 MIC: ' + msg.text)
        const trFullPath = join(trFolder, `${trFilename}.txt`)
        appendFileSync(trFullPath, '\n\nMIC: \n' + msg.text + '\n\n\n')
      }
      window.webContents.send('transcription-update', {
        source: 'microphone',
        text: msg.text,
        isFinal,
        timestamp: Date.now()
      })
    })

    await Promise.all([
      transcriber1.connect(),
      transcriber2.connect()
    ]).catch(error => {
      throw new Error(`Failed to connect to AssemblyAI: ${error.message}`)
    })

  } catch (error) {
    console.error('Failed to initialize AssemblyAI:', error)
    window.webContents.send('transcription-status', 'error', error instanceof Error ? error.message : 'Unknown error')
    throw error // Propagate error to caller
  }
}



const initRecording = (
  recFolder: string,
  trFolder: string,
  recFilename: string,
  trFilename: string,
  window: BrowserWindow
): Promise<boolean> => {
  return new Promise(async (resolve, reject) => {
    try {
      await initAssemblyAI(window, trFolder, trFilename)

      recordingProcess = spawn('./src/swift/Recorder', ['--pipe'], {
        stdio: ['ignore', 'pipe', 'inherit']
      })

      if (!recordingProcess.stdout) {
        throw new Error('Failed to spawn recorder: stdout not available')
      }

      console.log('🎙️  Recorder spawned (pid', recordingProcess.pid, ')')

      // Send initial recording status
      window.webContents.send(
        'recording-status',
        'START_RECORDING',
        Date.now(),
        join(recFolder, `${recFilename}.flac`),
        join(trFolder, `${trFilename}.txt`),
        recFilename,
        trFilename
      )

      let buffer = ''
      recordingProcess.stdout.on('data', chunk => {
        try {
          buffer += chunk.toString()

          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.trim()) continue
            console.log('line', line)

            if (line.startsWith('{')) {
              const j = JSON.parse(line) as RecordingResponse
              const ts = new Date(j.timestamp).getTime()

              if (j.code === 'RECORDING_STARTED') {
                window.webContents.send(
                  'recording-status', 'START_RECORDING', ts, j.path
                )
                resolve(true)
              }
              if (j.code === 'RECORDING_STOPPED') {
                window.webContents.send(
                  'recording-status', 'STOP_RECORDING', ts, j.path
                )
              }
              if (j.code === 'SCR' && j.data && transcriber1) {
                const arrayBuffer = base64ToArrayBuffer(j.data)
                transcriber1.sendAudio(arrayBuffer)
              }
            }
          }
        } catch (error) {
          console.error('Error processing recorder output:', error)
        }
      })

      recordingProcess.on('error', err => {
        console.error('Recorder failed:', err)
        reject(err)
      })

      recordingProcess.on('close', async (code) => {
        console.log('Recorder exited with code:', code)
        await cleanupResources()
      })

    } catch (error) {
      console.error('Error in initRecording:', error)
      await cleanupResources()
      reject(error)
    }
  })
}


export const startRecording = async ({
  recFolder,
  trFolder,
  recFilename,
  trFilename,
  window
}: RecordingOptions): Promise<void> => {
  try {
    if (!(await checkPermissions())) {
      window.loadFile('./src/electron/screens/permission-denied/screen.html')
      return
    }

    const recFullPath = join(recFolder, `${recFilename}.flac`)
    const trFullPath = join(trFolder, `${trFilename}.txt`)

    if (existsSync(recFullPath) || existsSync(trFullPath)) {
      await dialog.showMessageBox(window, {
        type: 'error',
        title: 'Recording Error',
        message: 'File already exists. Choose another filename.',
        buttons: ['OK']
      })
      window.loadFile('./src/electron/screens/recording/screen.html')
      return
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (await initRecording(recFolder, trFolder, recFilename, trFilename, window)) {
          return
        }
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error)
        if (attempt === 3) {
          throw error
        }
      }
    }

    throw new Error('Failed to start recording after 3 attempts')
  } catch (error) {
    console.error('Fatal error in startRecording:', error)
    await cleanupResources()
    window.webContents.send('recording-status', 'ERROR', Date.now(), null)
    
    // Show error dialog to user
    await dialog.showMessageBox(window, {
      type: 'error',
      title: 'Recording Error',
      message: 'Failed to start recording. Please try again or restart the application.',
      detail: error instanceof Error ? error.message : 'Unknown error',
      buttons: ['OK']
    })
  }
}

export const stopRecording = async (): Promise<void> => {
  try {
    await cleanupResources()
  } catch (error) {
    console.error('Error stopping recording:', error)
  }
}

// Register cleanup handlers for application exit
app.on('before-quit', async (event) => {
  event.preventDefault() // Prevent immediate quit
  await cleanupResources()
  app.exit(0) // Force quit after cleanup
})

// Handle renderer process crashes
app.on('render-process-gone', async (_event, _webContents, details) => {
  console.error('Renderer process crashed:', details.reason)
  await cleanupResources()
})

// Handle window unresponsiveness
app.on('window-all-closed', async () => {
  await cleanupResources()
  // Send event to renderer to stop any active audio processing
  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send('stop-audio-processing')
  })
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Handle force quit
process.on('SIGTERM', async () => {
  await cleanupResources()
  app.quit()
})

process.on('SIGINT', async () => {
  await cleanupResources()
  app.quit()
})
