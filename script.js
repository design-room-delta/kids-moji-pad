(() => {
  const textDisplay = document.getElementById("textDisplay");
  const deleteBtn = document.getElementById("deleteBtn");
  const playBtn = document.getElementById("playBtn");
  const micBtn = document.getElementById("micBtn");
  const statusBar = document.getElementById("statusBar");
  const modeToggle = document.getElementById("modeToggle");
  const kanaTable = document.getElementById("kanaTable");

  let mode = "hiragana"; // "hiragana" | "katakana"
  let isSpeaking = false;
  let isListening = false;

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
    textDisplay.value += char;
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
  function speakText(text, { rate = 0.8 } = {}) {
    if (!text || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = rate;
    utterance.pitch = 1.05;
    window.speechSynthesis.speak(utterance);
  }

  playBtn.addEventListener("click", () => {
    const text = textDisplay.value;
    if (!text) {
      showStatus("なにか もじを えらんでね");
      return;
    }
    if (!("speechSynthesis" in window)) {
      showStatus("ごめんね、この きかいでは よみあげが できないよ");
      return;
    }
    isSpeaking = true;
    playBtn.classList.add("speaking");
    showStatus("よんでいるよ…", 0);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = 0.75;
    utterance.pitch = 1.05;
    utterance.onend = utterance.onerror = () => {
      isSpeaking = false;
      playBtn.classList.remove("speaking");
      showStatus("");
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });

  // ---------- 削除ボタン（タップ＝1文字 / 長押し＝全部） ----------
  const LONG_PRESS_MS = 700;
  let pressTimer = null;
  let didLongPress = false;

  function deleteLastChar() {
    if (!textDisplay.value) return;
    textDisplay.value = [...textDisplay.value].slice(0, -1).join("");
  }

  function clearAll() {
    textDisplay.value = "";
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
  // 混ざっていても、そのままでは絶対に表示しない。まず余計な文字を全部取り除き、
  // 残ったかなを今のモードに合わせて変換する。
  function normalizeToKanaOnly(rawText, targetMode) {
    const kanaOnly = rawText.replace(/[^ぁ-ゖァ-ヶー]/g, "");
    return targetMode === "katakana"
      ? hiraganaToKatakana(kanaOnly)
      : katakanaToHiragana(kanaOnly);
  }

  let recognition = null;
  if (SpeechRecognitionCtor) {
    recognition = new SpeechRecognitionCtor();
    recognition.lang = "ja-JP";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      isListening = true;
      micBtn.classList.add("listening");
      showStatus("きいているよ…", 0);
    };

    recognition.onresult = (event) => {
      const raw = event.results[0][0].transcript;
      const safe = normalizeToKanaOnly(raw, mode);
      if (safe) {
        textDisplay.value += safe;
        showStatus("にゅうりょく できたよ！");
      } else {
        showStatus("もういちど はなしてみてね");
      }
    };

    recognition.onerror = () => {
      showStatus("うまく きこえなかったよ、もういちど どうぞ");
    };

    recognition.onend = () => {
      isListening = false;
      micBtn.classList.remove("listening");
    };
  } else {
    micBtn.classList.add("unsupported");
  }

  micBtn.addEventListener("click", () => {
    if (!recognition) {
      showStatus("ごめんね、この きかいでは こえの にゅうりょくが できないよ");
      return;
    }
    if (isListening) {
      recognition.stop();
      return;
    }
    window.speechSynthesis.cancel();
    try {
      recognition.start();
    } catch (err) {
      // すでに開始中などのエラーは静かに無視する
    }
  });

  // ---------- 初期化 ----------
  renderKanaTable();
})();
