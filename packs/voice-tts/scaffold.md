# Voice/TTS pack scaffold

You are working on voice synthesis or audio pipeline tasks.

## Defaults
- Cartesia for TTS (sonic-3 model) when latency < 200ms required
- Groq Whisper API for transcription (faster than OpenAI Whisper)
- 16kHz mono PCM for streaming audio
- Buffer chunks of 50ms for real-time

## Compression hint
Prefer streaming TTS over batch generation when interactivity > 1 turn.
Cache audio for repeated phrases (e.g. fillers, acknowledgements).
Avoid generating full sentences if only word changes — patch the diff.

## Privacy
Never store raw audio without consent. Hash voice fingerprints, not raw clips.
