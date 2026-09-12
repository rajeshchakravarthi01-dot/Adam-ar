// =============================================================
// ADAM-AR v18.0.0 — Audio Preprocessing & Quality Control Engine
// =============================================================

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface AudioQualityMetrics {
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  formatName: string;
  rmsLevelDb?: number;
  isSilent: boolean;
  hasStereoSeparation: boolean;
  qcStatus: 'PASS' | 'WARN' | 'FAIL';
  qcNotes: string[];
}

export interface PreprocessedAudio {
  originalPath: string;
  normalizedPath: string;
  channel0Path?: string; // Channel 0 (typically Advisor / Channel L)
  channel1Path?: string; // Channel 1 (typically Customer / Channel R)
  metrics: AudioQualityMetrics;
}

/**
 * Probes audio metadata and audio levels using ffprobe / ffmpeg
 */
export async function inspectAudioQuality(filePath: string): Promise<AudioQualityMetrics> {
  const notes: string[] = [];

  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);

    const info = JSON.parse(stdout);
    const audioStream = info.streams?.find((s: any) => s.codec_type === 'audio') || info.streams?.[0];
    const duration = parseFloat(info.format?.duration || audioStream?.duration || '0');
    const sampleRate = parseInt(audioStream?.sample_rate || '44100', 10);
    const channels = parseInt(audioStream?.channels || '1', 10);
    const formatName = info.format?.format_name || 'unknown';

    if (duration < 1.0) {
      notes.push('Recording is under 1 second long.');
    }
    if (channels >= 2) {
      notes.push('Stereo recording detected: multi-channel separation enabled.');
    }

    // Run quick volume / RMS analysis using ffmpeg volumedetect
    let rmsDb: number | undefined;
    let isSilent = false;
    try {
      const { stderr: volumeStderr } = await execFileAsync('ffmpeg', [
        '-i', filePath,
        '-af', 'volumedetect',
        '-f', 'null',
        '-',
      ]);

      const meanVolMatch = volumeStderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
      const maxVolMatch = volumeStderr.match(/max_volume:\s*(-?[\d.]+)\s*dB/);

      if (meanVolMatch) {
        rmsDb = parseFloat(meanVolMatch[1]);
        if (rmsDb < -55.0) {
          isSilent = true;
          notes.push(`Extremely low audio volume detected (${rmsDb.toFixed(1)} dB). Possible silence.`);
        }
      }

      if (maxVolMatch && parseFloat(maxVolMatch[1]) < -50.0) {
        isSilent = true;
        notes.push('Audio peak is below -50dB. Silence guard activated.');
      }
    } catch {
      // Volume check fallback
    }

    const qcStatus = isSilent || duration < 0.5 ? 'WARN' : 'PASS';

    return {
      durationSeconds: duration,
      sampleRate,
      channels,
      formatName,
      rmsLevelDb: rmsDb,
      isSilent,
      hasStereoSeparation: channels >= 2,
      qcStatus,
      qcNotes: notes,
    };
  } catch (err) {
    return {
      durationSeconds: 0,
      sampleRate: 44100,
      channels: 1,
      formatName: 'raw',
      isSilent: false,
      hasStereoSeparation: false,
      qcStatus: 'WARN',
      qcNotes: [`ffprobe metadata inspection fallback: ${(err as Error).message}`],
    };
  }
}

/**
 * Preprocesses and normalizes audio for high-precision ASR
 * - Normalizes to 16kHz mono WAV or optimized format
 * - Extracts separate channels if stereo telephony audio
 */
export async function preprocessAudioForTranscription(filePath: string): Promise<PreprocessedAudio> {
  const metrics = await inspectAudioQuality(filePath);
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));

  const normalizedPath = path.join(dir, `${base}_norm_16k.wav`);

  try {
    // 1. Format normalization: 16kHz, mono, loudnorm filter to normalize volume levels for whisper
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', filePath,
      '-ar', '16000',
      '-ac', '1',
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
      normalizedPath,
    ]);
  } catch {
    // Fallback if loudnorm fails: simple resample
    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-i', filePath,
        '-ar', '16000',
        '-ac', '1',
        normalizedPath,
      ]);
    } catch {
      // If ffmpeg fails, use original path
      return {
        originalPath: filePath,
        normalizedPath: filePath,
        metrics,
      };
    }
  }

  let channel0Path: string | undefined;
  let channel1Path: string | undefined;

  // 2. Channel separation if stereo telephony call
  if (metrics.channels >= 2) {
    try {
      const ch0 = path.join(dir, `${base}_ch0_audio.wav`);
      const ch1 = path.join(dir, `${base}_ch1_audio.wav`);

      await execFileAsync('ffmpeg', [
        '-y',
        '-i', filePath,
        '-map_channel', '0.0.0',
        '-ar', '16000',
        ch0,
        '-map_channel', '0.0.1',
        '-ar', '16000',
        ch1,
      ]);

      if (fs.existsSync(ch0)) channel0Path = ch0;
      if (fs.existsSync(ch1)) channel1Path = ch1;
    } catch {
      // Non-blocking channel separation fallback
    }
  }

  return {
    originalPath: filePath,
    normalizedPath: fs.existsSync(normalizedPath) ? normalizedPath : filePath,
    channel0Path,
    channel1Path,
    metrics,
  };
}
