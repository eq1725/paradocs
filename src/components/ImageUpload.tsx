'use client'

import React, { useCallback, useState } from 'react'
import { Upload, X, Image as ImageIcon, Film, Music, AlertCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { classNames } from '@/lib/utils'

export interface UploadedFile {
  id: string
  name: string
  url: string
  thumbnailUrl?: string
  type: 'image' | 'video' | 'audio'
  size: number
}

interface ImageUploadProps {
  bucket: 'report-media' | 'avatars'
  folder: string // Usually user ID or report ID
  onUpload: (files: UploadedFile[]) => void
  existingFiles?: UploadedFile[]
  maxFiles?: number
  maxSizeMB?: number
  acceptedTypes?: string[]
  className?: string
  disabled?: boolean
}

const DEFAULT_ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
]

const AVATAR_ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]

function getFileType(mimeType: string): 'image' | 'video' | 'audio' {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'image'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ImageUpload({
  bucket,
  folder,
  onUpload,
  existingFiles = [],
  maxFiles = 5,
  maxSizeMB = 10,
  acceptedTypes,
  className,
  disabled = false,
}: ImageUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>(existingFiles)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const allowedTypes = acceptedTypes || (bucket === 'avatars' ? AVATAR_ACCEPTED_TYPES : DEFAULT_ACCEPTED_TYPES)
  const maxSizeBytes = maxSizeMB * 1024 * 1024

  const uploadFile = async (file: File): Promise<UploadedFile | null> => {
    // Validate file type
    if (!allowedTypes.includes(file.type)) {
      setError(`File type ${file.type} is not allowed`)
      return null
    }

    // Validate file size
    if (file.size > maxSizeBytes) {
      setError(`File is too large. Maximum size is ${maxSizeMB}MB`)
      return null
    }

    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
    const filePath = `${folder}/${fileName}`

    const { data, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      setError(uploadError.message)
      return null
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath)

    return {
      id: data.path,
      name: file.name,
      url: publicUrl,
      type: getFileType(file.type),
      size: file.size,
    }
  }

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    if (disabled) return

    const filesToUpload = Array.from(fileList)
    const remainingSlots = maxFiles - files.length

    if (filesToUpload.length > remainingSlots) {
      setError(`You can only upload ${remainingSlots} more file(s)`)
      return
    }

    setUploading(true)
    setError(null)

    const uploadedFiles: UploadedFile[] = []

    for (const file of filesToUpload) {
      const uploaded = await uploadFile(file)
      if (uploaded) {
        uploadedFiles.push(uploaded)
      }
    }

    const newFiles = [...files, ...uploadedFiles]
    setFiles(newFiles)
    onUpload(newFiles)
    setUploading(false)
  }, [files, maxFiles, disabled, onUpload])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const removeFile = async (fileId: string) => {
    // Remove from storage
    const { error: deleteError } = await supabase.storage
      .from(bucket)
      .remove([fileId])

    if (deleteError) {
      console.error('Delete error:', deleteError)
      setError(deleteError.message)
      return
    }

    const newFiles = files.filter(f => f.id !== fileId)
    setFiles(newFiles)
    onUpload(newFiles)
  }

  const canUploadMore = files.length < maxFiles && !disabled

  return (
    <div className={className}>
      {/* Upload area */}
      {canUploadMore && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={classNames(
            'relative border-2 border-dashed rounded-lg p-6 text-center transition-colors',
            dragOver
              ? 'border-primary-500 bg-primary-500/10'
              : 'border-white/20 hover:border-white/40',
            uploading && 'opacity-50 pointer-events-none'
          )}
        >
          <input
            type="file"
            multiple={maxFiles > 1}
            accept={allowedTypes.join(',')}
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={disabled || uploading}
          />

          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
              <p className="text-sm text-gray-400">Uploading...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="w-8 h-8 text-gray-400" />
              <p className="text-sm text-gray-300">
                Drop files here or click to upload
              </p>
              <p className="text-xs text-gray-500">
                {bucket === 'avatars' ? 'Images only' : 'Images, videos, or audio'} • Max {maxSizeMB}MB each
              </p>
              {maxFiles > 1 && (
                <p className="text-xs text-gray-500">
                  {files.length}/{maxFiles} files uploaded
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* File previews */}
      {files.length > 0 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {files.map((file) => (
            <div
              key={file.id}
              className="relative group bg-white/5 rounded-lg overflow-hidden border border-white/10"
            >
              {file.type === 'image' ? (
                <img
                  src={file.url}
                  alt={file.name}
                  className="w-full h-24 object-cover"
                />
              ) : file.type === 'video' ? (
                <div className="w-full h-24 flex items-center justify-center bg-white/5">
                  <Film className="w-8 h-8 text-gray-400" />
                </div>
              ) : (
                <div className="w-full h-24 flex items-center justify-center bg-white/5">
                  <Music className="w-8 h-8 text-gray-400" />
                </div>
              )}

              <div className="p-2">
                <p className="text-xs text-white truncate">{file.name}</p>
                <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
              </div>

              {!disabled && (
                <button
                  onClick={() => removeFile(file.id)}
                  className="absolute top-1 right-1 p-1 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
