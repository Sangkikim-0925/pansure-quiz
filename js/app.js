// 앱 로직: 홈 / 퀴즈 / 통계 뷰 렌더링
(() => {
  const root = document.getElementById("app");
  let state = STORE.load();
  let session = null; // { queue: [cardId...], index, subject }
  let currentLevel = "기본"; // "기본" | "심화"

  const cardLevel = (c) => c.level || "기본";

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function cardById(id) {
    return PRECEDENTS.find((c) => c.id === id);
  }

  function dueCards(subject) {
    return PRECEDENTS.filter((c) => {
      if (cardLevel(c) !== currentLevel) return false;
      if (subject && subject !== "전체" && c.subject !== subject) return false;
      const cs = STORE.getCardState(state, c.id);
      return SRS.isDue(cs);
    });
  }

  function subjectList() {
    return [...new Set(PRECEDENTS.filter((c) => cardLevel(c) === currentLevel).map((c) => c.subject))];
  }

  // ---------- 홈 ----------
  function renderHome() {
    const subjects = subjectList();
    const rows = subjects
      .map((subj) => {
        const total = PRECEDENTS.filter((c) => c.subject === subj && cardLevel(c) === currentLevel).length;
        const due = dueCards(subj).length;
        return `
          <div class="subject-row">
            <div class="subject-name">${subj}</div>
            <div class="subject-meta">전체 ${total} · 오늘 ${due}</div>
            <button class="btn small" data-start="${subj}">학습</button>
          </div>`;
      })
      .join("");

    const totalDue = dueCards("전체").length;
    const emptyNotice = subjects.length === 0 ? `<p class="empty-notice">이 난이도에는 아직 카드가 없습니다.</p>` : "";

    root.innerHTML = `
      <header class="topbar">
        <h1>판례암기</h1>
        <button class="btn ghost" data-nav="stats">통계</button>
      </header>
      <div class="level-tabs">
        <button class="tab ${currentLevel === "기본" ? "active" : ""}" data-level="기본">기본 학습</button>
        <button class="tab ${currentLevel === "심화" ? "active" : ""}" data-level="심화">심화 학습</button>
      </div>
      <main class="home">
        <div class="hero">
          <div class="hero-count">${totalDue}</div>
          <div class="hero-label">오늘 복습할 판례</div>
          <button class="btn primary big" data-start="전체" ${totalDue === 0 ? "disabled" : ""}>오늘 학습 시작</button>
        </div>
        ${emptyNotice}
        <section class="subject-list">${rows}</section>
      </main>`;

    root.querySelectorAll("[data-level]").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentLevel = btn.dataset.level;
        renderHome();
      });
    });
    root.querySelectorAll("[data-start]").forEach((btn) => {
      btn.addEventListener("click", () => startSession(btn.dataset.start));
    });
    root.querySelector("[data-nav='stats']").addEventListener("click", renderStats);
  }

  // ---------- 퀴즈 세션 ----------
  function startSession(subject) {
    const queue = shuffle(dueCards(subject)).slice(0, 20).map((c) => c.id);
    if (queue.length === 0) {
      renderHome();
      return;
    }
    session = { queue, index: 0, subject, correct: 0 };
    renderQuestion();
  }

  // 리뷰 기록을 주제별/문제유형별 정답률로 집계 (약점 파악용)
  function reviewStats() {
    const byTopic = {};
    const byType = {};
    for (const h of state.history) {
      const card = cardById(h.cardId);
      if (!card) continue;

      const topicKey = `${card.subject}|${card.topic}`;
      if (!byTopic[topicKey]) byTopic[topicKey] = { subject: card.subject, topic: card.topic, total: 0, correct: 0 };
      byTopic[topicKey].total += 1;
      if (h.correct) byTopic[topicKey].correct += 1;

      const typeKey = h.qtype || "기타";
      if (!byType[typeKey]) byType[typeKey] = { type: typeKey, total: 0, correct: 0 };
      byType[typeKey].total += 1;
      if (h.correct) byType[typeKey].correct += 1;
    }
    const topics = Object.values(byTopic)
      .map((v) => ({ ...v, accuracy: v.correct / v.total }))
      .sort((a, b) => a.accuracy - b.accuracy);
    const qtypes = Object.values(byType)
      .map((v) => ({ ...v, accuracy: v.correct / v.total }))
      .sort((a, b) => a.accuracy - b.accuracy);
    return { topics, qtypes };
  }

  // 정답률이 낮은 주제의 카드를 SRS 예정일과 무관하게 모아 집중 학습 세션 구성
  function startWeakSession() {
    const { topics } = reviewStats();
    const MIN_SAMPLE = 3;
    let targets = topics.filter((t) => t.total >= MIN_SAMPLE && t.accuracy < 0.8).slice(0, 3);
    if (targets.length === 0) targets = topics.slice(0, 3);
    if (targets.length === 0) return;

    const pool = PRECEDENTS.filter((c) => targets.some((t) => t.subject === c.subject && t.topic === c.topic));
    const queue = shuffle(pool).slice(0, 20).map((c) => c.id);
    if (queue.length === 0) return;

    session = { queue, index: 0, subject: "약점 집중", correct: 0 };
    renderQuestion();
  }

  function pickDistractors(card, count) {
    const level = cardLevel(card);
    const pool = PRECEDENTS.filter((c) => c.id !== card.id && c.subject === card.subject && cardLevel(c) === level);
    const source = pool.length >= count ? pool : PRECEDENTS.filter((c) => c.id !== card.id && cardLevel(c) === level);
    return shuffle(source).slice(0, count);
  }

  function buildQuestion(card) {
    const types = ["ox", "blank", "case"];
    const type = types[Math.floor(Math.random() * types.length)];

    if (type === "ox") {
      const showTrue = Math.random() < 0.5;
      let statement = card.holding;
      let answer = "O";
      if (!showTrue) {
        if (card.contrast) {
          // 심화: 완전 무관한 판례가 아니라 헷갈리기 쉬운 유사 법리/예외를 오답으로 사용
          statement = card.contrast;
          answer = "X";
        } else {
          const [other] = pickDistractors(card, 1);
          statement = other ? other.holding : card.holding;
          answer = other ? "X" : "O";
        }
      }
      return {
        type,
        prompt: `[${card.subject}] ${card.caseNumber}\n다음 판시 취지 설명이 맞는지 O/X로 답하세요.`,
        statement,
        answer,
        reveal: card.holding
      };
    }

    if (type === "blank") {
      const blanked = card.holding.replace(card.keyword, "＿＿＿＿");
      const distractors = pickDistractors(card, 3).map((c) => c.keyword);
      const choices = shuffle([card.keyword, ...distractors]);
      return {
        type,
        prompt: `[${card.subject}] 빈칸에 들어갈 핵심 단어를 고르세요.`,
        statement: blanked,
        choices,
        answer: card.keyword,
        reveal: card.holding
      };
    }

    // case (사례형)
    let choices;
    if (card.contrast) {
      const fillers = pickDistractors(card, 2).map((c) => c.holding);
      choices = shuffle([card.holding, card.contrast, ...fillers]);
    } else {
      const distractors = pickDistractors(card, 3).map((c) => c.holding);
      choices = shuffle([card.holding, ...distractors]);
    }
    return {
      type,
      prompt: `[${card.subject}] 다음 쟁점에 대한 판례의 결론으로 옳은 것은?`,
      statement: card.issue,
      choices,
      answer: card.holding,
      reveal: card.holding
    };
  }

  function renderQuestion() {
    const card = cardById(session.queue[session.index]);
    const q = buildQuestion(card);
    session.current = { card, q, answered: false };

    const progress = `${session.index + 1} / ${session.queue.length}`;

    let bodyHtml = `<p class="statement">${q.statement.replace(/\n/g, "<br>")}</p>`;

    if (q.type === "ox") {
      bodyHtml += `
        <div class="choice-row">
          <button class="btn choice" data-answer="O">O</button>
          <button class="btn choice" data-answer="X">X</button>
        </div>`;
    } else {
      bodyHtml += `
        <div class="choice-col">
          ${q.choices
            .map((c) => `<button class="btn choice wide" data-answer="${encodeURIComponent(c)}">${c}</button>`)
            .join("")}
        </div>`;
    }

    root.innerHTML = `
      <header class="topbar">
        <button class="btn ghost" data-nav="home">← 종료</button>
        <span class="progress">${progress}</span>
      </header>
      <main class="quiz">
        <p class="prompt">${q.prompt.replace(/\n/g, "<br>")}</p>
        <div id="qbody">${bodyHtml}</div>
        <div id="feedback"></div>
      </main>`;

    root.querySelector("[data-nav='home']").addEventListener("click", () => {
      session = null;
      renderHome();
    });

    root.querySelectorAll("[data-answer]").forEach((btn) => {
      btn.addEventListener("click", () => onAnswer(decodeURIComponent(btn.dataset.answer)));
    });
  }

  function onAnswer(picked) {
    if (session.current.answered) return;
    session.current.answered = true;
    const { card, q } = session.current;
    const isCorrect = picked === q.answer;
    session.current.isCorrect = isCorrect;
    if (isCorrect) session.correct += 1;

    document.querySelectorAll("[data-answer]").forEach((b) => (b.disabled = true));

    const flagged = STORE.isFlagged(state, card.id);
    const feedback = document.getElementById("feedback");
    feedback.innerHTML = `
      <div class="feedback ${isCorrect ? "correct" : "wrong"}">
        <p>${isCorrect ? "정답입니다." : "오답입니다."}</p>
        <p class="reveal"><strong>${card.caseNumber}</strong><br>${q.reveal}</p>
      </div>
      <button class="btn flag ${flagged ? "flagged" : ""}" data-flag="${card.id}">
        ${flagged ? "🚩 신고됨 (취소하기)" : "🚩 이 카드 내용 오류 신고"}
      </button>
      <div class="rating-row">
        <button class="btn rate" data-grade="again">다시</button>
        <button class="btn rate" data-grade="hard">어려움</button>
        <button class="btn rate" data-grade="good">좋음</button>
        <button class="btn rate" data-grade="easy">쉬움</button>
      </div>`;

    feedback.querySelectorAll("[data-grade]").forEach((btn) => {
      btn.addEventListener("click", () => onRate(btn.dataset.grade));
    });

    feedback.querySelector("[data-flag]").addEventListener("click", (e) => {
      STORE.toggleFlag(state, card.id);
      const nowFlagged = STORE.isFlagged(state, card.id);
      const btn = e.currentTarget;
      btn.textContent = nowFlagged ? "🚩 신고됨 (취소하기)" : "🚩 이 카드 내용 오류 신고";
      btn.classList.toggle("flagged", nowFlagged);
    });
  }

  function onRate(grade) {
    const { card, q, isCorrect } = session.current;
    const cs = STORE.getCardState(state, card.id);
    const next = SRS.review(cs, grade);
    STORE.setCardState(state, card.id, next);
    STORE.recordReview(state, card.id, grade, { correct: isCorrect, qtype: q.type });

    session.index += 1;
    if (session.index >= session.queue.length) {
      renderSessionEnd();
    } else {
      renderQuestion();
    }
  }

  function renderSessionEnd() {
    root.innerHTML = `
      <header class="topbar"><h1>학습 완료</h1></header>
      <main class="home">
        <div class="hero">
          <div class="hero-count">${session.correct}/${session.queue.length}</div>
          <div class="hero-label">정답 수</div>
          <button class="btn primary big" data-nav="home">홈으로</button>
        </div>
      </main>`;
    root.querySelector("[data-nav='home']").addEventListener("click", () => {
      session = null;
      renderHome();
    });
  }

  // ---------- 통계 ----------
  function renderStats() {
    const totalCards = PRECEDENTS.length;
    const learned = PRECEDENTS.filter((c) => STORE.getCardState(state, c.id).repetition > 0).length;

    const days = [...Array(7)].map((_, i) => SRS.todayISO(-6 + i));
    const counts = days.map(
      (d) => state.history.filter((h) => h.date === d).length
    );
    const maxCount = Math.max(1, ...counts);

    let streak = 0;
    for (let i = 0; ; i++) {
      const d = SRS.todayISO(-i);
      if (state.history.some((h) => h.date === d)) streak += 1;
      else break;
    }

    const bars = days
      .map((d, i) => {
        const h = Math.round((counts[i] / maxCount) * 60) + 4;
        const label = d.slice(5);
        return `<div class="bar-col"><div class="bar" style="height:${h}px"></div><div class="bar-label">${label}</div></div>`;
      })
      .join("");

    const { topics, qtypes } = reviewStats();
    const typeLabel = { ox: "OX", blank: "빈칸", case: "사례형" };

    const weakRow = (label, v) => {
      const pct = Math.round(v.accuracy * 100);
      return `
        <div class="weak-row">
          <div class="weak-label">${label}</div>
          <div class="weak-bar-track"><div class="weak-bar-fill" style="width:${pct}%"></div></div>
          <div class="weak-pct">${pct}% (${v.correct}/${v.total})</div>
        </div>`;
    };

    const topicRows = topics.length
      ? topics.map((t) => weakRow(`${t.subject} · ${t.topic}`, t)).join("")
      : `<p class="empty-notice">아직 학습 기록이 없습니다.</p>`;

    const typeRows = qtypes.length
      ? qtypes.map((t) => weakRow(typeLabel[t.type] || t.type, t)).join("")
      : "";

    const canFocus = topics.length > 0;

    const flagRows = state.flags.length
      ? state.flags
          .map((f) => {
            const c = cardById(f.cardId);
            if (!c) return "";
            return `
              <div class="flag-row">
                <div class="flag-info"><strong>[${c.subject}] ${c.caseNumber}</strong><br>${c.holding}</div>
                <button class="btn small" data-unflag="${c.id}">해제</button>
              </div>`;
          })
          .join("")
      : `<p class="empty-notice">신고한 카드가 없습니다.</p>`;

    root.innerHTML = `
      <header class="topbar">
        <button class="btn ghost" data-nav="home">← 홈</button>
        <h1>통계</h1>
      </header>
      <main class="stats">
        <div class="stat-grid">
          <div class="stat-box"><div class="stat-num">${totalCards}</div><div>전체 카드</div></div>
          <div class="stat-box"><div class="stat-num">${learned}</div><div>학습 시작</div></div>
          <div class="stat-box"><div class="stat-num">${streak}</div><div>연속 학습일</div></div>
        </div>
        <h2>최근 7일 복습 활동</h2>
        <div class="bar-chart">${bars}</div>
        <h2>주제별 정답률 (낮은 순)</h2>
        <div class="weak-list">${topicRows}</div>
        <h2>문제 유형별 정답률</h2>
        <div class="weak-list">${typeRows}</div>
        <button class="btn primary big" data-nav="weak" ${canFocus ? "" : "disabled"}>약점 집중 학습 시작</button>
        <h2>신고한 카드 (${state.flags.length})</h2>
        <div class="flag-list">${flagRows}</div>
        ${state.flags.length ? `<button class="btn ghost small" data-copy-flags>신고 목록 복사하기</button>` : ""}
      </main>`;

    root.querySelector("[data-nav='home']").addEventListener("click", renderHome);
    root.querySelector("[data-nav='weak']").addEventListener("click", startWeakSession);
    root.querySelectorAll("[data-unflag]").forEach((btn) => {
      btn.addEventListener("click", () => {
        STORE.toggleFlag(state, btn.dataset.unflag);
        renderStats();
      });
    });
    const copyBtn = root.querySelector("[data-copy-flags]");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        const text = state.flags
          .map((f) => {
            const c = cardById(f.cardId);
            return c ? `${c.id} | [${c.subject}] ${c.caseNumber}\n${c.holding}` : f.cardId;
          })
          .join("\n\n");
        navigator.clipboard
          .writeText(text)
          .then(() => {
            copyBtn.textContent = "복사됨!";
            setTimeout(() => {
              copyBtn.textContent = "신고 목록 복사하기";
            }, 1500);
          })
          .catch(() => {
            copyBtn.textContent = "복사 실패 (수동으로 캡처해주세요)";
          });
      });
    }
  }

  renderHome();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("SW 등록 실패", e));
    });
  }
})();
