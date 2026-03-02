"use client";

import { Mic } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface AIVoiceInputProps {
  onStart?: () => void;
  onStop?: (duration: number) => void;
  onTranscript?: (text: string) => void;
  visualizerBars?: number;
  className?: string;
  language?: string;
}

/** Get the SpeechRecognition constructor (Chrome uses webkit prefix) */
function getSpeechRecognition(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/**
 * Voice-to-text input component using the Web Speech API.
 * Captures microphone audio, transcribes it in real-time, and
 * returns final transcript via the `onTranscript` callback.
 *
 * Requests microphone permission explicitly before starting recognition
 * so the browser doesn't silently fail on mobile.
 */
export function AIVoiceInput({
  onStart,
  onStop,
  onTranscript,
  visualizerBars = 48,
  className,
  language = "en-US",
}: AIVoiceInputProps) {
  const [listening, setListening] = useState(false);
  const [time, setTime] = useState(0);
  const [isClient, setIsClient] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [supported, setSupported] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    setIsClient(true);
    if (!getSpeechRecognition()) {
      setSupported(false);
    }
  }, []);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (listening) {
      onStart?.();
      intervalId = setInterval(() => {
        setTime((t) => t + 1);
      }, 1000);
    } else {
      onStop?.(time);
      setTime(0);
    }

    return () => clearInterval(intervalId);
  }, [listening, time, onStart, onStop]);

  /** Request microphone permission before starting recognition */
  const requestMicPermission = useCallback(async (): Promise<boolean> => {
    try {
      // navigator.mediaDevices.getUserMedia triggers the browser permission prompt
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Immediately stop the tracks — we only needed the permission grant
      stream.getTracks().forEach((track) => track.stop());
      setPermissionDenied(false);
      return true;
    } catch (err) {
      console.error("Microphone permission denied:", err);
      setPermissionDenied(true);
      toast.error("Microphone access denied. Please allow microphone in your browser settings.");
      return false;
    }
  }, []);

  const startRecognition = useCallback(async () => {
    const SR = getSpeechRecognition();
    if (!SR) {
      toast.error("Speech recognition is not supported in this browser.");
      return;
    }

    // Request mic permission first — prevents silent failures on mobile
    const hasPermission = await requestMicPermission();
    if (!hasPermission) return;

    try {
      const recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        if (final) {
          onTranscript?.(final);
          setInterimText("");
        } else {
          setInterimText(interim);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === "not-allowed") {
          setPermissionDenied(true);
          toast.error("Microphone blocked. Enable it in browser settings.");
        } else if (event.error === "network") {
          toast.error("Network error — speech recognition needs an internet connection.");
        } else if (event.error !== "aborted") {
          toast.error("Voice input stopped unexpectedly. Tap mic to try again.");
        }
        setListening(false);
      };

      recognition.onend = () => {
        setListening(false);
        setInterimText("");
      };

      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch (err) {
      console.error("Failed to start speech recognition:", err);
      toast.error("Could not start voice input. Please try again.");
    }
  }, [language, onTranscript, requestMicPermission]);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
    setInterimText("");
  }, []);

  const handleClick = () => {
    if (listening) {
      stopRecognition();
    } else {
      startRecognition();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (!supported) {
    return null; // Don't render if Speech API not supported
  }

  return (
    <div className={cn("w-full py-2", className)}>
      <div className="relative max-w-xl w-full mx-auto flex items-center flex-col gap-1.5">
        <button
          className={cn(
            "group w-12 h-12 rounded-xl flex items-center justify-center transition-all",
            listening
              ? "bg-red-100 dark:bg-red-500/15 ring-2 ring-red-400 dark:ring-red-500/40"
              : "bg-muted/50 hover:bg-muted"
          )}
          type="button"
          onClick={handleClick}
          title={listening ? "Stop recording" : "Start voice input"}
        >
          {listening ? (
            <div
              className="w-5 h-5 rounded-sm animate-spin bg-red-500 dark:bg-red-400 cursor-pointer"
              style={{ animationDuration: "3s" }}
            />
          ) : (
            <Mic className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
          )}
        </button>

        <span
          className={cn(
            "font-mono text-xs transition-opacity duration-300",
            listening
              ? "text-red-600 dark:text-red-400 font-medium"
              : "text-muted-foreground/50"
          )}
        >
          {formatTime(time)}
        </span>

        <div className="h-4 w-48 flex items-center justify-center gap-0.5">
          {[...Array(visualizerBars)].map((_, i) => (
            <div
              key={i}
              className={cn(
                "w-0.5 rounded-full transition-all duration-300",
                listening
                  ? "bg-red-400/60 dark:bg-red-400/50 animate-pulse"
                  : "bg-muted h-1"
              )}
              style={
                listening && isClient
                  ? {
                      height: `${20 + Math.random() * 80}%`,
                      animationDelay: `${i * 0.05}s`,
                    }
                  : undefined
              }
            />
          ))}
        </div>

        <p className="h-4 text-[11px] text-muted-foreground">
          {listening ? (
            <span className="text-red-600 dark:text-red-400 font-medium">
              {interimText || "Listening..."}
            </span>
          ) : permissionDenied ? (
            <span className="text-amber-600 dark:text-amber-400">Mic blocked — check browser settings</span>
          ) : (
            "Tap mic to speak"
          )}
        </p>
      </div>
    </div>
  );
}
