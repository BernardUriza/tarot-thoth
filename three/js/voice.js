// Voice, through susurro (Bernard's STT/TTS gateway) by way of the cristal.cli
// server, which holds the key: the reading read aloud, the question dictated.

async function detailOf(response) {
  try { return (await response.json()).detail ?? `HTTP ${response.status}`; } catch { return `HTTP ${response.status}`; }
}

// Whether the server has a susurro key. Without one the page shows no voice buttons.
export async function voiceAvailable(api) {
  try {
    const response = await fetch(`${api}/tarot/voice`);
    return response.ok && (await response.json()).available === true;
  } catch {
    return false;
  }
}

// Reads a text aloud. One voice at a time: starting a new one stops the last.
export function createSpeaker(api, voice) {
  let audio = null;

  function stop() {
    if (!audio) return;
    audio.pause();
    URL.revokeObjectURL(audio.src);
    audio = null;
  }

  // Resolves once the audio is playing; onEnd fires when it finishes by itself.
  async function play(text, onEnd) {
    stop();
    const response = await fetch(`${api}/tarot/voice/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, voice.max_speak_chars), voice: voice.name }),
    });
    if (!response.ok) throw new Error(await detailOf(response));
    const mine = audio = new Audio(URL.createObjectURL(await response.blob()));
    mine.addEventListener('ended', () => { if (audio === mine) { stop(); onEnd(); } });
    await mine.play();
  }

  return { play, stop, get playing() { return audio !== null; } };
}

// Records the microphone until stop() is called (or the time limit passes),
// then resolves stop() to what susurro heard.
export function createDictation(api, voice) {
  let recorder = null;
  let limit = 0;
  let heard = null;

  async function start(onLimit) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.addEventListener('dataavailable', (event) => chunks.push(event.data));
    heard = new Promise((resolve, reject) => {
      recorder.addEventListener('stop', async () => {
        stream.getTracks().forEach((track) => track.stop());
        const type = recorder.mimeType || 'audio/webm';
        recorder = null;
        try {
          const format = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : 'webm';
          const response = await fetch(`${api}/tarot/voice/listen?language=${voice.language}&format=${format}`, {
            method: 'POST', headers: { 'Content-Type': type }, body: new Blob(chunks, { type }),
          });
          if (!response.ok) throw new Error(await detailOf(response));
          resolve((await response.json()).transcript);
        } catch (error) {
          reject(error);
        }
      });
    });
    recorder.start();
    limit = setTimeout(onLimit, voice.max_listen_seconds * 1000);
  }

  function stop() {
    clearTimeout(limit);
    recorder?.stop();
    return heard;
  }

  return { start, stop, get recording() { return recorder !== null; } };
}
