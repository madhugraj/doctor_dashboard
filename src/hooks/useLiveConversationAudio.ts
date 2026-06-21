import { useCallback, useEffect, useRef, useState } from "react";
import { BACKEND_ORIGIN, WS_ORIGIN } from "@/lib/backendConfig";

export type MediaRecorderState = "idle" | "starting" | "recording" | "paused" | "stopping" | "failed";
export type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "closed" | "error";

export interface LiveAudioConfig {
  mimeType?: string;
  audioBitsPerSecond?: number;
  chunkIntervalMs?: number;
  enableDebugLogs?: boolean;
  onTranscriptPartial?: (sessionId: string, transcript: any) => void;
  onTranscriptFinal?: (sessionId: string, segment: any) => void;
  onDraftUpdated?: (sessionId: string, draft: any) => void;
  onSessionStateChange?: (sessionId: string, status: string) => void;
}

const DEFAULT_CHUNK_INTERVAL = 3000; // lower latency for live transcript updates
const DEFAULT_MIME_TYPE = "audio/webm"; // Use WebM for better compatibility
const DEFAULT_AUDIO_BITRATE = 128000; // 128 kbps for better quality
const MICROPHONE_GAIN_BOOST = 2.0; // Not used - keeping for reference
const WEBSOCKET_CONNECT_TIMEOUT_MS = 10000;

function resolveLiveConversationWebSocketUrl(sessionId: string) {
  // Use WS_ORIGIN which always points to configured backend (not Vite proxy)
  // This bypasses Vite's WebSocket proxy which doesn't forward upgrades correctly
  const websocketOrigin = WS_ORIGIN.replace(/^http/i, (protocol) =>
    protocol.toLowerCase() === "https" ? "wss" : "ws",
  );

  return `${websocketOrigin}/api/voice/live/sessions/${sessionId}/stream`;
}

export interface UseLiveConversationAudioResult {
  permissionState: PermissionState;
  connectionState: ConnectionState;
  recorderState: MediaRecorderState;
  error: string | null;
  audioLevel: number;
  devices: MediaDeviceInfo[];
  selectedDevice: string | null;
  startSession: (sessionId: string, deviceId?: string) => Promise<void>;
  pauseSession: () => void;
  resumeSession: () => void;
  endSession: () => Promise<void>;
  selectDevice: (deviceId: string) => void;
  disconnect: () => void;
}

export function useLiveConversationAudio(config: LiveAudioConfig = {}): UseLiveConversationAudioResult {
  const {
    mimeType = DEFAULT_MIME_TYPE,
    audioBitsPerSecond = DEFAULT_AUDIO_BITRATE,
    chunkIntervalMs = DEFAULT_CHUNK_INTERVAL,
    enableDebugLogs = false,
    onTranscriptPartial,
    onTranscriptFinal,
    onDraftUpdated,
    onSessionStateChange,
  } = config;

  const [permissionState, setPermissionState] = useState<PermissionState>("prompt");
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [recorderState, setRecorderState] = useState<MediaRecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);

  const websocketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const archiveRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderStateRef = useRef<MediaRecorderState>("idle");
  const chunkTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const websocketSessionIdRef = useRef<string | null>(null);
  const socketCloseErrorRef = useRef<Error | null>(null);
  const recorderMimeTypeRef = useRef<string>(mimeType);
  const recordedChunksRef = useRef<Blob[]>([]);
  const captureStartedAtRef = useRef<number | null>(null);
  const pausedAtRef = useRef<number | null>(null);
  const pausedDurationMsRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelAnimationFrameRef = useRef<number | null>(null);
  const levelBufferRef = useRef<Uint8Array | null>(null);
  const pendingEndRef = useRef<{
    resolve: () => void;
    reject: (error: Error) => void;
    timeoutId: number;
  } | null>(null);
  const pendingStartRef = useRef<{
    resolve: () => void;
    reject: (error: Error) => void;
    timeoutId: number;
  } | null>(null);

  const log = useCallback((message: string, data?: unknown) => {
    if (enableDebugLogs) {
      console.log(`[LiveConversationAudio] ${message}`, data || "");
    }
  }, [enableDebugLogs]);

  const syncRecorderState = useCallback((nextState: MediaRecorderState) => {
    recorderStateRef.current = nextState;
    setRecorderState(nextState);
  }, []);

  useEffect(() => {
    recorderStateRef.current = recorderState;
  }, [recorderState]);

  const clearPendingEnd = useCallback((error?: Error) => {
    const pendingEnd = pendingEndRef.current;
    if (!pendingEnd) return;

    window.clearTimeout(pendingEnd.timeoutId);
    pendingEndRef.current = null;

    if (error) {
      pendingEnd.reject(error);
      return;
    }

    pendingEnd.resolve();
  }, []);

  const clearPendingStart = useCallback((error?: Error) => {
    const pendingStart = pendingStartRef.current;
    if (!pendingStart) return;

    window.clearTimeout(pendingStart.timeoutId);
    pendingStartRef.current = null;

    if (error) {
      pendingStart.reject(error);
      return;
    }

    pendingStart.resolve();
  }, []);

  const stopLevelMonitoring = useCallback(() => {
    if (levelAnimationFrameRef.current) {
      window.cancelAnimationFrame(levelAnimationFrameRef.current);
      levelAnimationFrameRef.current = null;
    }

    analyserRef.current?.disconnect();
    analyserRef.current = null;
    levelBufferRef.current = null;

    if (audioContextRef.current) {
      const context = audioContextRef.current;
      audioContextRef.current = null;
      void context.close().catch(() => undefined);
    }

    setAudioLevel(0);
  }, []);

  const startLevelMonitoring = useCallback((stream: MediaStream) => {
    stopLevelMonitoring();

    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    try {
      const context = new AudioContextCtor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;

      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);

      const levelBuffer = new Uint8Array(analyser.frequencyBinCount);
      audioContextRef.current = context;
      analyserRef.current = analyser;
      levelBufferRef.current = levelBuffer;

      const tick = () => {
        if (!analyserRef.current || !levelBufferRef.current) return;

        analyserRef.current.getByteTimeDomainData(levelBufferRef.current);

        let sumSquares = 0;
        for (const sample of levelBufferRef.current) {
          const normalized = (sample - 128) / 128;
          sumSquares += normalized * normalized;
        }

        const rms = Math.sqrt(sumSquares / levelBufferRef.current.length);
        const nextLevel = Math.min(1, rms * 4.5);
        setAudioLevel((currentLevel) => (currentLevel * 0.55) + (nextLevel * 0.45));
        // Log audio level for debugging
        if (nextLevel > 0.01) {
          console.log('[LiveConversationAudio] Audio level:', nextLevel.toFixed(3));
        }
        levelAnimationFrameRef.current = window.requestAnimationFrame(tick);
      };

      tick();
    } catch (err) {
      log("Failed to start audio level monitoring", err);
    }
  }, [log, stopLevelMonitoring]);

  const checkPermission = useCallback(async () => {
    try {
      const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
      setPermissionState(result.state);
      result.addEventListener("change", () => {
        setPermissionState(result.state);
      });
    } catch {
      setPermissionState("prompt");
    }
  }, []);

  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === "audioinput");
      setDevices(audioInputs);
      if (audioInputs.length > 0 && !selectedDevice) {
        setSelectedDevice(audioInputs[0].deviceId);
      }
    } catch (err) {
      log("Failed to enumerate devices", err);
    }
  }, [selectedDevice, log]);

  const connectWebSocket = useCallback((sessionId: string) => {
    const existingSocket = websocketRef.current;
    if (existingSocket) {
      const existingSessionId = websocketSessionIdRef.current;
      if (
        existingSessionId === sessionId
        && (
          existingSocket.readyState === WebSocket.OPEN
          || existingSocket.readyState === WebSocket.CONNECTING
        )
      ) {
        return existingSocket;
      }

      if (existingSocket.readyState === WebSocket.OPEN) {
        try {
          existingSocket.close(1000, "Switching live session");
        } catch {
          // Ignore close failures while replacing a stale socket.
        }
      } else if (existingSocket.readyState === WebSocket.CONNECTING) {
        existingSocket.addEventListener("open", () => {
          try {
            existingSocket.close(1000, "Switching live session");
          } catch {
            // Ignore close failures on a socket being abandoned.
          }
        }, { once: true });
      }

      websocketRef.current = null;
      websocketSessionIdRef.current = null;
    }

    const wsUrl = resolveLiveConversationWebSocketUrl(sessionId);
    log("Connecting WebSocket", { wsUrl });

    setConnectionState("connecting");
    setError(null);
    socketCloseErrorRef.current = null;

    const ws = new WebSocket(wsUrl);
    websocketRef.current = ws;
    websocketSessionIdRef.current = sessionId;

    ws.onopen = () => {
      if (websocketRef.current !== ws) return;
      log("WebSocket connected");
      setConnectionState("connected");
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      if (websocketRef.current !== ws) return;
      try {
        const message = JSON.parse(event.data);
        // Always log WebSocket messages for debugging
        console.log("[LiveConversationAudio] WebSocket message received", message);
        log("WebSocket message received", message);

        switch (message.type) {
          case "session.ready":
            onSessionStateChange?.(message.sessionId || sessionIdRef.current || "", message.status);
            break;
          case "session.state":
            if (message.status === "paused") {
              setError(null);
              syncRecorderState("paused");
            } else if (message.status === "live") {
              setError(null);
              socketCloseErrorRef.current = null;
              syncRecorderState("recording");
              clearPendingStart();
            } else if (message.status === "review_required") {
              setError(null);
              syncRecorderState("idle");
              setConnectionState("closed");
              clearPendingEnd();
            }
            onSessionStateChange?.(message.sessionId || sessionIdRef.current || "", message.status);
            break;
          case "transcript.final":
            onTranscriptFinal?.(message.sessionId || sessionIdRef.current || "", message.segment);
            break;
          case "transcript.partial":
            setError(null);
            onTranscriptPartial?.(message.sessionId || sessionIdRef.current || "", message.transcript);
            break;
          case "draft.updated":
            onDraftUpdated?.(message.sessionId || sessionIdRef.current || "", message.draft);
            break;
          case "session.error":
            setError(message.error);
            setConnectionState("error");
            clearPendingStart(new Error(message.error || "Session error"));
            clearPendingEnd(new Error(message.error || "Session error"));
            break;
        }
      } catch (err) {
        log("Failed to parse WebSocket message", err);
      }
    };

    ws.onerror = (event) => {
      if (websocketRef.current !== ws) return;
      log("WebSocket error", event);
      setError("Connection error");
      setConnectionState("error");
    };

    ws.onclose = (event) => {
      if (websocketRef.current !== ws) return;

      // Enhanced WebSocket close reporting
      const closeInfo = {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        recorderState: recorderStateRef.current,
        currentTime: new Date().toISOString()
      };
      log("WebSocket closed", closeInfo);

      // Provide detailed error messages for common close codes
      let closeReason = event.reason?.trim() || "";
      if (!closeReason) {
        switch (event.code) {
          case 1000:
            closeReason = "Connection closed normally";
            break;
          case 1001:
            closeReason = "Endpoint going away";
            break;
          case 1002:
            closeReason = "Protocol error";
            break;
          case 1003:
            closeReason = "Unsupported data";
            break;
          case 1006:
            closeReason = "Connection closed abnormally (network error or timeout)";
            break;
          case 1008:
            closeReason = "Policy violation";
            break;
          case 1010:
            closeReason = "Missing extension";
            break;
          case 1011:
            closeReason = "Internal server error";
            break;
          default:
            closeReason = `WebSocket closed with code ${event.code}`;
        }
      }

      // Enhanced error context
      const enhancedError = new Error(closeReason);
      (enhancedError as any).code = event.code;
      (enhancedError as any).wasClean = event.wasClean;
      (enhancedError as any).recorderState = recorderStateRef.current;
      (enhancedError as any).timestamp = closeInfo.currentTime;

      const isActiveCapture = recorderStateRef.current === "recording" || recorderStateRef.current === "starting";
      const isNormalClose = event.code === 1000;
      if (!(isActiveCapture && isNormalClose)) {
        socketCloseErrorRef.current = enhancedError;
      }

      if (websocketRef.current === ws) {
        websocketRef.current = null;
        websocketSessionIdRef.current = null;
      }
      setConnectionState("closed");
      if (isActiveCapture && isNormalClose) {
        clearPendingStart();
      } else {
        clearPendingStart(enhancedError);
      }
      clearPendingEnd();

      if (recorderStateRef.current === "recording" && event.code !== 1000) {
        setConnectionState("reconnecting");
        reconnectTimerRef.current = window.setTimeout(() => {
          if (sessionIdRef.current) {
            connectWebSocket(sessionIdRef.current);
          }
        }, 3000);
      }
    };

    return ws;
  }, [clearPendingEnd, clearPendingStart, log, onDraftUpdated, onSessionStateChange, onTranscriptFinal, onTranscriptPartial]);

  const waitForWebSocketOpen = useCallback((websocket: WebSocket) => new Promise<void>((resolve, reject) => {
    console.log("[DEBUG waitForWebSocketOpen] Initial state:", websocket.readyState);

    if (websocket.readyState === WebSocket.OPEN) {
      console.log("[DEBUG waitForWebSocketOpen] Already open, resolving");
      resolve();
      return;
    }

    if (websocket.readyState === WebSocket.CLOSING || websocket.readyState === WebSocket.CLOSED) {
      console.log("[DEBUG waitForWebSocketOpen] Already closed/closing, rejecting");
      reject(new Error("WebSocket closed before the connection was established"));
      return;
    }

    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      websocket.removeEventListener("open", handleOpen);
      websocket.removeEventListener("error", handleError);
      websocket.removeEventListener("close", handleClose);
    };

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const handleOpen = () => {
      settle(resolve);
    };

    const handleError = () => {
      settle(() => reject(new Error("WebSocket connection failed")));
    };

    const handleClose = (event: CloseEvent) => {
      const reason = event.reason?.trim();
      settle(() => reject(new Error(reason || "WebSocket closed before the connection was established")));
    };

    const timeoutId = window.setTimeout(() => {
      settle(() => reject(new Error("WebSocket connection timeout")));
    }, WEBSOCKET_CONNECT_TIMEOUT_MS);

    websocket.addEventListener("open", handleOpen);
    websocket.addEventListener("error", handleError);
    websocket.addEventListener("close", handleClose);
  }), []);

  const startRecording = useCallback(async (deviceId?: string) => {
    try {
      syncRecorderState("starting");
      setError(null);
      recordedChunksRef.current = [];

      const constraints: MediaStreamConstraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      };

      log("Requesting microphone access", constraints);
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia(constraints),
        new Promise<MediaStream>((_, reject) => {
          window.setTimeout(() => {
            reject(new Error("Microphone permission timed out. Allow access and try Start again."));
          }, 15000);
        }),
      ]);
      streamRef.current = stream;
      setPermissionState("granted");
      startLevelMonitoring(stream);

      log("Enumerating devices after permission granted");
      await enumerateDevices();

      let supportedMimeType = mimeType;
      // Prioritize WebM/Opus which works best with both browsers and Whisper STT
      const types = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
        "audio/mpeg",
      ];

      for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
          supportedMimeType = type;
          break;
        }
      }

      log("Using MIME type", { selected: supportedMimeType, requested: mimeType });

      const recorder = new MediaRecorder(stream, {
        mimeType: supportedMimeType,
        audioBitsPerSecond: audioBitsPerSecond ?? DEFAULT_AUDIO_BITRATE,
      });

      mediaRecorderRef.current = recorder;
      recorderMimeTypeRef.current = recorder.mimeType || supportedMimeType || mimeType;
      let mirrorChunkRecorderToFinalUpload = true;

      try {
        const archiveRecorder = new MediaRecorder(stream, {
          mimeType: supportedMimeType,
          audioBitsPerSecond: audioBitsPerSecond ?? DEFAULT_AUDIO_BITRATE,
        });
        archiveRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };
        archiveRecorder.onerror = (event) => {
          mirrorChunkRecorderToFinalUpload = true;
          log("Archive MediaRecorder error", event);
        };
        archiveRecorder.start();
        archiveRecorderRef.current = archiveRecorder;
        mirrorChunkRecorderToFinalUpload = false;
      } catch (archiveError) {
        archiveRecorderRef.current = null;
        log("Falling back to chunk-assembled final upload", archiveError);
      }

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          if (mirrorChunkRecorderToFinalUpload) {
            recordedChunksRef.current.push(event.data);
          }

          if (websocketRef.current?.readyState === WebSocket.OPEN) {
            log("Sending audio chunk", { size: event.data.size });
            console.log("[LiveConversationAudio] Sending audio chunk", { size: event.data.size, type: event.data.type });
            websocketRef.current.send(event.data);
            setError(null);
            socketCloseErrorRef.current = null;
            if (sessionIdRef.current && recorderStateRef.current !== "stopping") {
              onSessionStateChange?.(sessionIdRef.current, "live");
            }
            // The server also emits session.state:live on chunk receipt; this keeps
            // Safari from timing out if that ack is missed while audio is flowing.
            clearPendingStart();
          }
        }
      };

      recorder.onerror = (event) => {
        log("MediaRecorder error", event);
        setError("Recording error");
        syncRecorderState("failed");
      };

      recorder.start();
      captureStartedAtRef.current = Date.now();
      pausedAtRef.current = null;
      pausedDurationMsRef.current = 0;
      chunkTimerRef.current = window.setInterval(() => {
        if (recorder.state === "recording") {
          try {
            recorder.requestData();
          } catch (err) {
            log("requestData failed", err);
          }
        }
      }, chunkIntervalMs);
      syncRecorderState("recording");
      log("Recording started", { interval: chunkIntervalMs });

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log("Failed to start recording", err);
      setError(message);
      syncRecorderState("failed");
      if (message.toLowerCase().includes("denied") || message.toLowerCase().includes("notallowed")) {
        setPermissionState("denied");
      } else {
        setPermissionState("prompt");
      }
      throw err instanceof Error ? err : new Error(message);
    }
  }, [mimeType, audioBitsPerSecond, chunkIntervalMs, log, enumerateDevices, startLevelMonitoring, clearPendingStart, onSessionStateChange]);

  const uploadFinalRecording = useCallback(async (sessionId: string, durationMs?: number | null) => {
    const recordedChunks = recordedChunksRef.current.filter((chunk) => chunk.size > 0);
    if (recordedChunks.length === 0) {
      throw new Error("Final recording was not available for upload");
    }

    const finalMimeType = recorderMimeTypeRef.current || mimeType;
    const finalBlob = new Blob(recordedChunks, { type: finalMimeType });
    if (finalBlob.size === 0) {
      throw new Error("Final recording was empty");
    }

    log("Uploading final recording", {
      sessionId,
      mimeType: finalMimeType,
      size: finalBlob.size,
      chunks: recordedChunks.length,
    });

    const response = await fetch(`${BACKEND_ORIGIN}/api/voice/live/sessions/${sessionId}/audio/final`, {
      method: "POST",
      headers: {
        "Content-Type": finalMimeType,
        ...(Number.isFinite(durationMs) && Number(durationMs) > 0
          ? { "X-Live-Duration-Ms": String(Math.round(Number(durationMs))) }
          : {}),
      },
      body: finalBlob,
      credentials: "include",
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(message || "Failed to upload the final recording");
    }

    recordedChunksRef.current = [];
  }, [log, mimeType]);

  const stopRecording = useCallback(() => {
    log("Stopping recording");

    if (chunkTimerRef.current) {
      window.clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (archiveRecorderRef.current && archiveRecorderRef.current.state !== "inactive") {
      archiveRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    mediaRecorderRef.current = null;
    archiveRecorderRef.current = null;
    stopLevelMonitoring();
    captureStartedAtRef.current = null;
    pausedAtRef.current = null;
    pausedDurationMsRef.current = 0;
    syncRecorderState("idle");
  }, [log, stopLevelMonitoring, syncRecorderState]);

  const flushAndStopRecording = useCallback(async () => {
    log("Flushing final audio chunk before stopping");

    if (chunkTimerRef.current) {
      window.clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    const archiveRecorder = archiveRecorderRef.current;
    const stopPromises: Promise<void>[] = [];

    const waitForRecorderEvent = (
      target: MediaRecorder,
      eventName: "dataavailable" | "stop",
      handler: () => void,
    ) => {
      if (typeof target.addEventListener === "function") {
        target.addEventListener(eventName, handler, { once: true });
        return () => {
          if (typeof target.removeEventListener === "function") {
            target.removeEventListener(eventName, handler);
          }
        };
      }

      const propName = eventName === "stop" ? "onstop" : "ondataavailable";
      const previousHandler = target[propName];
      target[propName] = ((event: Event | BlobEvent) => {
        if (typeof previousHandler === "function") {
          previousHandler.call(target, event);
        }
        handler();
        if (target[propName] === wrappedHandler) {
          target[propName] = previousHandler;
        }
      }) as MediaRecorder["onstop"] & MediaRecorder["ondataavailable"];

      const wrappedHandler = target[propName];
      return () => {
        if (target[propName] === wrappedHandler) {
          target[propName] = previousHandler;
        }
      };
    };

    if (recorder && recorder.state !== "inactive") {
      stopPromises.push(new Promise<void>((resolve) => {
        let finished = false;
        const cleanups: Array<() => void> = [];

        const finish = () => {
          if (finished) return;
          finished = true;
          cleanups.forEach((cleanup) => cleanup());
          resolve();
        };

        cleanups.push(waitForRecorderEvent(recorder, "dataavailable", finish));
        cleanups.push(waitForRecorderEvent(recorder, "stop", finish));

        try {
          recorder.stop();
          if (recorder.state === "inactive") {
            finish();
            return;
          }
        } catch {
          finish();
        }

        window.setTimeout(finish, 600);
      }));
    }

    if (archiveRecorder && archiveRecorder.state !== "inactive") {
      stopPromises.push(new Promise<void>((resolve) => {
        let finished = false;
        let sawStop = false;
        let sawData = false;
        const initialChunkCount = recordedChunksRef.current.length;
        const cleanupHandlers: Array<() => void> = [];

        const finish = () => {
          if (finished) return;
          finished = true;
          cleanupHandlers.forEach((cleanup) => cleanup());
          resolve();
        };

        const finishIfComplete = () => {
          const hasNewFinalData = recordedChunksRef.current.length > initialChunkCount;
          if (sawStop && (sawData || hasNewFinalData)) {
            finish();
          }
        };

        cleanupHandlers.push(waitForRecorderEvent(archiveRecorder, "dataavailable", () => {
          sawData = true;
          finishIfComplete();
        }));
        cleanupHandlers.push(waitForRecorderEvent(archiveRecorder, "stop", () => {
          sawStop = true;
          finishIfComplete();
        }));

        try {
          if (typeof archiveRecorder.requestData === "function") {
            archiveRecorder.requestData();
          }
          archiveRecorder.stop();
        } catch {
          finish();
        }

        window.setTimeout(finish, 2000);
      }));
    }

    if (stopPromises.length > 0) {
      await Promise.all(stopPromises);
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    mediaRecorderRef.current = null;
    archiveRecorderRef.current = null;
    stopLevelMonitoring();
  }, [log, stopLevelMonitoring]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    const websocket = websocketRef.current;
    if (websocket) {
      websocketRef.current = null;
      websocketSessionIdRef.current = null;
      websocket.onopen = null;
      websocket.onmessage = null;
      websocket.onerror = null;
      websocket.onclose = null;

      if (websocket.readyState === WebSocket.OPEN) {
        websocket.close(1000, "User disconnected");
      } else if (websocket.readyState === WebSocket.CONNECTING) {
        websocket.addEventListener("open", () => {
          try {
            websocket.close(1000, "User disconnected");
          } catch {
            // Ignore close failures while abandoning an in-flight socket.
          }
        }, { once: true });
      }
    }

    stopRecording();
    clearPendingStart();
    clearPendingEnd();
    socketCloseErrorRef.current = null;
    recordedChunksRef.current = [];
    sessionIdRef.current = null;
    setConnectionState("idle");
    log("Disconnected");
  }, [clearPendingEnd, clearPendingStart, stopRecording, log]);

  const startSession = useCallback(async (sessionId: string, deviceId?: string) => {
    sessionIdRef.current = sessionId;

    if (!deviceId && selectedDevice) {
      deviceId = selectedDevice;
    } else if (!deviceId && devices.length > 0) {
      deviceId = devices[0].deviceId;
    }

    setSelectedDevice(deviceId || null);
    const websocket = connectWebSocket(sessionId);

    console.log("[DEBUG] After connectWebSocket, waiting for open...");

    try {
      await waitForWebSocketOpen(websocket);
      console.log("[DEBUG] WebSocket opened successfully");
    } catch (error) {
      console.log("[DEBUG] waitForWebSocketOpen failed:", error);
      disconnect();
      throw error;
    }

    console.log("[DEBUG] Starting recording...");
    try {
      await startRecording(deviceId);
      console.log("[DEBUG] Recording started successfully");
    } catch (error) {
      console.log("[DEBUG] startRecording failed:", error);
      disconnect();
      throw error;
    }

    if (!websocketRef.current || websocketRef.current !== websocket || websocket.readyState !== WebSocket.OPEN) {
      const disconnectError = socketCloseErrorRef.current;
      const enhancedError = disconnectError || new Error("WebSocket disconnected before recording could begin");

      // Add additional context to help debugging
      if (!disconnectError) {
        (enhancedError as any).context = {
          websocketRefCurrent: !!websocketRef.current,
          isSameInstance: websocketRef.current === websocket,
          readyState: websocket?.readyState,
          readyStateDescription: websocket ? ["CONNECTING", "OPEN", "CLOSING", "CLOSED"][websocket.readyState - 1] || "UNKNOWN" : "NO_WEBSOCKET",
          recorderState: recorderStateRef.current
        };
      }

      disconnect();
      throw enhancedError;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        pendingStartRef.current = {
          resolve,
          reject,
          timeoutId: window.setTimeout(() => {
            pendingStartRef.current = null;
            reject(new Error("Timed out waiting for live capture to begin"));
          }, 8000),
        };

        websocket.send(JSON.stringify({
          type: "session.begin",
          mimeType: recorderMimeTypeRef.current || mimeType,
        }));
      });
    } catch (error) {
      disconnect();
      throw error;
    }
  }, [connectWebSocket, startRecording, selectedDevice, devices, disconnect, waitForWebSocketOpen]);

  const pauseSession = useCallback(() => {
    if (websocketRef.current?.readyState === WebSocket.OPEN) {
      websocketRef.current.send(JSON.stringify({ type: "session.pause" }));
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
    }
    if (pausedAtRef.current === null) {
      pausedAtRef.current = Date.now();
    }
    syncRecorderState("paused");
    log("Session paused");
  }, [log, syncRecorderState]);

  const resumeSession = useCallback(() => {
    if (websocketRef.current?.readyState === WebSocket.OPEN) {
      websocketRef.current.send(JSON.stringify({ type: "session.resume" }));
    }
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
    }
    if (pausedAtRef.current !== null) {
      pausedDurationMsRef.current += Math.max(0, Date.now() - pausedAtRef.current);
      pausedAtRef.current = null;
    }
    syncRecorderState("recording");
    log("Session resumed");
  }, [log, syncRecorderState]);

  const endSession = useCallback(async () => {
    syncRecorderState("stopping");
    setError(null);

    const sessionId = sessionIdRef.current;
    const endedAtMs = Date.now();
    const captureStartedAt = captureStartedAtRef.current;
    const pausedAt = pausedAtRef.current;
    let uploadError: Error | null = null;
    await flushAndStopRecording();

    if (sessionId) {
      const totalPausedMs = pausedDurationMsRef.current + (
        pausedAt !== null
          ? Math.max(0, endedAtMs - pausedAt)
          : 0
      );
      const finalDurationMs = captureStartedAt !== null
        ? Math.max(0, endedAtMs - captureStartedAt - totalPausedMs)
        : null;
      pausedAtRef.current = null;
      pausedDurationMsRef.current = 0;
      captureStartedAtRef.current = null;
      try {
        await uploadFinalRecording(sessionId, finalDurationMs);
      } catch (error) {
        uploadError = error instanceof Error
          ? error
          : new Error("Failed to upload the final recording");
        log("Final recording upload failed; continuing with websocket end", {
          sessionId,
          error: uploadError.message,
        });
        setError(uploadError.message);
      }
    }

    const websocket = websocketRef.current;
    syncRecorderState("idle");
    setConnectionState("closed");
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      log("Session ended without active WebSocket");
      return;
    }

    await new Promise<void>((resolve, reject) => {
      pendingEndRef.current = {
        resolve,
        reject,
        timeoutId: window.setTimeout(() => {
          pendingEndRef.current = null;
          reject(new Error("Timed out waiting for session to finish"));
        }, 60000), // 60 seconds - server needs time for final hybrid reconciliation
      };

      websocket.send(JSON.stringify({ type: "session.end" }));
    });

    log("Session ended");
  }, [flushAndStopRecording, log, syncRecorderState, uploadFinalRecording]);

  const selectDevice = useCallback((deviceId: string) => {
    setSelectedDevice(deviceId);
  }, []);

  useEffect(() => {
    checkPermission();
    enumerateDevices();
  }, [checkPermission, enumerateDevices]);

  return {
    permissionState,
    connectionState,
    recorderState,
    error,
    audioLevel,
    devices,
    selectedDevice,
    startSession,
    pauseSession,
    resumeSession,
    endSession,
    selectDevice,
    disconnect,
  };
}
