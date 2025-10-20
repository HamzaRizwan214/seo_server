import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TempFileManager {
  constructor() {
    // Create temp directory in server root
    //this.tempDir = path.join(__dirname, '..', 'temp');
    this.tempDir = '/tmp';
    this.ensureTempDir();
  }

  async ensureTempDir() {
    try {
      await fs.access(this.tempDir);
    } catch {
      await fs.mkdir(this.tempDir, { recursive: true });
      console.log('📁 Created temp directory:', this.tempDir);
    }
  }

  // Generate unique filename with timestamp
  generateTempFileName(originalName) {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    return `${timestamp}_${randomId}_${baseName}${ext}`;
  }

  // Save file temporarily
  async saveTemp(fileBuffer, originalName) {
    await this.ensureTempDir();
    
    const tempFileName = this.generateTempFileName(originalName);
    const tempFilePath = path.join(this.tempDir, tempFileName);
    
    await fs.writeFile(tempFilePath, fileBuffer);
    
    console.log('💾 Temp file saved:', tempFileName);
    
    return {
      tempPath: tempFilePath,
      tempFileName,
      originalName
    };
  }

  // Delete specific temp file
  async deleteTemp(tempPath) {
    try {
      await fs.unlink(tempPath);
      console.log('🗑️ Temp file deleted:', path.basename(tempPath));
      return true;
    } catch (error) {
      console.error('❌ Failed to delete temp file:', error.message);
      return false;
    }
  }

  // Clean up old temp files (older than 1 hour)
  async cleanupOldFiles() {
    try {
      await this.ensureTempDir();
      const files = await fs.readdir(this.tempDir);
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      
      let deletedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime.getTime() < oneHourAgo) {
          await this.deleteTemp(filePath);
          deletedCount++;
        }
      }
      
      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} old temp files`);
      }
      
      return deletedCount;
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
      return 0;
    }
  }

  // Clean all temp files
  async cleanupAll() {
    try {
      await this.ensureTempDir();
      const files = await fs.readdir(this.tempDir);
      
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        await this.deleteTemp(filePath);
      }
      
      console.log(`🧹 Cleaned up all temp files (${files.length} files)`);
      return files.length;
    } catch (error) {
      console.error('❌ Full cleanup failed:', error.message);
      return 0;
    }
  }

  // Get temp file info
  async getTempFileInfo(tempPath) {
    try {
      const stats = await fs.stat(tempPath);
      return {
        exists: true,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime
      };
    } catch {
      return { exists: false };
    }
  }
}

// Create singleton instance
export const tempFileManager = new TempFileManager();

// Auto cleanup every 30 minutes
setInterval(() => {
  tempFileManager.cleanupOldFiles();
}, 30 * 60 * 1000);

export default TempFileManager;
