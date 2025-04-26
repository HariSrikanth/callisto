import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { RecordingConfig } from '../types/recording'

const Setup: React.FC = () => {
  const navigate = useNavigate()
  const [recordingFolder, setRecordingFolder] = useState(
    window.Electron.path.join(window.Electron.os.homedir(), 'Desktop')
  )
  const [transcriptFolder, setTranscriptFolder] = useState(
    window.Electron.path.join(window.Electron.os.homedir(), 'Desktop')
  )
  const [recFilename, setRecFilename] = useState('')
  const [trFilename, setTrFilename] = useState('')

  const handleSelectRecordingFolder = async () => {
    const p = await window.Electron.ipcRenderer.selectFolder()
    if (p) setRecordingFolder(p)
  }

  const handleSelectTranscriptFolder = async () => {
    const p = await window.Electron.ipcRenderer.selectFolder()
    if (p) setTranscriptFolder(p)
  }

  const handleStartRecording = async () => {
    if (!recFilename) return alert('Please enter a filename')
    if (!trFilename) return alert('Please enter a transcript filename')

    try {
      const config: RecordingConfig = {
        recFolder: recordingFolder,
        trFolder: transcriptFolder,
        recFilename,
        trFilename
      }

      const ok = await window.Electron.ipcRenderer.startRecording(config)

      if (ok.success) {
        // Navigate to recording view with config
        navigate('/recording', { state: config })
      } else {
        alert('Failed to start recording')
      }
    } catch (error) {
      console.error('Recording error:', error)
      alert('Error starting recording')
    }
  }

  return (
    <div className="bg-gray-100 h-screen flex items-center justify-center text-black">
      <div className="bg-white shadow-md rounded-md p-6 max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-4">
          Recording Setup
        </h1>

        <div className="mb-4">
          <label className="block font-medium mb-2">
            Recording Path: <span className="text-gray-500">{recordingFolder}</span>
          </label>
          <button
            onClick={handleSelectRecordingFolder}
            className="w-full border-gray-300 rounded-md shadow-sm py-2 px-4 hover:bg-blue-100"
          >
            Select Folder
          </button>
        </div>

        <div className="mb-4">
          <label className="block font-medium mb-2">
            Transcript Path: <span className="text-gray-500">{transcriptFolder}</span>
          </label>
          <button
            onClick={handleSelectTranscriptFolder}
            className="w-full border-gray-300 rounded-md shadow-sm py-2 px-4 hover:bg-blue-100"
          >
            Select Folder
          </button>
        </div>

        <div className="mb-4">
          <label className="block font-medium mb-2">Recording Filename:</label>
          <div className="flex gap-2">
            <input
              value={recFilename}
              onChange={(e) => setRecFilename(e.target.value)}
              className="flex-1 border rounded-md px-3 py-2"
              placeholder="name"
            />
            <span className="bg-gray-200 text-gray-600 px-2 rounded-md flex items-center">
              .flac
            </span>
          </div>
        </div>

        <div className="mb-6">
          <label className="block font-medium mb-2">
            Transcript Filename:
          </label>
          <div className="flex gap-2">
            <input
              value={trFilename}
              onChange={(e) => setTrFilename(e.target.value)}
              className="flex-1 border rounded-md px-3 py-2"
              placeholder="name"
            />
            <span className="bg-gray-200 text-gray-600 px-2 rounded-md flex items-center">
              .txt
            </span>
          </div>
        </div>

        <button
          onClick={handleStartRecording}
          disabled={!recFilename || !trFilename}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Start Recording
        </button>
      </div>
    </div>
  )
}

export default Setup 