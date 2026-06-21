import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useLiveConversationAudio } from "@/hooks/useLiveConversationAudio";

class MockWebSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  close = vi.fn((_code?: number, _reason?: string) => {
    this.readyState = MockWebSocket.CLOSED;
  });
  send = vi.fn();

  constructor(url: string) {
    super();
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  emitError() {
    const event = new Event("error");
    this.dispatchEvent(event);
    this.onerror?.(event);
  }

  emitClose(code = 1006, reason = "") {
    this.readyState = MockWebSocket.CLOSED;
    const event = new CloseEvent("close", { code, reason });
    this.dispatchEvent(event);
    this.onclose?.(event);
  }
}

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];

  static isTypeSupported(_mimeType: string) {
    return true;
  }

  stream: MediaStream;
  mimeType: string;
  state: RecordingState = "inactive";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  start = vi.fn(() => {
    this.state = "recording";
  });
  requestData = vi.fn();
  stop = vi.fn(() => {
    this.state = "inactive";
  });
  pause = vi.fn(() => {
    this.state = "paused";
  });
  resume = vi.fn(() => {
    this.state = "recording";
  });

  constructor(stream: MediaStream, options?: MediaRecorderOptions) {
    this.stream = stream;
    this.mimeType = options?.mimeType || "audio/webm";
    MockMediaRecorder.instances.push(this);
  }
}

describe("useLiveConversationAudio", () => {
  const originalWebSocket = globalThis.WebSocket;
  const originalMediaRecorder = globalThis.MediaRecorder;
  const originalFetch = globalThis.fetch;
  const originalMediaDevices = navigator.mediaDevices;
  const originalPermissions = navigator.permissions;
  let getUserMedia: ReturnType<typeof vi.fn>;
  let enumerateDevices: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    MockWebSocket.instances = [];
    MockMediaRecorder.instances = [];
    getUserMedia = vi.fn();
    enumerateDevices = vi.fn(async () => []);

    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      value: MockWebSocket,
    });

    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      value: MockMediaRecorder,
    });

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices,
        getUserMedia,
      },
    });

    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: {
        query: vi.fn(async () => ({
          state: "prompt",
          addEventListener: vi.fn(),
        })),
      },
    });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      value: originalWebSocket,
    });
    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      value: originalMediaRecorder,
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: originalFetch,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: originalMediaDevices,
    });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: originalPermissions,
    });
    vi.clearAllMocks();
  });

  it("rejects immediately when the websocket errors during connect", async () => {
    const { result } = renderHook(() => useLiveConversationAudio());

    const startPromise = result.current.startSession("live-session-1");
    const errorPromise = startPromise.then(
      () => null,
      (error) => error as Error,
    );

    const socket = MockWebSocket.instances.at(-1);
    expect(socket?.url).toContain("/api/voice/live/sessions/live-session-1/stream");

    await act(async () => {
      socket?.emitError();
      await Promise.resolve();
    });

    const error = await errorPromise;
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe("WebSocket connection failed");
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(socket?.close).not.toHaveBeenCalled();
  });

  it("rejects immediately when the websocket closes before opening", async () => {
    const { result } = renderHook(() => useLiveConversationAudio());

    const startPromise = result.current.startSession("live-session-2");
    const errorPromise = startPromise.then(
      () => null,
      (error) => error as Error,
    );

    const socket = MockWebSocket.instances.at(-1);

    await act(async () => {
      socket?.emitClose(1006, "Proxy rejected the websocket connection");
      await Promise.resolve();
    });

    const error = await errorPromise;
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe("Proxy rejected the websocket connection");
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("does not time out once the first live audio chunk is flowing", async () => {
    const fakeTrack = { stop: vi.fn() };
    const fakeStream = {
      getTracks: () => [fakeTrack],
    } as unknown as MediaStream;
    getUserMedia.mockResolvedValue(fakeStream);
    const onSessionStateChange = vi.fn();

    const { result } = renderHook(() => useLiveConversationAudio({ onSessionStateChange }));

    const startPromise = result.current.startSession("live-session-3");
    const socket = MockWebSocket.instances.at(-1);
    expect(socket).toBeTruthy();

    await act(async () => {
      if (!socket) return;
      socket.readyState = MockWebSocket.OPEN;
      const openEvent = new Event("open");
      socket.dispatchEvent(openEvent);
      socket.onopen?.(openEvent);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(MockMediaRecorder.instances).toHaveLength(2);
    const recorder = MockMediaRecorder.instances[0];
    const archiveRecorder = MockMediaRecorder.instances[1];
    expect(recorder).toBeTruthy();
    expect(archiveRecorder).toBeTruthy();
    expect(socket?.send).toHaveBeenCalledWith(expect.stringContaining("\"type\":\"session.begin\""));
    expect(socket?.send).toHaveBeenCalledWith(expect.stringContaining("\"mimeType\":\"audio/webm"));

    await act(async () => {
      recorder?.ondataavailable?.({
        data: new Blob(["audio-bytes"], { type: "audio/webm" }),
      } as BlobEvent);

      // Simulate server sending session.state message after receiving first chunk
      if (socket && socket.onmessage) {
        const stateMessage = new MessageEvent("message", {
          data: JSON.stringify({
            type: "session.state",
            sessionId: "live-session-3",
            status: "live",
            timestamp: new Date().toISOString(),
          }),
        });
        socket.onmessage(stateMessage);
      }

      await startPromise;
    });

    expect(socket?.send).toHaveBeenCalledWith(expect.any(Blob));
    expect(onSessionStateChange).toHaveBeenCalledWith("live-session-3", "live");
    expect(result.current.recorderState).toBe("recording");
    expect(result.current.error).toBeNull();
  });

  it("does not emit another live state when the final recorder chunk arrives during stop", async () => {
    const fakeTrack = { stop: vi.fn() };
    const fakeStream = {
      getTracks: () => [fakeTrack],
    } as unknown as MediaStream;
    getUserMedia.mockResolvedValue(fakeStream);
    const onSessionStateChange = vi.fn();

    const { result } = renderHook(() => useLiveConversationAudio({ onSessionStateChange }));

    const startPromise = result.current.startSession("live-session-4");
    const socket = MockWebSocket.instances.at(-1);

    await act(async () => {
      if (!socket) return;
      socket.readyState = MockWebSocket.OPEN;
      const openEvent = new Event("open");
      socket.dispatchEvent(openEvent);
      socket.onopen?.(openEvent);
      await Promise.resolve();
      await Promise.resolve();
    });

    const recorder = MockMediaRecorder.instances[0];
    expect(recorder).toBeTruthy();

    await act(async () => {
      recorder?.ondataavailable?.({
        data: new Blob(["audio-bytes"], { type: "audio/webm" }),
      } as BlobEvent);

      // Simulate server sending session.state message after receiving first chunk
      if (socket && socket.onmessage) {
        const stateMessage = new MessageEvent("message", {
          data: JSON.stringify({
            type: "session.state",
            sessionId: "live-session-4",
            status: "live",
            timestamp: new Date().toISOString(),
          }),
        });
        socket.onmessage(stateMessage);
      }

      await startPromise;
    });

    onSessionStateChange.mockClear();

    const endPromise = result.current.endSession();
    await act(async () => {
      const archiveRecorder = MockMediaRecorder.instances[1] as any;
      recorder?.ondataavailable?.({
        data: new Blob(["final-streaming-audio-bytes"], { type: "audio/webm" }),
      } as BlobEvent);
      archiveRecorder?.ondataavailable?.({
        data: new Blob(["final-audio-bytes"], { type: "audio/webm" }),
      } as BlobEvent);
      archiveRecorder?.onstop?.(new Event("stop"));
      await waitFor(() => {
        expect(socket?.send).toHaveBeenCalledWith(expect.stringContaining("\"type\":\"session.end\""));
      });
      socket?.onmessage?.(new MessageEvent("message", {
        data: JSON.stringify({ type: "session.state", sessionId: "live-session-4", status: "review_required" }),
      }));
      await endPromise;
    });

    expect(onSessionStateChange).not.toHaveBeenCalledWith("live-session-4", "live");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/voice/live/sessions/live-session-4/audio/final"),
      expect.objectContaining({
        body: expect.any(Blob),
        credentials: "include",
        method: "POST",
      }),
    );
  });

  it("opens a fresh websocket when starting a different session than the existing open socket", async () => {
    const fakeTrack = { stop: vi.fn() };
    const fakeStream = {
      getTracks: () => [fakeTrack],
    } as unknown as MediaStream;
    getUserMedia.mockResolvedValue(fakeStream);

    const { result } = renderHook(() => useLiveConversationAudio());

    const firstStartPromise = result.current.startSession("live-session-a");
    const firstSocket = MockWebSocket.instances.at(-1);

    await act(async () => {
      if (!firstSocket) return;
      firstSocket.readyState = MockWebSocket.OPEN;
      const openEvent = new Event("open");
      firstSocket.dispatchEvent(openEvent);
      firstSocket.onopen?.(openEvent);
      await Promise.resolve();
      await Promise.resolve();
    });

    const firstRecorder = MockMediaRecorder.instances[0];
    await act(async () => {
      firstRecorder?.ondataavailable?.({
        data: new Blob(["audio-a"], { type: "audio/webm" }),
      } as BlobEvent);

      // Simulate server sending session.state message after receiving first chunk
      if (firstSocket && firstSocket.onmessage) {
        const stateMessage = new MessageEvent("message", {
          data: JSON.stringify({
            type: "session.state",
            sessionId: "live-session-a",
            status: "live",
            timestamp: new Date().toISOString(),
          }),
        });
        firstSocket.onmessage(stateMessage);
      }

      await firstStartPromise;
    });

    const secondStartPromise = result.current.startSession("live-session-b");
    const secondSocket = MockWebSocket.instances.at(-1);

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(secondSocket).not.toBe(firstSocket);
    expect(firstSocket?.close).toHaveBeenCalledWith(1000, "Switching live session");
    expect(secondSocket?.url).toContain("/api/voice/live/sessions/live-session-b/stream");

    await act(async () => {
      if (!secondSocket) return;
      secondSocket.readyState = MockWebSocket.OPEN;
      const openEvent = new Event("open");
      secondSocket.dispatchEvent(openEvent);
      secondSocket.onopen?.(openEvent);
      await Promise.resolve();
      await Promise.resolve();
    });

    const secondRecorder = MockMediaRecorder.instances[2];
    await act(async () => {
      secondRecorder?.ondataavailable?.({
        data: new Blob(["audio-b"], { type: "audio/webm" }),
      } as BlobEvent);

      // Simulate server sending session.state message after receiving first chunk
      if (secondSocket && secondSocket.onmessage) {
        const stateMessage = new MessageEvent("message", {
          data: JSON.stringify({
            type: "session.state",
            sessionId: "live-session-b",
            status: "live",
            timestamp: new Date().toISOString(),
          }),
        });
        secondSocket.onmessage(stateMessage);
      }

      await secondStartPromise;
    });

    expect(secondSocket?.send).toHaveBeenCalledWith(expect.stringContaining("\"type\":\"session.begin\""));
  });

  it("surfaces the websocket close reason when the socket dies after opening but before session.begin", async () => {
    let resolveMicrophone!: (stream: MediaStream) => void;
    const fakeTrack = { stop: vi.fn() };
    const fakeStream = {
      getTracks: () => [fakeTrack],
    } as unknown as MediaStream;
    getUserMedia.mockImplementation(() => new Promise<MediaStream>((resolve) => {
      resolveMicrophone = resolve;
    }));

    const { result } = renderHook(() => useLiveConversationAudio());

    const startPromise = result.current.startSession("live-session-close-reason");
    const errorPromise = startPromise.then(
      () => null,
      (error) => error as Error,
    );

    const socket = MockWebSocket.instances.at(-1);

    await act(async () => {
      if (!socket) return;
      socket.readyState = MockWebSocket.OPEN;
      const openEvent = new Event("open");
      socket.dispatchEvent(openEvent);
      socket.onopen?.(openEvent);
      await Promise.resolve();
    });

    await act(async () => {
      socket?.emitClose(1008, "Forbidden");
      resolveMicrophone(fakeStream);
      await Promise.resolve();
      await Promise.resolve();
    });

    const error = await errorPromise;
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe("Forbidden");
  });
});
