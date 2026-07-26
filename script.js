(() => {
  const textDisplay = document.getElementById("textDisplay");
  const textChars = document.getElementById("textChars");
  const highlightMarker = document.getElementById("highlightMarker");
  const deleteBtn = document.getElementById("deleteBtn");
  const playBtn = document.getElementById("playBtn");
  const micBtn = document.getElementById("micBtn");
  const statusBar = document.getElementById("statusBar");
  const modeToggle = document.getElementById("modeToggle");
  const kanaTable = document.getElementById("kanaTable");

  let mode = "hiragana"; // "hiragana" | "katakana"
  let isSpeaking = false;
  let isListening = false;

  // ---------- 入力テキストの表示（1文字ずつ span にして持つ） ----------
  let currentText = "";

  function renderTextDisplay() {
    textChars.innerHTML = "";
    [...currentText].forEach((ch) => {
      const span = document.createElement("span");
      span.className = "char";
      span.textContent = ch;
      textChars.appendChild(span);
    });
    textDisplay.classList.toggle("is-empty", currentText.length === 0);
    hideHighlight();
  }

  function appendText(str) {
    currentText += str;
    renderTextDisplay();
  }

  function setText(str) {
    currentText = str;
    renderTextDisplay();
  }

  // 読み上げ中の文字にあわせて、マーカーの四角を移動させる。
  // 文字の色そのものは一切変えず、四角を mix-blend-mode で重ねるだけ。
  function moveHighlightTo(startIndex, endIndex) {
    const spans = textChars.querySelectorAll(".char");
    const startSpan = spans[startIndex];
    const endSpan = spans[Math.max(startIndex, endIndex - 1)];
    if (!startSpan || !endSpan) {
      hideHighlight();
      return;
    }
    const containerRect = textDisplay.getBoundingClientRect();
    const startRect = startSpan.getBoundingClientRect();
    const endRect = endSpan.getBoundingClientRect();
    const left = startRect.left - containerRect.left + textDisplay.scrollLeft;
    const top = startRect.top - containerRect.top + textDisplay.scrollTop;
    const width = endRect.right - startRect.left;
    const height = Math.max(startRect.height, endRect.height);
    highlightMarker.style.transform = `translate(${left}px, ${top}px)`;
    highlightMarker.style.width = `${width}px`;
    highlightMarker.style.height = `${height}px`;
    highlightMarker.classList.add("show");
  }

  function hideHighlight() {
    highlightMarker.classList.remove("show");
  }

  // ---------- ステータス表示 ----------
  let statusTimer = null;
  function showStatus(message, ms = 2400) {
    statusBar.textContent = message;
    clearTimeout(statusTimer);
    if (ms > 0) {
      statusTimer = setTimeout(() => {
        statusBar.textContent = "";
      }, ms);
    }
  }

  // ---------- もじ表の描画 ----------
  const ROW_COLORS = [
    "row-pink",
    "row-orange",
    "row-yellow",
    "row-green",
    "row-blue",
    "row-purple",
  ];

  function renderKanaTable() {
    kanaTable.innerHTML = "";
    let rowIndex = 0;

    KANA_GROUPS.forEach((group) => {
      const heading = document.createElement("h2");
      heading.className = "group-heading";
      heading.textContent = group.heading;
      kanaTable.appendChild(heading);

      group.rows.forEach((hiraganaChars) => {
        const rowEl = document.createElement("div");
        rowEl.className = `kana-row ${ROW_COLORS[rowIndex % ROW_COLORS.length]}`;
        rowIndex++;

        hiraganaChars.forEach((hChar) => {
          const shownChar = mode === "katakana" ? hiraganaToKatakana(hChar) : hChar;
          const btn = document.createElement("button");
          btn.className = "kana-btn";
          btn.type = "button";
          btn.textContent = shownChar;
          btn.addEventListener("click", () => handleKanaTap(shownChar, btn));
          rowEl.appendChild(btn);
        });

        kanaTable.appendChild(rowEl);
      });
    });
  }

  function handleKanaTap(char, btnEl) {
    appendText(char);
    btnEl.classList.add("tapped");
    setTimeout(() => btnEl.classList.remove("tapped"), 220);
    speakText(char, { rate: 0.75 });
    const rect = btnEl.getBoundingClientRect();
    burstParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, {
      count: 8,
      distance: 50,
      symbols: ["★", "☆", "✦"],
    });
  }

  // ---------- パァーン！パーティクル演出 ----------
  const PARTICLE_COLORS = ["#ff8fa3", "#ffb26b", "#f4d35e", "#6bcf8f", "#5aa9e6", "#b28dff"];

  function burstParticles(x, y, { count = 16, distance = 90, symbols = ["★", "☆", "✦", "✧"] } = {}) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const dist = distance * (0.7 + Math.random() * 0.6);
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const el = document.createElement("span");
      el.className = "particle";
      el.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      el.style.setProperty("--start-x", `${x}px`);
      el.style.setProperty("--start-y", `${y}px`);
      el.style.setProperty("--dx", `${dx}px`);
      el.style.setProperty("--dy", `${dy}px`);
      el.style.fontSize = `${14 + Math.random() * 14}px`;
      el.style.color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
      document.body.appendChild(el);
      el.addEventListener("animationend", () => el.remove());
    }
  }

  // ---------- ひらがな/カタカナ切り替え ----------
  function setMode(newMode) {
    mode = newMode;
    modeToggle.classList.toggle("katakana-mode", mode === "katakana");
    modeToggle.setAttribute("aria-pressed", mode === "katakana" ? "true" : "false");
    renderKanaTable();
  }

  modeToggle.addEventListener("click", () => {
    setMode(mode === "hiragana" ? "katakana" : "hiragana");
  });

  // ---------- 読み上げ (発音・全文) ----------
  // 読み上げの「世代」。新しい読み上げが始まったり、途中で別の発音が
  // 割り込んだ時に、古い読み上げループを止めるための目印。
  let speechGeneration = 0;

  function speakText(text, { rate = 0.8 } = {}) {
    if (!text || !("speechSynthesis" in window)) return;
    speechGeneration += 1; // 進行中の全文読み上げがあれば止める
    resetReadAloudUI();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = rate;
    utterance.pitch = 1.05;
    window.speechSynthesis.speak(utterance);
  }

  function resetReadAloudUI() {
    isSpeaking = false;
    playBtn.classList.remove("speaking");
    hideHighlight();
  }

  // 「きゃ」「って」のような拗音・促音がバラバラに読まれて不自然に
  // ならないよう、小さい文字・長音符・促音は前後の文字とまとめて
  // ひとかたまり(＝ひと呼吸)として扱う。
  const SMALL_KANA = new Set([
    "ゃ", "ゅ", "ょ", "ぁ", "ぃ", "ぅ", "ぇ", "ぉ", "ー",
    "ャ", "ュ", "ョ", "ァ", "ィ", "ゥ", "ェ", "ォ",
  ]);
  const SOKUON = new Set(["っ", "ッ"]);

  function splitIntoSpeechUnits(chars) {
    const units = [];
    let i = 0;
    while (i < chars.length) {
      const start = i;
      const unitChars = [chars[i]];
      i += 1;
      if (SOKUON.has(chars[start]) && i < chars.length) {
        unitChars.push(chars[i]);
        i += 1;
      }
      while (i < chars.length && SMALL_KANA.has(chars[i])) {
        unitChars.push(chars[i]);
        i += 1;
      }
      units.push({ text: unitChars.join(""), start, end: i });
    }
    return units;
  }

  const BEAT_PAUSE_MS = 220;

  playBtn.addEventListener("click", () => {
    const text = currentText;
    if (!text) {
      showStatus("なにか もじを えらんでね");
      return;
    }
    if (!("speechSynthesis" in window)) {
      showStatus("ごめんね、この きかいでは よみあげが できないよ");
      return;
    }

    speechGeneration += 1;
    const myGeneration = speechGeneration;
    window.speechSynthesis.cancel();

    isSpeaking = true;
    playBtn.classList.add("speaking");
    showStatus("よんでいるよ…", 0);

    const units = splitIntoSpeechUnits([...text]);
    let unitIndex = 0;

    function speakNextUnit() {
      if (myGeneration !== speechGeneration) return; // 何かに割り込まれた
      if (unitIndex >= units.length) {
        isSpeaking = false;
        playBtn.classList.remove("speaking");
        showStatus("");
        hideHighlight();
        return;
      }
      const unit = units[unitIndex];
      moveHighlightTo(unit.start, unit.end);

      const utterance = new SpeechSynthesisUtterance(unit.text);
      utterance.lang = "ja-JP";
      utterance.rate = 0.75;
      utterance.pitch = 1.05;
      utterance.onend = utterance.onerror = () => {
        if (myGeneration !== speechGeneration) return;
        unitIndex += 1;
        setTimeout(speakNextUnit, BEAT_PAUSE_MS);
      };
      window.speechSynthesis.speak(utterance);
    }

    speakNextUnit();
  });

  // ---------- 削除ボタン（タップ＝1文字 / 長押し＝全部） ----------
  const LONG_PRESS_MS = 700;
  let pressTimer = null;
  let didLongPress = false;

  function deleteLastChar() {
    if (!currentText) return;
    setText([...currentText].slice(0, -1).join(""));
  }

  function clearAll() {
    setText("");
    showStatus("ぜんぶ けしたよ");

    const rect = textDisplay.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    burstParticles(cx, cy, { count: 26, distance: 130 });
    setTimeout(() => burstParticles(cx, cy, { count: 18, distance: 90 }), 120);
  }

  function startPress(e) {
    e.preventDefault();
    didLongPress = false;
    deleteBtn.classList.add("holding");
    pressTimer = setTimeout(() => {
      didLongPress = true;
      deleteBtn.classList.remove("holding");
      clearAll();
    }, LONG_PRESS_MS);
  }

  function endPress() {
    clearTimeout(pressTimer);
    deleteBtn.classList.remove("holding");
    if (!didLongPress) {
      deleteLastChar();
    }
  }

  function cancelPress() {
    clearTimeout(pressTimer);
    deleteBtn.classList.remove("holding");
  }

  deleteBtn.addEventListener("pointerdown", startPress);
  deleteBtn.addEventListener("pointerup", endPress);
  deleteBtn.addEventListener("pointerleave", cancelPress);
  deleteBtn.addEventListener("pointercancel", cancelPress);

  // ---------- マイク入力 ----------
  const SpeechRecognitionCtor =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  // 認識結果にひらがな・カタカナ・長音記号 以外(＝ 漢字やアルファベットなど)が
  // 混ざっていても、そのままでは絶対に表示しない。まず「よくある単語」の辞書で
  // 読みに直し、それでも残った漢字などは問答無用ですべて取り除く。
  function normalizeToKanaOnly(rawText, targetMode) {
    // kanji-readings.js が何らかの理由で読み込めていなくても、
    // かな以外を取り除く安全フィルタ自体は必ず動くようにしておく。
    const readable =
      typeof convertKnownKanjiToKana === "function"
        ? convertKnownKanjiToKana(rawText)
        : rawText;
    const kanaOnly = readable.replace(/[^ぁ-ゖァ-ヶー]/g, "");
    return targetMode === "katakana"
      ? hiraganaToKatakana(kanaOnly)
      : katakanaToHiragana(kanaOnly);
  }

  // iOS は Safari も Chrome も中身は WebKit で、標準の音声認識APIが
  // 「存在はするが実際には反応しない」ことが多い。デスクトップ Safari も同様。
  // これらでは API の有無に関わらず、確実に動く Whisper フォールバックを使う。
  const ua = navigator.userAgent;
  const isIOSDevice =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isDesktopSafari =
    !isIOSDevice && /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
  const isUnreliableWebKit = isIOSDevice || isDesktopSafari;

  if (SpeechRecognitionCtor && !isUnreliableWebKit) {
    setupNativeRecognition();
  } else {
    setupWhisperFallbackRecognition();
  }

  // Android Chrome / デスクトップ など、ブラウザ標準の音声認識が使える場合
  function setupNativeRecognition() {
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "ja-JP";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // ブラウザによっては start() したまま onresult/onerror/onend が
    // 一切発火しないことがある。そのまま「きいているよ」が残り続けて
    // 二度とマイクが使えなくなるのを防ぐための保険タイマー。
    let watchdogTimer = null;
    function clearWatchdog() {
      clearTimeout(watchdogTimer);
      watchdogTimer = null;
    }
    function resetListeningState() {
      clearWatchdog();
      isListening = false;
      micBtn.classList.remove("listening");
    }

    recognition.onstart = () => {
      isListening = true;
      micBtn.classList.add("listening");
      showStatus("きいているよ…", 0);
      clearWatchdog();
      watchdogTimer = setTimeout(() => {
        try {
          recognition.abort();
        } catch (err) {
          // 無視
        }
        resetListeningState();
        showStatus("うまく きこえなかったよ、もういちど どうぞ");
      }, 10000);
    };

    recognition.onresult = (event) => {
      try {
        const raw = event.results[0][0].transcript;
        const safe = normalizeToKanaOnly(raw, mode);
        if (safe) {
          appendText(safe);
          showStatus("にゅうりょく できたよ！");
        } else {
          showStatus("もういちど はなしてみてね");
        }
      } catch (err) {
        showStatus("うまく きこえなかったよ、もういちど どうぞ");
      }
    };

    recognition.onerror = (event) => {
      console.warn("SpeechRecognition error:", event.error);
      showStatus("うまく きこえなかったよ、もういちど どうぞ");
    };

    recognition.onend = () => {
      resetListeningState();
    };

    micBtn.addEventListener("click", () => {
      if (isListening) {
        try {
          recognition.stop();
        } catch (err) {
          // 無視
        }
        // stop() しても onend が来ない端末向けの保険。
        setTimeout(() => {
          if (isListening) {
            resetListeningState();
            showStatus("");
          }
        }, 1500);
        return;
      }
      window.speechSynthesis.cancel();
      try {
        recognition.start();
      } catch (err) {
        // すでに開始中などのエラーは静かに無視する
      }
    });
  }

  // iPhone Safari など、ブラウザ標準の音声認識が無い場合の代わり。
  // ブラウザの中だけで動く音声認識モデル(Whisper)を、必要になった
  // タイミングで初めて読み込む。
  const RECORD_MAX_MS = 8000;

  function setupWhisperFallbackRecognition() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      micBtn.classList.add("unsupported");
      micBtn.addEventListener("click", () => {
        showStatus("ごめんね、この きかいでは こえの にゅうりょくが できないよ");
      });
      return;
    }

    let transcriberPromise = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let autoStopTimer = null;

    function loadTranscriber() {
      if (!transcriberPromise) {
        showStatus("じゅんびしているよ…（はじめての ときだけ）", 0);
        transcriberPromise = import(
          "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2"
        ).then(({ pipeline, env }) => {
          env.allowLocalModels = false;
          return pipeline("automatic-speech-recognition", "Xenova/whisper-tiny");
        });
      }
      return transcriberPromise;
    }

    async function decodeToWhisperInput(blob) {
      const arrayBuffer = await blob.arrayBuffer();
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      const offlineCtx = new OfflineAudioContext(1, decoded.duration * 16000, 16000);
      const source = offlineCtx.createBufferSource();
      source.buffer = decoded;
      source.connect(offlineCtx.destination);
      source.start();
      const resampled = await offlineCtx.startRendering();
      audioCtx.close();
      return resampled.getChannelData(0);
    }

    async function startRecording() {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        handleRecordingStopped();
      };
      mediaRecorder.start();
      isListening = true;
      micBtn.classList.add("listening");
      showStatus("きいているよ…", 0);
      autoStopTimer = setTimeout(() => stopRecording(), RECORD_MAX_MS);
    }

    function stopRecording() {
      clearTimeout(autoStopTimer);
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
      isListening = false;
      micBtn.classList.remove("listening");
    }

    const TRANSCRIBE_TIMEOUT_MS = 20000;
    function withTimeout(promise, ms) {
      return Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), ms)
        ),
      ]);
    }

    async function handleRecordingStopped() {
      if (recordedChunks.length === 0) return;
      showStatus("かんがえているよ…", 0);
      try {
        // Safari は webm ではなく mp4/aac などで録音するため、実際に
        // 使われた形式(mediaRecorder.mimeType)をそのまま使う。
        const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
        const [transcriber, audioData] = await withTimeout(
          Promise.all([loadTranscriber(), decodeToWhisperInput(blob)]),
          TRANSCRIBE_TIMEOUT_MS
        );
        const output = await withTimeout(
          transcriber(audioData, { language: "japanese", task: "transcribe" }),
          TRANSCRIBE_TIMEOUT_MS
        );
        const safe = normalizeToKanaOnly(output.text || "", mode);
        if (safe) {
          appendText(safe);
          showStatus("にゅうりょく できたよ！");
        } else {
          showStatus("もういちど はなしてみてね");
        }
      } catch (err) {
        console.warn("Whisper transcription failed:", err);
        showStatus("うまく きこえなかったよ、もういちど どうぞ");
      }
    }

    micBtn.addEventListener("click", async () => {
      if (isListening) {
        stopRecording();
        return;
      }
      window.speechSynthesis.cancel();
      try {
        await startRecording();
      } catch (err) {
        showStatus("マイクを つかう じゅんびが できなかったよ");
      }
    });
  }

  // ---------- 起動時のスプラッシュ演出 ----------
  function playSplash() {
    const splash = document.getElementById("splash");
    const splashIcon = splash ? splash.querySelector(".splash-icon") : null;
    if (!splash || !splashIcon) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduceMotion) {
      splash.remove();
      return;
    }

    let finished = false;
    function finishSplash() {
      if (finished) return;
      finished = true;
      splash.classList.add("hide");
      setTimeout(() => splash.remove(), 400);
    }

    // 待ちきれない子のために、タップしたらすぐ本編へ
    splash.addEventListener("click", finishSplash, { once: true });

    const rect = splash.getBoundingClientRect();
    burstParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, {
      count: 28,
      distance: 140,
    });
    setTimeout(() => splashIcon.classList.add("show"), 150);
    setTimeout(finishSplash, 1500);
  }

  // ---------- 初期化 ----------
  renderKanaTable();
  playSplash();
})();
