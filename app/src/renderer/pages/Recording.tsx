import React, { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  FileText,
  Lightbulb,
  Bookmark,
  Star,
  ChevronDown,
  ChevronUp,
  Globe,
  BookOpen,
  Mail,
  MessageSquare,
  Send,
  Plus,
  Mic,
  Search,
  Hand,
  RefreshCw,
  ArrowUp,
  GraduationCap,
  Play,
  Pause,
  StopCircle,
  Folder,
  File,
  Clock
} from "lucide-react"
import Timer from "@/components/timer"
import { useLocation, useNavigate } from "react-router-dom"

interface TranscriptData {
  final: string
  interim: string
}

interface ModelResponse {
  id: string
  text: string
  timestamp: number
  context?: string
  sourceType: 'screen' | 'microphone' | 'combined'
  action?: {
    type: 'calendar_check' | 'company_info' | 'person_info' | 'general'
    details: any
  }
}

interface ConversationContext {
  topics: Set<string>
  lastActionType?: string
  recentResponses: ModelResponse[]
  entities: {
    companies: Set<string>
    people: Set<string>
    dates: Set<string>
  }
}

interface RecordingStatus {
  isRecording: boolean
  isPaused: boolean
  elapsedTime: number
  recOutputPath: string | null
  trOutputPath: string | null
  recFilename?: string
  trFilename?: string
}

interface RecordingConfig {
  recFolder: string
  trFolder: string
  recFilename: string
  trFilename: string
}

const PROCESS_INTERVAL = 20000 // 20 seconds in milliseconds

const Recording: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const config = location.state as RecordingConfig
  const [sourcesExpanded, setSourcesExpanded] = useState(false)
  const [autoResearchActive, setAutoResearchActive] = useState(true)
  const [pendingSentences, setPendingSentences] = useState<string[]>([])
  const [pendingTranscript, setPendingTranscript] = useState<string>('')
  const [lastProcessedTime, setLastProcessedTime] = useState<number>(Date.now())
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

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
    isPaused: false,
    elapsedTime: 0,
    recOutputPath: null,
    trOutputPath: null
  })

  const [screenTranscript, setScreenTranscript] = useState<TranscriptData>({ final: '', interim: '' })
  const [micTranscript, setMicTranscript] = useState<TranscriptData>({ final: '', interim: '' })
  const [notes, setNotes] = useState('')
  const [combinedTranscript, setCombinedTranscript] = useState<string>('')
  const [modelResponses, setModelResponses] = useState<ModelResponse[]>([])
  const [conversationContext, setConversationContext] = useState<ConversationContext>({
    topics: new Set(),
    recentResponses: [],
    entities: {
      companies: new Set(),
      people: new Set(),
      dates: new Set()
    }
  })

  const timerRef = useRef<NodeJS.Timeout>()
  const startTimeRef = useRef<number>(0)

  // Add ref for transcript container
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  
  // Add function to scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, []);

  // Add state for combined chronological messages
  const [transcriptMessages, setTranscriptMessages] = useState<Array<{
    source: 'screen' | 'microphone';
    text: string;
    timestamp: number;
    isInterim: boolean;
  }>>([]);

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

  const updateContext = (newResponse: ModelResponse) => {
    setConversationContext(prev => {
      // Keep last 5 responses for immediate context
      const recentResponses = [...prev.recentResponses, newResponse].slice(-5)
      
      return {
        ...prev,
        recentResponses,
        lastActionType: newResponse.action?.type
      }
    })
  }

  // Process accumulated transcript
  const processPendingTranscript = useCallback(async () => {
    if (!pendingTranscript.trim() || isProcessing) return;

    try {
      setIsProcessing(true);
      const now = Date.now();
      console.log('📝 Processing transcript:', {
        length: pendingTranscript.length,
        preview: pendingTranscript.slice(0, 100)
      });

      const response: ModelResponse = {
        id: now.toString(),
        text: 'Processing transcript...',
        timestamp: now,
        sourceType: 'combined'
      };
      setModelResponses(prev => [...prev, response]);

      // Create context-aware prompt with complete turn
      const contextPrompt = {
        newText: pendingTranscript,
        recentResponses: conversationContext.recentResponses,
        knownTopics: Array.from(conversationContext.topics),
        entities: {
          companies: Array.from(conversationContext.entities.companies),
          people: Array.from(conversationContext.entities.people),
          dates: Array.from(conversationContext.entities.dates)
        }
      };

      console.log('🚀 Sending to main process:', {
        contextLength: JSON.stringify(contextPrompt).length
      });

      const modelResponse = await window.Electron.ipcRenderer.invoke('process-transcript', JSON.stringify(contextPrompt));
      
      console.log('📨 Received response from main process:', {
        responseLength: modelResponse.length,
        preview: modelResponse.slice(0, 100)
      });

      // Parse and update response
      const parsedResponse = JSON.parse(modelResponse);
      const enhancedResponse: ModelResponse = {
        id: now.toString(),
        text: parsedResponse.response,
        timestamp: now,
        sourceType: 'combined',
        context: parsedResponse.context,
        action: parsedResponse.action
      };

      setModelResponses(prev => 
        prev.map(r => r.id === now.toString() ? enhancedResponse : r)
      );
      updateContext(enhancedResponse);

      // Clear processed transcript and update timing
      setPendingTranscript('');
      setLastProcessedTime(now);
    } catch (error) {
      console.error('❌ Error in processPendingTranscript:', error);
      setModelResponses(prev => 
        prev.map(r => r.id === Date.now().toString() ? { 
          ...r, 
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
          sourceType: 'combined'
        } : r)
      );
    } finally {
      setIsProcessing(false);
    }
  }, [pendingTranscript, conversationContext, isProcessing, lastProcessedTime]);

  // Handle new transcript
  const handleNewTranscript = useCallback((text: string, source: 'screen' | 'microphone') => {
    // Accumulate text with source label
    const sourceLabel = source === 'screen' ? 'Screen' : 'Mic'
    setPendingTranscript(prev => 
      prev + (prev ? '\n' : '') + `${sourceLabel}: ${text}`
    )
    
    // Update combined transcript for display
    setCombinedTranscript(prev => prev + ' ' + text)

    // Schedule processing if not already scheduled
    if (!processingTimeoutRef.current && !isProcessing) {
      const timeUntilNextProcess = Math.max(0, PROCESS_INTERVAL - (Date.now() - lastProcessedTime))
      processingTimeoutRef.current = setTimeout(() => {
        processPendingTranscript()
        processingTimeoutRef.current = null
      }, timeUntilNextProcess)
    }
  }, [processPendingTranscript, isProcessing, lastProcessedTime])

  // Effect for transcript processing
  useEffect(() => {
    const transcriptionHandler = (data: {
      source: 'screen' | 'microphone',
      text: string,
      isFinal: boolean,
      timestamp: number
    }) => {
      // Update visual transcripts for state management
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

      // Add new message to chronological list
      if (data.text.trim()) {
        setTranscriptMessages(prev => {
          // Remove previous interim message from same source if it exists
          const filtered = data.isFinal ? 
            prev.filter(m => !(m.source === data.source && m.isInterim)) : 
            prev.filter(m => !(m.source === data.source && m.isInterim));
          
          return [...filtered, {
            source: data.source,
            text: data.text,
            timestamp: data.timestamp || Date.now(),
            isInterim: !data.isFinal
          }];
        });
        
        // Scroll to bottom after state update
        setTimeout(scrollToBottom, 0);
      }

      // Process final transcripts
      if (data.isFinal) {
        handleNewTranscript(data.text, data.source)
      }
    }

    window.Electron.ipcRenderer.on('transcription-update', transcriptionHandler)

    return () => {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current)
      }
      if (pendingTranscript.trim() && Date.now() - lastProcessedTime >= PROCESS_INTERVAL) {
        processPendingTranscript()
      }
      window.Electron.ipcRenderer.removeAllListeners('transcription-update')
    }
  }, [handleNewTranscript, pendingTranscript, processPendingTranscript, lastProcessedTime, scrollToBottom])

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    return [
      hours.toString().padStart(2, "0"),
      minutes.toString().padStart(2, "0"),
      secs.toString().padStart(2, "0"),
    ].join(":")
  }

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
  

  // Use the imported Timer component or the fallback
  const TimerDisplay = Timer

  const [communicationActions, setCommunicationActions] = useState([
    {
      id: "email",
      icon: <Mail className="h-4 w-4 text-blue-600" />,
      bgColor: "bg-blue-100",
      title: "Email Send",
      description: "Send a summary email to your team",
      isExpanded: false,
      expandedContent: (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="space-y-2">
            <div className="flex flex-col space-y-1">
              <span className="text-xs text-gray-500">To:</span>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="text-xs bg-gray-50">
                  team@company.com
                </Badge>
                <Badge variant="outline" className="text-xs bg-gray-50">
                  manager@company.com
                </Badge>
                <div className="flex items-center">
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                    <Plus className="h-3 w-3 mr-1" /> Add recipient
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex flex-col space-y-1">
              <span className="text-xs text-gray-500">Subject:</span>
              <span className="text-sm">Meeting Notes Summary - {new Date().toLocaleDateString()}</span>
            </div>
            <div className="flex justify-end mt-2">
              <Button size="sm" className="h-7 text-xs rounded-full">
                Send Now
              </Button>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "slack",
      icon: <MessageSquare className="h-4 w-4 text-green-600" />,
      bgColor: "bg-green-100",
      title: "Slack Announce",
      description: "Post announcement to Slack channel",
      isExpanded: false,
      expandedContent: (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="space-y-2">
            <div className="flex flex-col space-y-1">
              <span className="text-xs text-gray-500">Channel:</span>
              <div className="flex items-center">
                <span className="text-sm font-medium mr-2">#general</span>
                <ChevronDown className="h-3 w-3 text-gray-400" />
              </div>
            </div>
            <div className="flex flex-col space-y-1">
              <span className="text-xs text-gray-500">Message:</span>
              <div className="bg-gray-50 p-2 rounded-md text-sm">
                <p>Hey team! I've just finished the meeting and here are the key points we discussed...</p>
              </div>
            </div>
            <div className="flex justify-end mt-2">
              <Button size="sm" className="h-7 text-xs rounded-full">
                Post
              </Button>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "telegram",
      icon: <Send className="h-4 w-4 text-purple-600" />,
      bgColor: "bg-purple-100",
      title: "Telegram Group",
      description: "Create group and share notes",
      isExpanded: false,
      expandedContent: (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="space-y-2">
            <div className="flex flex-col space-y-1">
              <span className="text-xs text-gray-500">Group Name:</span>
              <span className="text-sm">Project Alpha Discussion</span>
            </div>
            <div className="flex flex-col space-y-1">
              <span className="text-xs text-gray-500">Members:</span>
              <div className="flex -space-x-2">
                <Avatar className="h-6 w-6 border-2 border-white">
                  <AvatarFallback className="bg-blue-500 text-white">JD</AvatarFallback>
                </Avatar>
                <Avatar className="h-6 w-6 border-2 border-white">
                  <AvatarFallback className="bg-green-500 text-white">AB</AvatarFallback>
                </Avatar>
                <Avatar className="h-6 w-6 border-2 border-white">
                  <AvatarFallback className="bg-purple-500 text-white">MK</AvatarFallback>
                </Avatar>
                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-gray-100 border-2 border-white text-xs">
                  +2
                </div>
              </div>
            </div>
            <div className="flex justify-end mt-2">
              <Button size="sm" className="h-7 text-xs rounded-full">
                Create & Share
              </Button>
            </div>
          </div>
        </div>
      ),
    },
  ])

  const toggleAction = (id: string) => {
    setCommunicationActions(
      communicationActions.map((action) => {
        if (action.id === id) {
          return { ...action, isExpanded: !action.isExpanded }
        }
        return action
      }),
    )
  }

  // Get the last 3 lines from the transcript for display
  const getLastTranscriptLines = (transcript: TranscriptData, maxLines = 3) => {
    const fullText = transcript.final + (transcript.interim ? '\n' + transcript.interim : '');
    const lines = fullText.split('\n').filter(line => line.trim() !== '');
    return lines.slice(-maxLines);
  };

  // Render recording setup modal
  // const renderRecordingSetup = () => {
    
  //   return (
  //     <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
  //       <div className="bg-white shadow-md rounded-md p-6 max-w-md mx-auto">
  //         <h1 className="text-2xl font-bold mb-4">
  //           Recording Setup
  //         </h1>

  //         <div className="mb-4">
  //           <label className="block font-medium mb-2">
  //             Recording Path: <span className="text-gray-500">{config.recFolder}</span>
  //           </label>
  //           <Button
  //             onClick={handleSelectRecordingFolder}
  //             className="w-full border-gray-300 rounded-md shadow-sm py-2 px-4 hover:bg-blue-100"
  //             variant="outline"
  //           >
  //             <Folder className="mr-2 h-4 w-4" />
  //             Select Folder
  //           </Button>
  //         </div>

  //         <div className="mb-4">
  //           <label className="block font-medium mb-2">
  //             Transcript Path: <span className="text-gray-500">{recordingConfig.trFolder}</span>
  //           </label>
  //           <Button
  //             onClick={handleSelectTranscriptFolder}
  //             className="w-full border-gray-300 rounded-md shadow-sm py-2 px-4 hover:bg-blue-100"
  //             variant="outline"
  //           >
  //             <Folder className="mr-2 h-4 w-4" />
  //             Select Folder
  //           </Button>
  //         </div>

  //         <div className="mb-4">
  //           <label className="block font-medium mb-2">Recording Filename:</label>
  //           <div className="flex gap-2">
  //             <input
  //               value={recordingConfig.recFilename}
  //               onChange={(e) => setRecordingConfig(prev => ({ ...prev, recFilename: e.target.value }))}
  //               className="flex-1 border rounded-md px-3 py-2"
  //               placeholder="name"
  //             />
  //             <span className="bg-gray-200 text-gray-600 px-2 rounded-md flex items-center">
  //               .flac
  //             </span>
  //           </div>
  //         </div>

  //         <div className="mb-6">
  //           <label className="block font-medium mb-2">
  //             Transcript Filename:
  //           </label>
  //           <div className="flex gap-2">
  //             <input
  //               value={recordingConfig.trFilename}
  //               onChange={(e) =>
  //                 setRecordingConfig((prev) => ({
  //                   ...prev,
  //                   trFilename: e.target.value,
  //                 }))
  //               }
  //               className="flex-1 border rounded-md px-3 py-2"
  //               placeholder="name"
  //             />
  //             <span className="bg-gray-200 text-gray-600 px-2 rounded-md flex items-center">
  //               .txt
  //             </span>
  //           </div>
  //         </div>

  //         <div className="flex gap-2">
  //           <Button
  //             onClick={() => setShowRecordingSetup(false)}
  //             className="flex-1"
  //             variant="outline"
  //           >
  //             Cancel
  //           </Button>
  //           <Button
  //             onClick={handleStartRecording}
  //             disabled={!recordingConfig.recFilename || !recordingConfig.trFilename}
  //             className="flex-1"
  //           >
  //             Start Recording
  //           </Button>
  //         </div>
  //       </div>
  //     </div>
  //   )
  // }

  // // Render the appropriate recording control button
  // const renderRecordingControls = () => {
  //   if (recordingStatus.isPaused) {
  //     return (
  //       <Button 
  //         onClick={handleResumeRecording} 
  //         variant="default" 
  //         className="rounded-full"
  //       >
  //         <Play className="h-4 w-4 mr-2" />
  //         Resume
  //       </Button>
  //     )
  //   }
    
  //   if (recordingStatus.isRecording) {
  //     return (
  //       <div className="flex gap-2">
  //         <Button 
  //           onClick={handlePauseRecording} 
  //           variant="outline" 
  //           className="rounded-full"
  //         >
  //           <Pause className="h-4 w-4 mr-2" />
  //           Pause
  //         </Button>
  //         <Button 
  //           onClick={handleStopRecording} 
  //           variant="destructive" 
  //           className="rounded-full"
  //         >
  //           <StopCircle className="h-4 w-4 mr-2" />
  //           Stop Recording
  //         </Button>
  //       </div>
  //     )
  //   }
    
  //   return (
  //     <Button 
  //       onClick={() => setShowRecordingSetup(true)} 
  //       className="rounded-full"
  //     >
  //       <Mic className="h-4 w-4 mr-2" />
  //       Start Recording
  //     </Button>
  //   )
  // }

  // Add console log for debugging
  console.log('Rendering Recording component')

  return (
    <div className="min-h-screen bg-background text-black">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Callisto</h1>
            {status.isRecording && (
              <Badge variant="secondary" className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                Recording
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4">
            {status.isRecording && (
              <div className="flex items-center gap-2">
                <TimerDisplay className="text-lg font-mono" />
                <span className="text-muted-foreground">{formatTime(status.elapsedTime)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Notes and Research Section */}
          <Card className="col-span-1">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Explore
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex flex-row space-x-6">
                {/* Notes Section */}
                <div className="flex-1">
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Notes
                  </h3>
                  <Textarea
                    placeholder="Take notes here..."
                    className="min-h-[300px] resize-none border-none shadow-none"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                {/* Divider */}
                <div className="w-px bg-gray-200"></div>

                {/* Research Section */}
                <div className="flex-1 space-y-6">
                  <div>
                    <h3 className="font-medium mb-3 flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-yellow-500" />
                      AI Research
                    </h3>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-muted-foreground">Auto Research</span>
                      <Switch
                        checked={autoResearchActive}
                        onCheckedChange={setAutoResearchActive}
                      />
                    </div>

                    {autoResearchActive && (
                      <div className="bg-slate-50 p-4 rounded-md mb-4">
                        <div className="flex items-start gap-3 mb-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>AI</AvatarFallback>
                          </Avatar>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium text-sm">Research Assistant</h3>
                              <Badge variant="outline" className="text-xs">
                                Active
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-600">
                              I've found relevant information about your topic. Would you like me to summarize it?
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Bookmark className="h-4 w-4 text-blue-500" />
                        <span className="font-medium">Sources</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSourcesExpanded(!sourcesExpanded)}
                      >
                        {sourcesExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>

                    {sourcesExpanded && (
                      <div className="space-y-2 mt-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Globe className="h-4 w-4" />
                          <span>research.ai/latest-findings</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <BookOpen className="h-4 w-4" />
                          <span>Computational Intelligence Review</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Model Responses Section */}
          <Card className="col-span-1">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2 text-black">
                <GraduationCap className="h-5 w-5" />
                AI Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {modelResponses.map((response) => (
                  <div key={response.id} className="bg-slate-50 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>AI</AvatarFallback>
                      </Avatar>
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">
                            {new Date(response.timestamp).toLocaleTimeString()}
                          </span>
                          {response.text === 'Processing transcript...' && (
                            <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                          )}
                        </div>
                        <p className="text-sm text-black">{response.text}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {modelResponses.length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Waiting for transcript to analyze...</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Actions Section */}
          <Card className="col-span-1">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5" />
                Suggested Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {/* Transcript component - Combined transcript view */}
              <div className="mb-6">
                <h3 className="text-sm font-medium mb-3">Live Transcript</h3>
                <div className="bg-slate-50 rounded-md">
                  <div className="flex items-center justify-between p-3 border-b">
                    <span className="font-medium text-slate-700">Combined Transcript</span>
                    {status.isRecording && 
                      <div className="px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs flex items-center">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1 animate-pulse"></div>
                        Recording
                      </div>
                    }
                  </div>
                  <div 
                    ref={transcriptContainerRef}
                    className="h-[200px] overflow-y-auto p-3 text-sm text-black"
                  >
                    {transcriptMessages.map((msg, i) => (
                      <div 
                        key={`${msg.source}-${i}-${msg.timestamp}`} 
                        className={`mb-1 ${msg.isInterim ? 'text-gray-500' : ''}`}
                      >
                        <span className={msg.source === 'screen' ? 'text-blue-600 font-medium' : 'text-green-600 font-medium'}>
                          {msg.source === 'screen' ? 'Screen: ' : 'Mic: '}
                        </span>
                        {msg.text}
                      </div>
                    ))}
                    
                    {transcriptMessages.length === 0 && 
                      <p className="text-slate-400 italic">No transcript available</p>
                    }
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {communicationActions.map((action) => (
                  <Card key={action.id} className="border">
                    <CardContent className="p-4">
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => toggleAction(action.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`${action.bgColor} p-2 rounded-full`}>
                            {action.icon}
                          </div>
                          <div>
                            <h3 className="font-medium">{action.title}</h3>
                            <p className="text-sm text-muted-foreground">
                              {action.description}
                            </p>
                          </div>
                        </div>
                        {action.isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                      {action.isExpanded && action.expandedContent}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recording Setup Modal
      {showRecordingSetup && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Recording Setup</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Recording Folder</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={recordingConfig.recFolder}
                    readOnly
                    className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectRecordingFolder}
                  >
                    <Folder className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Transcript Folder</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={recordingConfig.trFolder}
                    readOnly
                    className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectTranscriptFolder}
                  >
                    <Folder className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Recording Filename</label>
                <input
                  type="text"
                  value={recordingConfig.recFilename}
                  onChange={(e) =>
                    setRecordingConfig((prev) => ({
                      ...prev,
                      recFilename: e.target.value,
                    }))
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Transcript Filename</label>
                <input
                  type="text"
                  value={recordingConfig.trFilename}
                  onChange={(e) =>
                    setRecordingConfig((prev) => ({
                      ...prev,
                      trFilename: e.target.value,
                    }))
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowRecordingSetup(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleStartRecording}
                  disabled={
                    !recordingConfig.recFilename || !recordingConfig.trFilename
                  }
                >
                  Start Recording
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )} */}
    </div>
  )
}

export default Recording