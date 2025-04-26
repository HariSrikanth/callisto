export interface RecordingStatus {
  isRecording: boolean
  elapsedTime: number
  recOutputPath: string | null
  trOutputPath: string | null
  recFilename?: string
  trFilename?: string
}

export interface RecordingConfig {
  recFolder: string
  trFolder: string
  recFilename: string
  trFilename: string
}

export interface TranscriptData {
  final: string
  interim: string
} 