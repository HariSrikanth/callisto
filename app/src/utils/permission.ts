import { promisify } from 'util'
import { exec } from 'child_process'

const execAsync = promisify(exec)

interface PermissionResponse {
  code: 'PERMISSION_GRANTED' | 'PERMISSION_DENIED'
}

export const checkPermissions = async (): Promise<boolean> => {
  try {
    const { stdout } = await execAsync('./src/swift/Recorder --check-permissions')
    const response = JSON.parse(stdout) as PermissionResponse
    return response.code === 'PERMISSION_GRANTED'
  } catch (error) {
    console.error('Error checking permissions:', error)
    return false
  }
}
