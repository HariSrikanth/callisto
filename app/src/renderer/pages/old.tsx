import React, { useEffect, useState, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { RecordingStatus, RecordingConfig, TranscriptData } from '../types/recording'

const Recording: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const config = location.state as RecordingConfig

  // Redirect to setup if no config
  useEffect(() => {
    if (!config) {
      navigate('/')
    } else {
      // Start mic when component mounts with valid config
      window.Electron.ipcRenderer.startMic()
    }
  }, [config, navigate])

  const [status, setStatus] = useState<RecordingStatus>({
    isRecording: true,
    elapsedTime: 0,
    recOutputPath: null,
    trOutputPath: null
  })

  const [screenTranscript, setScreenTranscript] = useState<TranscriptData>({ final: '', interim: '' })
  const [micTranscript, setMicTranscript] = useState<TranscriptData>({ final: '', interim: '' })
  const [notes, setNotes] = useState('')

  const timerRef = useRef<NodeJS.Timeout>()
  const startTimeRef = useRef<number>(0)

  useEffect(() => {
    const listener = async (
      _evt: unknown,
      recStatus: string,
      timestamp: number,
      recPath?: string,
      trPath?: string
    ) => {
      if (recStatus === 'START_RECORDING') {
        startTimeRef.current = timestamp
        tick()
        setStatus(prev => ({
          ...prev,
          recOutputPath: recPath ?? null,
          trOutputPath: trPath ?? null
        }))
      }

      if (recStatus === 'STOP_RECORDING') {
        if (timerRef.current) clearTimeout(timerRef.current)
        setStatus(prev => ({ ...prev, isRecording: false }))
        navigate('/')
      }
    }

    window.Electron.ipcRenderer.on('recording-status', listener)
    return () => {
      window.Electron.ipcRenderer.off('recording-status', listener)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [navigate])

  useEffect(() => {
    window.Electron.ipcRenderer.on('transcription-update', (data: {
      source: 'screen' | 'microphone',
      text: string,
      isFinal: boolean,
      timestamp: number
    }) => {
      if (data.source === 'screen') {
        setScreenTranscript(prev => ({
          final: data.isFinal ? prev.final + data.text + '\n' : prev.final,
          interim: data.isFinal ? '' : data.text
        }))
      } else {
        setMicTranscript(prev => ({
          final: data.isFinal ? prev.final + data.text + '\n' : prev.final,
          interim: data.isFinal ? '' : data.text
        }))
      }
    })

    return () => {
      window.Electron.ipcRenderer.removeAllListeners('transcription-update')
    }
  }, [])

  useEffect(() => {
    
    if (config?.trFilename) {
      const notePath = window.Electron.path.join(config.trFolder, `${config.trFilename}-notes.txt`)
      window.Electron.ipcRenderer.invoke('write-file', notePath, notes)
    }
  }, [notes, config])

  const tick = () => {
    setStatus(prev => ({
      ...prev,
      elapsedTime: Math.floor((Date.now() - startTimeRef.current) / 1000)
    }))
    timerRef.current = setTimeout(tick, 1000)
  }

  const handleStopRecording = () => {
    window.Electron.ipcRenderer.stopRecording()
  }

  const fmt = (s: number) =>
    new Date(s * 1000).toISOString().substring(11, 19)

  if (!config) return null

  return (
    <div className="h-screen flex bg-gray-100 text-black">
      <div className="w-1/3 p-6 border-r border-gray-300">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Notes</h2>
          <div className="text-sm text-gray-600">
            Time: {fmt(status.elapsedTime)}
          </div>
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full h-[calc(100vh-8rem)] p-4 rounded-lg border resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Take notes here..."
        />
      </div>

      <div className="w-2/3 flex">
        <div className="w-1/2 p-6 border-r border-gray-300">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Screen Audio</h3>
          </div>
          <div className="h-[calc(100vh-8rem)] overflow-y-auto bg-white p-4 rounded-lg border">
            {screenTranscript.final}
            {screenTranscript.interim && (
              <span className="text-gray-500">{screenTranscript.interim}</span>
            )}
          </div>
        </div>

        <div className="w-1/2 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Microphone</h3>
            <button
              onClick={handleStopRecording}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md"
            >
              Stop Recording
            </button>
          </div>
          <div className="h-[calc(100vh-8rem)] overflow-y-auto bg-white p-4 rounded-lg border">
            {micTranscript.final}
            {micTranscript.interim && (
              <span className="text-gray-500">{micTranscript.interim}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Recording
