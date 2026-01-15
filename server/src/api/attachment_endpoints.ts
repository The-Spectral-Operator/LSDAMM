/**
 * LSDAMM - Attachment & Vision API Endpoints
 * Handles file uploads and vision processing
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join, extname } from 'node:path';
import { logger } from '../util/logging.js';

const router = Router();

// Configuration
const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';
const MAX_FILE_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '10485760', 10); // 10MB default
const ALLOWED_EXTENSIONS = [
  '.txt', '.md', '.json', '.yaml', '.yml', '.xml', '.csv',
  '.js', '.ts', '.py', '.java', '.c', '.cpp', '.h', '.go', '.rs',
  '.pdf', '.doc', '.docx',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'
];

// Ensure upload directory exists
async function ensureUploadDir(): Promise<void> {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (error) {
    logger.error('Failed to create upload directory', { error });
  }
}

ensureUploadDir();

// MIME type detection
function getMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.yaml': 'application/yaml',
    '.yml': 'application/yaml',
    '.xml': 'application/xml',
    '.csv': 'text/csv',
    '.js': 'text/javascript',
    '.ts': 'text/typescript',
    '.py': 'text/x-python',
    '.java': 'text/x-java',
    '.c': 'text/x-c',
    '.cpp': 'text/x-c++',
    '.h': 'text/x-c',
    '.go': 'text/x-go',
    '.rs': 'text/x-rust',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Check if file is an image
function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/**
 * POST /api/attachments/upload
 * Upload a file attachment
 */
router.post('/upload', async (req: Request, res: Response) => {
  try {
    // Get user info from auth
    const userId = req.user?.userId || req.apiKey?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Check content-type
    const contentType = req.headers['content-type'] || '';
    
    if (!contentType.includes('multipart/form-data')) {
      res.status(400).json({ error: 'Content-Type must be multipart/form-data' });
      return;
    }

    // Simple multipart parsing (in production, use multer or busboy)
    // For now, we'll accept base64 encoded data in JSON
    const { filename, data, encoding } = req.body;

    if (!filename || !data) {
      res.status(400).json({ error: 'filename and data are required' });
      return;
    }

    // Validate file extension
    const ext = extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      res.status(400).json({ 
        error: 'File type not allowed', 
        allowedExtensions: ALLOWED_EXTENSIONS 
      });
      return;
    }

    // Decode data
    let buffer: Buffer;
    if (encoding === 'base64') {
      buffer = Buffer.from(data, 'base64');
    } else {
      buffer = Buffer.from(data);
    }

    // Check file size
    if (buffer.length > MAX_FILE_SIZE) {
      res.status(413).json({ 
        error: 'File too large', 
        maxSize: MAX_FILE_SIZE,
        maxSizeMB: Math.round(MAX_FILE_SIZE / 1048576 * 10) / 10
      });
      return;
    }

    // Generate unique filename
    const fileId = randomUUID();
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = join(UPLOAD_DIR, `${fileId}_${safeFilename}`);

    // Save file
    await fs.writeFile(storagePath, buffer);

    const mimeType = getMimeType(filename);
    
    logger.info('File uploaded', { 
      fileId, 
      filename, 
      userId, 
      size: buffer.length,
      mimeType 
    });

    res.status(201).json({
      fileId,
      filename,
      mimeType,
      size: buffer.length,
      isImage: isImage(mimeType),
      uploadedAt: Date.now()
    });

  } catch (error) {
    logger.error('File upload failed', { error });
    res.status(500).json({ error: 'Upload failed', message: (error as Error).message });
  }
});

/**
 * GET /api/attachments/:fileId
 * Download/retrieve an attachment
 */
router.get('/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;

    // List files in upload directory
    const files = await fs.readdir(UPLOAD_DIR);
    const matchingFile = files.find(f => f.startsWith(fileId));

    if (!matchingFile) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const filePath = join(UPLOAD_DIR, matchingFile);
    const stats = await fs.stat(filePath);
    const mimeType = getMimeType(matchingFile);

    // For images, optionally send as inline
    if (isImage(mimeType) && req.query.inline === 'true') {
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', 'inline');
    } else {
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${matchingFile}"`);
    }

    res.setHeader('Content-Length', stats.size);
    
    const fileStream = await fs.readFile(filePath);
    res.send(fileStream);

  } catch (error) {
    logger.error('File download failed', { error });
    res.status(500).json({ error: 'Download failed' });
  }
});

/**
 * POST /api/vision/analyze
 * Analyze an image with AI vision capabilities
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId || req.apiKey?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { imageUrl, imageData, prompt, provider, model } = req.body;

    if (!imageUrl && !imageData) {
      res.status(400).json({ error: 'imageUrl or imageData is required' });
      return;
    }

    if (!prompt) {
      res.status(400).json({ error: 'prompt is required' });
      return;
    }

    // Import router for vision processing
    const { route } = await import('../models/router.js');

    // Prepare image content
    let imageContent: { type: string; source?: { type: string; media_type: string; data: string }; image_url?: { url: string } };
    
    if (imageData) {
      // Base64 encoded image
      const matches = imageData.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        res.status(400).json({ error: 'Invalid imageData format. Expected data:image/...;base64,...' });
        return;
      }
      const mediaType = matches[1];
      const data = matches[2];
      
      imageContent = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data
        }
      };
    } else {
      // Image URL
      imageContent = {
        type: 'image_url',
        image_url: {
          url: imageUrl!
        }
      };
    }

    // Create message with vision content
    const messages = [
      {
        role: 'user' as const,
        content: [
          { type: 'text', text: prompt },
          imageContent
        ]
      }
    ];

    const response = await route({
      messages,
      preferredProvider: provider,
      preferredModel: model,
      capability: 'vision',
      temperature: 0.7,
      maxTokens: 2048
    });

    res.json({
      analysis: response.content,
      provider: response.provider,
      model: response.model,
      tokensUsed: response.usage?.total_tokens
    });

  } catch (error) {
    logger.error('Vision analysis failed', { error });
    res.status(500).json({ error: 'Analysis failed', message: (error as Error).message });
  }
});

/**
 * DELETE /api/attachments/:fileId
 * Delete an attachment
 */
router.delete('/:fileId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId || req.apiKey?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { fileId } = req.params;

    // List files in upload directory
    const files = await fs.readdir(UPLOAD_DIR);
    const matchingFile = files.find(f => f.startsWith(fileId));

    if (!matchingFile) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const filePath = join(UPLOAD_DIR, matchingFile);
    await fs.unlink(filePath);

    logger.info('File deleted', { fileId, userId });
    res.json({ message: 'File deleted', fileId });

  } catch (error) {
    logger.error('File deletion failed', { error });
    res.status(500).json({ error: 'Deletion failed' });
  }
});

export default router;
