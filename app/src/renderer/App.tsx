import { useState, useEffect } from 'react'
import { HashRouter as Router, Routes, Route, useNavigate } from 'react-router-dom'
import Setup from './pages/Setup'
import Recording from './pages/Recording'

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { AppSidebar } from "@/components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

function MainContent() {
  const navigate = useNavigate()
  const [count, setCount] = useState(0)

  useEffect(() => {
    // Check if Electron API is available
    console.log('Window.electron:', window.Electron)
  }, [])

  const handlePing = () => {
    try {
      console.log('Sending ping...')
      window.Electron.ipcRenderer.send('ping')
      console.log('Ping sent, navigating to /hello')
      navigate('/hello')
    } catch (error) {
      console.error('Error in handlePing:', error)
    }
  }

  return (
    <div className="container p-4">
      <h1 className="text-2xl font-bold mb-4">Electron + Vite + React</h1>
      <div className="card bg-white p-4 rounded shadow">
        <button 
          className="px-4 py-2 bg-blue-500 text-white rounded mb-4"
          onClick={() => setCount((count) => count + 1)}
        >
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="my-4">
        Click on the Electron + Vite + React logos to learn more
      </p>
      <div className="flex justify-center mt-4">
        <button
          onClick={handlePing}
          className="px-4 py-2 text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors"
        >
          Send Ping
        </button>
      </div>
    </div>
  )
}

function App() {
  return (
    <Router>
      <div className="h-screen bg-gray-50">
        <Routes>
          <Route path="/" element={<Setup />} />
          <Route path="/recording" element={<Recording />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
