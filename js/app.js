// 앱 로직: 홈 / 퀴즈 / 통계 뷰 렌더링
(() => {
  const root = document.getElementById("app");
  let state = STORE.load();
  let session = null; // { queue: [cardId...], index, subject }
  let currentLevel = "기본"; // "기본" | "심화"

  const cardLevel = (c) => c.level || "기본";
  const SESSION_SIZE = 30; // 한 세션에 제시할 최대 문항 수 (DB 전체와 무관)

  // contrast(단수)와 contrasts(복수)를 합쳐 "그럴듯한 함정 오답" 문장 배열로 반환
  function cardContrasts(card) {
    const list = [];
    if (card.contrast) list.push(card.contrast);
    if (Array.isArray(card.contrasts)) list.push(...card.contrasts);
    return [...new Set(list)];
  }

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

  // 신고 토글 + 개발자 시트로 자동 전송 (REPORT_ENDPOINT 설정 시)
  function toggleFlagAndReport(cardId) {
    STORE.toggleFlag(state, cardId);
    const card = cardById(cardId);
    if (card && typeof REPORT !== "undefined") {
      REPORT.submit(card, STORE.isFlagged(state, cardId) ? "신고" : "신고취소");
    }
  }

  // 오늘 학습 대상을 둘로 분류:
  //  - reviews: 이미 풀어본 적 있고 SRS상 오늘 복습이 도래한 카드
  //  - fresh:   아직 한 번도 풀어보지 않은 카드 (localStorage에 기록 없음)
  function todayPool(subject) {
    const reviews = [];
    const fresh = [];
    for (const c of PRECEDENTS) {
      if (c.practice) continue;
      if (cardLevel(c) !== currentLevel) continue;
      if (subject && subject !== "전체" && c.subject !== subject) continue;
      if (!state.cards[c.id]) {
        fresh.push(c);
      } else if (SRS.isDue(STORE.getCardState(state, c.id))) {
        reviews.push(c);
      }
    }
    return { reviews, fresh };
  }

  function subjectList() {
    return [...new Set(PRECEDENTS.filter((c) => !c.practice && cardLevel(c) === currentLevel).map((c) => c.subject))];
  }

  // recent:true 카드 = law.go.kr 원문 대조로 확인한 최신(2022년 이후) 판례. 기본/심화 구분과 무관하게 취급.
  function recentCards() {
    return PRECEDENTS.filter((c) => c.recent === true).sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  // practice:true 카드 = 실제 판례가 아닌 AI 생성 종합연습문제. SRS/통계에서 완전히 분리.
  function practiceCards() {
    return PRECEDENTS.filter((c) => c.practice === true);
  }

  // ---------- 홈 ----------
  function renderHome() {
    document.onkeydown = null;
    const subjects = subjectList();
    const levelCards = PRECEDENTS.filter((c) => !c.practice && cardLevel(c) === currentLevel);
    const levelLearned = levelCards.filter((c) => !!state.cards[c.id]).length;
    const rows = subjects
      .map((subj) => {
        const total = PRECEDENTS.filter((c) => !c.practice && c.subject === subj && cardLevel(c) === currentLevel).length;
        const pool = todayPool(subj);
        return `
          <div class="subject-row">
            <div class="subject-name">${subj}</div>
            <div class="subject-meta">전체 ${total} · 복습 ${pool.reviews.length} · 새 문제 ${pool.fresh.length}</div>
            <button class="btn small" data-start="${subj}">학습</button>
          </div>`;
      })
      .join("");

    const { reviews, fresh } = todayPool("전체");
    const todayTarget = Math.min(SESSION_SIZE, reviews.length + fresh.length);
    const emptyNotice = subjects.length === 0 ? `<p class="empty-notice">이 난이도에는 아직 카드가 없습니다.</p>` : "";

    root.innerHTML = `
      <header class="topbar">
        <h1>판례암기</h1>
      </header>
      <div class="topbar-actions">
        <button class="btn ghost" data-nav="recent">🆕 최신판례</button>
        <button class="btn ghost" data-nav="practice">🧪 연습문제</button>
        <button class="btn ghost" data-nav="wrongnotes">오답노트</button>
        <button class="btn ghost" data-nav="stats">통계</button>
      </div>
      <div class="level-tabs">
        <button class="tab ${currentLevel === "기본" ? "active" : ""}" data-level="기본">기본 학습</button>
        <button class="tab ${currentLevel === "심화" ? "active" : ""}" data-level="심화">심화 학습</button>
      </div>
      <main class="home">
        <div class="hero">
          <div class="hero-count">${todayTarget}</div>
          <div class="hero-label">오늘의 학습 문항</div>
          <div class="hero-sub">복습 예정 ${reviews.length} · 새 문제 ${fresh.length} 대기 — 한 세션 최대 ${SESSION_SIZE}문항</div>
          <div class="hero-sub">${currentLevel} 전체 ${levelCards.length}장 중 ${levelLearned}장 학습 시작</div>
          <div class="progress-track home-progress"><div class="progress-fill" style="width:${levelCards.length ? Math.round((levelLearned / levelCards.length) * 100) : 0}%"></div></div>
          <button class="btn primary big" data-start="전체" ${todayTarget === 0 ? "disabled" : ""}>오늘 학습 시작 (${todayTarget}문항)</button>
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
    root.querySelector("[data-nav='wrongnotes']").addEventListener("click", renderWrongNotes);
    root.querySelector("[data-nav='recent']").addEventListener("click", renderRecentList);
    root.querySelector("[data-nav='practice']").addEventListener("click", renderPracticeList);
  }

  // ---------- 퀴즈 세션 ----------
  // 세션 구성 원칙: 최대 SESSION_SIZE문항.
  //  - 복습 예정 카드에는 세션의 최대 1/3만 배정하고 나머지는 새 문제로 채워,
  //    "이미 풀어본 문제보다 안 풀어본 문제가 우선" 나오게 한다.
  //  - 새 문제가 부족해지면(막바지) 남는 자리를 복습 카드로 채운다.
  function startSession(subject) {
    const { reviews, fresh } = todayPool(subject);
    const reviewQuota = Math.min(reviews.length, Math.floor(SESSION_SIZE / 3));
    const shuffledReviews = shuffle(reviews);
    const picked = shuffledReviews.slice(0, reviewQuota);
    picked.push(...shuffle(fresh).slice(0, SESSION_SIZE - picked.length));
    if (picked.length < SESSION_SIZE) {
      picked.push(...shuffledReviews.slice(reviewQuota, reviewQuota + (SESSION_SIZE - picked.length)));
    }
    const queue = shuffle(picked).map((c) => c.id);
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
      if (!card || card.practice) continue;

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

    const pool = PRECEDENTS.filter((c) => !c.practice && targets.some((t) => t.subject === c.subject && t.topic === c.topic));
    const queue = shuffle(pool).slice(0, SESSION_SIZE).map((c) => c.id);
    if (queue.length === 0) return;

    session = { queue, index: 0, subject: "약점 집중", correct: 0 };
    renderQuestion();
  }

  // 각 카드의 "가장 최근 채점 결과"가 오답인 카드만 모음 (다시 맞히면 자동으로 목록에서 빠짐)
  function wrongCards() {
    const latestByCard = {};
    for (const h of state.history) {
      if (!latestByCard[h.cardId] || h.ts > latestByCard[h.cardId].ts) {
        latestByCard[h.cardId] = h;
      }
    }
    return Object.entries(latestByCard)
      .filter(([, h]) => h.correct === false)
      .map(([cardId, h]) => ({ card: cardById(cardId), lastWrongAt: h.date }))
      .filter((x) => x.card && !x.card.practice)
      .sort((a, b) => (a.lastWrongAt < b.lastWrongAt ? 1 : -1));
  }

  function startWrongSession() {
    const queue = shuffle(wrongCards().map((x) => x.card.id)).slice(0, SESSION_SIZE);
    if (queue.length === 0) return;
    session = { queue, index: 0, subject: "오답 다시 풀기", correct: 0 };
    renderQuestion();
  }

  function startRecentSession() {
    const queue = shuffle(recentCards().map((c) => c.id)).slice(0, SESSION_SIZE);
    if (queue.length === 0) return;
    session = { queue, index: 0, subject: "최신판례 학습", correct: 0 };
    renderQuestion();
  }

  // ---------- 최신판례 ----------
  function renderRecentList() {
    const recents = recentCards();
    const rows = recents.length
      ? recents
          .map(
            (c) => `
              <div class="flag-row">
                <div class="flag-info">
                  <strong>[${c.subject}] ${c.caseNumber}</strong><br>
                  ${c.holding}<br>
                  ${c.source ? `<a href="${c.source}" target="_blank" rel="noopener" class="source-link">law.go.kr 원문 보기 →</a>` : ""}
                </div>
              </div>`
          )
          .join("")
      : `<p class="empty-notice">아직 최신판례 카드가 없습니다.</p>`;

    root.innerHTML = `
      <header class="topbar">
        <button class="btn ghost" data-nav="home">← 홈</button>
        <h1>🆕 최신판례</h1>
      </header>
      <main class="stats">
        <p class="prompt">국가법령정보센터(law.go.kr) 판례 원문과 대조 확인한 2022년 이후 선고 판례입니다. 각 카드의 링크를 눌러 원문을 직접 확인할 수 있습니다.</p>
        <button class="btn primary big" data-nav="recentsession" ${recents.length === 0 ? "disabled" : ""}>최신판례만 학습 (${recents.length})</button>
        <div class="flag-list">${rows}</div>
      </main>`;

    root.querySelector("[data-nav='home']").addEventListener("click", renderHome);
    const startBtn = root.querySelector("[data-nav='recentsession']");
    if (startBtn) startBtn.addEventListener("click", startRecentSession);
  }

  function startPracticeSession() {
    const queue = shuffle(practiceCards().map((c) => c.id));
    if (queue.length === 0) return;
    session = { queue, index: 0, subject: "연습문제(AI)", correct: 0 };
    renderQuestion();
  }

  // ---------- 연습문제(AI) ----------
  function renderPracticeList() {
    const practices = practiceCards();
    const rows = practices.length
      ? practices
          .map(
            (c) => `
              <div class="flag-row">
                <div class="flag-info">
                  <strong>[${c.subject}]</strong><br>
                  ${c.issue}
                </div>
              </div>`
          )
          .join("")
      : `<p class="empty-notice">아직 연습문제가 없습니다.</p>`;

    root.innerHTML = `
      <header class="topbar">
        <button class="btn ghost" data-nav="home">← 홈</button>
        <h1>🧪 연습문제(AI)</h1>
      </header>
      <main class="stats">
        <p class="prompt">⚠️ 실제 판례가 아니라, 이미 검증된 법리 2개를 엮어 만든 AI 생성 종합사례 연습문제입니다.
        "적중예상문제"가 아니며 실제 2026년 시험 출제를 예측한 것이 아닙니다. 기본/심화 학습·SRS·통계와는
        완전히 분리되어 있습니다.</p>
        <button class="btn primary big" data-nav="practicesession" ${practices.length === 0 ? "disabled" : ""}>연습문제 풀어보기 (${practices.length})</button>
        <div class="flag-list">${rows}</div>
      </main>`;

    root.querySelector("[data-nav='home']").addEventListener("click", renderHome);
    const startBtn = root.querySelector("[data-nav='practicesession']");
    if (startBtn) startBtn.addEventListener("click", startPracticeSession);
  }

  // ---------- 오답노트 ----------
  function renderWrongNotes() {
    const wrongs = wrongCards();
    const rows = wrongs.length
      ? wrongs
          .map(
            ({ card, lastWrongAt }) => `
              <div class="flag-row">
                <div class="flag-info">
                  <strong>[${card.subject}] ${card.caseNumber}</strong> <span class="weak-pct">${lastWrongAt}에 오답</span><br>
                  ${card.holding}
                </div>
                <button class="btn small ${STORE.isFlagged(state, card.id) ? "flagged" : ""}" data-flag="${card.id}">
                  ${STORE.isFlagged(state, card.id) ? "신고됨" : "🚩 신고"}
                </button>
              </div>`
          )
          .join("")
      : `<p class="empty-notice">최근 결과 기준으로 틀린 카드가 없습니다.</p>`;

    root.innerHTML = `
      <header class="topbar">
        <button class="btn ghost" data-nav="home">← 홈</button>
        <h1>오답노트</h1>
      </header>
      <main class="stats">
        <button class="btn primary big" data-nav="wrong" ${wrongs.length === 0 ? "disabled" : ""}>오답 다시 풀기 (${wrongs.length})</button>
        <h2>틀린 카드 목록</h2>
        <div class="flag-list">${rows}</div>
      </main>`;

    root.querySelector("[data-nav='home']").addEventListener("click", renderHome);
    const startBtn = root.querySelector("[data-nav='wrong']");
    if (startBtn) startBtn.addEventListener("click", startWrongSession);
    root.querySelectorAll("[data-flag]").forEach((btn) => {
      btn.addEventListener("click", () => {
        toggleFlagAndReport(btn.dataset.flag);
        renderWrongNotes();
      });
    });
  }

  // 같은 주제 → 같은 과목 → 같은 난이도 순으로 채워, 무관한 오답이 끼어들어
  // 소거법으로 쉽게 풀리는 것을 막는다.
  function pickDistractors(card, count) {
    const level = cardLevel(card);
    const sameBucket = (c) => c.id !== card.id && !!c.practice === !!card.practice;
    const pools = [
      PRECEDENTS.filter((c) => sameBucket(c) && c.subject === card.subject && c.topic === card.topic && cardLevel(c) === level),
      PRECEDENTS.filter((c) => sameBucket(c) && c.subject === card.subject && cardLevel(c) === level),
      PRECEDENTS.filter((c) => sameBucket(c) && cardLevel(c) === level)
    ];
    const picked = [];
    for (const pool of pools) {
      for (const c of shuffle(pool)) {
        if (picked.length >= count) return picked;
        if (!picked.some((p) => p.id === c.id)) picked.push(c);
      }
    }
    return picked;
  }

  function buildQuestion(card) {
    const contrasts = cardContrasts(card);
    const types = ["ox", "blank", "case"];
    if (contrasts.length > 0) types.push("notcase"); // 함정 오답 보유 카드 전용: "틀린 것 고르기"
    const type = types[Math.floor(Math.random() * types.length)];
    const subjLabel = card.practice ? `🧪 연습(AI) · ${card.subject}` : card.recent ? `🆕 ${card.subject}` : card.subject;

    if (type === "ox") {
      const showTrue = Math.random() < 0.5;
      let statement = card.holding;
      let answer = "O";
      if (!showTrue) {
        if (contrasts.length > 0) {
          // 심화: 완전 무관한 판례가 아니라 헷갈리기 쉬운 유사 법리/예외를 오답으로 사용
          statement = contrasts[Math.floor(Math.random() * contrasts.length)];
          answer = "X";
        } else {
          const [other] = pickDistractors(card, 1);
          statement = other ? other.holding : card.holding;
          answer = other ? "X" : "O";
        }
      }
      return {
        type,
        prompt: `[${subjLabel}] ${card.caseNumber}\n다음 판시 취지 설명이 맞는지 O/X로 답하세요.`,
        statement,
        answer,
        reveal: card.holding
      };
    }

    if (type === "blank") {
      const blanked = card.holding.replace(card.keyword, "＿＿＿＿");
      // 정답과 동일하거나 중복된 keyword가 선택지에 끼지 않도록 넉넉히 뽑아 걸러냄
      const distractors = [
        ...new Set(pickDistractors(card, 8).map((c) => c.keyword).filter((k) => k && k !== card.keyword))
      ].slice(0, 3);
      const choices = shuffle([card.keyword, ...distractors]);
      return {
        type,
        prompt: `[${subjLabel}] 빈칸에 들어갈 핵심 단어를 고르세요.`,
        statement: blanked,
        choices,
        answer: card.keyword,
        reveal: card.holding
      };
    }

    if (type === "notcase") {
      // 실제 시험형: 4개의 서술 중 판례와 일치하지 않는 것 1개를 찾기.
      // 오답(=정답 선택지)은 이 카드의 함정 문장, 나머지는 모두 참인 법리.
      const trap = contrasts[Math.floor(Math.random() * contrasts.length)];
      const truths = pickDistractors(card, 2).map((c) => c.holding);
      const choices = shuffle([trap, card.holding, ...truths]);
      return {
        type,
        prompt: `[${subjLabel}] 다음 설명 중 판례의 태도와 일치하지 않는 것은?`,
        statement: "",
        choices,
        answer: trap,
        reveal: `틀린 설명: ${trap}\n\n올바른 법리: ${card.holding}`
      };
    }

    // case (사례형)
    let choices;
    if (contrasts.length > 0) {
      const traps = shuffle(contrasts).slice(0, 2);
      const fillers = pickDistractors(card, 3 - traps.length).map((c) => c.holding);
      choices = shuffle([card.holding, ...traps, ...fillers]);
    } else {
      const distractors = pickDistractors(card, 3).map((c) => c.holding);
      choices = shuffle([card.holding, ...distractors]);
    }
    return {
      type,
      prompt: `[${subjLabel}] 다음 쟁점에 대한 판례의 결론으로 옳은 것은?`,
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
    const progressPct = Math.round((session.index / session.queue.length) * 100);

    let bodyHtml = q.statement ? `<p class="statement">${q.statement.replace(/\n/g, "<br>")}</p>` : "";

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
            .map(
              (c, i) =>
                `<button class="btn choice wide" data-answer="${encodeURIComponent(c)}"><span class="choice-num">${i + 1}</span><span class="choice-text">${c}</span></button>`
            )
            .join("")}
        </div>`;
    }

    root.innerHTML = `
      <header class="topbar">
        <button class="btn ghost" data-nav="home">← 종료</button>
        <span class="progress">${session.subject} · ${progress}</span>
      </header>
      <div class="progress-track"><div class="progress-fill" style="width:${progressPct}%"></div></div>
      <main class="quiz">
        <p class="prompt">${q.prompt.replace(/\n/g, "<br>")}</p>
        <div id="qbody">${bodyHtml}</div>
        <div id="feedback"></div>
      </main>`;

    root.querySelector("[data-nav='home']").addEventListener("click", () => {
      document.onkeydown = null;
      session = null;
      renderHome();
    });

    root.querySelectorAll("[data-answer]").forEach((btn) => {
      btn.addEventListener("click", () => onAnswer(decodeURIComponent(btn.dataset.answer)));
    });

    // 데스크톱용 단축키: 정답 전 O/X·1~4로 선택, 정답 후 1~4로 난이도 평가
    document.onkeydown = (e) => {
      if (!session || !session.current) return;
      const k = e.key.toLowerCase();
      if (!session.current.answered) {
        if (q.type === "ox") {
          if (k === "o") onAnswer("O");
          if (k === "x") onAnswer("X");
        } else if (["1", "2", "3", "4"].includes(k)) {
          const choice = q.choices[Number(k) - 1];
          if (choice !== undefined) onAnswer(choice);
        }
      } else {
        const grades = { 1: "again", 2: "hard", 3: "good", 4: "easy" };
        if (grades[k]) onRate(grades[k]);
      }
    };
  }

  function onAnswer(picked) {
    if (session.current.answered) return;
    session.current.answered = true;
    const { card, q } = session.current;
    const isCorrect = picked === q.answer;
    session.current.isCorrect = isCorrect;
    if (isCorrect) session.correct += 1;
    if (!isCorrect) {
      session.wrongIds = session.wrongIds || [];
      session.wrongIds.push(card.id);
    }

    // 선택지에 정답(초록)·내가 고른 오답(빨강)을 표시해 무엇이 왜 틀렸는지 바로 보이게 함
    document.querySelectorAll("[data-answer]").forEach((b) => {
      b.disabled = true;
      const val = decodeURIComponent(b.dataset.answer);
      if (val === q.answer) b.classList.add(q.type === "notcase" ? "trap-answer" : "correct-choice");
      if (!isCorrect && val === picked) b.classList.add("picked-wrong");
    });

    const contrasts = cardContrasts(card);
    const trapHtml =
      contrasts.length && q.type !== "notcase"
        ? `<div class="trap-box"><strong>⚠️ 함정 주의 — 아래는 헷갈리기 쉬운 '틀린' 서술입니다</strong><ul>${contrasts
            .map((t) => `<li>${t}</li>`)
            .join("")}</ul></div>`
        : "";

    const articlesHtml = (card.articles || []).map((a) => `<span class="chip">${a}</span>`).join("");
    const metaHtml = `<div class="meta-chips"><span class="chip">${card.subject} · ${card.topic}</span>${articlesHtml}</div>`;

    const flagged = STORE.isFlagged(state, card.id);
    const feedback = document.getElementById("feedback");
    feedback.innerHTML = `
      <div class="feedback ${isCorrect ? "correct" : "wrong"}">
        <p>${isCorrect ? "정답입니다." : "오답입니다."}</p>
        <p class="reveal"><strong>${card.caseNumber}</strong><br>${q.reveal.replace(/\n/g, "<br>")}</p>
        ${metaHtml}
      </div>
      ${trapHtml}
      <button class="btn flag ${flagged ? "flagged" : ""}" data-flag="${card.id}">
        ${flagged ? "🚩 신고됨 (취소하기)" : "🚩 이 카드 내용 오류 신고"}
      </button>
      <p class="rating-hint">다음 복습 간격을 정합니다 — 틀렸다면 "다시"를 선택하세요</p>
      <div class="rating-row">
        <button class="btn rate" data-grade="again">다시</button>
        <button class="btn rate" data-grade="hard">어려움</button>
        <button class="btn rate" data-grade="good">좋음</button>
        <button class="btn rate" data-grade="easy">쉬움</button>
      </div>`;

    feedback.scrollIntoView({ behavior: "smooth", block: "nearest" });

    feedback.querySelectorAll("[data-grade]").forEach((btn) => {
      btn.addEventListener("click", () => onRate(btn.dataset.grade));
    });

    feedback.querySelector("[data-flag]").addEventListener("click", (e) => {
      toggleFlagAndReport(card.id);
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
    document.onkeydown = null;
    const total = session.queue.length;
    const pct = Math.round((session.correct / total) * 100);
    const wrongIds = [...new Set(session.wrongIds || [])];

    const recapRows = wrongIds
      .map((id) => {
        const c = cardById(id);
        if (!c) return "";
        return `
          <div class="flag-row">
            <div class="flag-info"><strong>[${c.subject}] ${c.caseNumber}</strong><br>${c.holding}</div>
          </div>`;
      })
      .join("");

    const recapHtml = wrongIds.length
      ? `<h2>이번에 틀린 문제 (${wrongIds.length})</h2>
         <div class="flag-list">${recapRows}</div>
         <button class="btn primary big" data-nav="retry">틀린 문제 바로 다시 풀기 (${wrongIds.length})</button>`
      : `<p class="empty-notice">전부 맞혔습니다! 🎉</p>`;

    root.innerHTML = `
      <header class="topbar"><h1>학습 완료</h1></header>
      <main class="stats">
        <div class="hero">
          <div class="hero-count">${session.correct}/${total}</div>
          <div class="hero-label">정답률 ${pct}%</div>
        </div>
        ${recapHtml}
        <button class="btn big" data-nav="home">홈으로</button>
      </main>`;

    root.querySelector("[data-nav='home']").addEventListener("click", () => {
      session = null;
      renderHome();
    });
    const retryBtn = root.querySelector("[data-nav='retry']");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        session = { queue: shuffle(wrongIds), index: 0, subject: "오답 바로 복습", correct: 0 };
        renderQuestion();
      });
    }
  }

  // ---------- 통계 ----------
  function renderStats() {
    const totalCards = PRECEDENTS.filter((c) => !c.practice).length;
    const learned = PRECEDENTS.filter((c) => !c.practice && STORE.getCardState(state, c.id).repetition > 0).length;

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
    const typeLabel = { ox: "OX", blank: "빈칸", case: "사례형", notcase: "틀린것찾기" };

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

    let reportNote = "";
    if (typeof REPORT !== "undefined" && REPORT.enabled()) {
      const pending = REPORT.pendingCount();
      reportNote = pending
        ? `<p class="prompt">신고 내용은 개발자에게 자동 전송됩니다. 전송 대기 ${pending}건 — 인터넷에 연결되면 자동으로 보내집니다.</p>`
        : `<p class="prompt">신고 내용은 개발자에게 자동 전송됩니다.</p>`;
    }

    const trendRows = Object.entries(EXAM_TRENDS)
      .map(([subj, note]) => `<div class="flag-row"><div class="flag-info"><strong>${subj}</strong><br>${note}</div></div>`)
      .join("");

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
        <h2>과목별 출제경향 메모</h2>
        <p class="prompt">웹 검색으로 확인한 정성적 정보이며 공식 통계가 아닙니다. 참고용으로만 활용하세요.</p>
        <div class="flag-list">${trendRows}</div>
        <h2>주제별 정답률 (낮은 순)</h2>
        <div class="weak-list">${topicRows}</div>
        <h2>문제 유형별 정답률</h2>
        <div class="weak-list">${typeRows}</div>
        <button class="btn primary big" data-nav="weak" ${canFocus ? "" : "disabled"}>약점 집중 학습 시작</button>
        <h2>신고한 카드 (${state.flags.length})</h2>
        ${reportNote}
        <div class="flag-list">${flagRows}</div>
        ${state.flags.length ? `<button class="btn ghost small" data-copy-flags>신고 목록 복사하기</button>` : ""}
      </main>`;

    root.querySelector("[data-nav='home']").addEventListener("click", renderHome);
    root.querySelector("[data-nav='weak']").addEventListener("click", startWeakSession);
    root.querySelectorAll("[data-unflag]").forEach((btn) => {
      btn.addEventListener("click", () => {
        toggleFlagAndReport(btn.dataset.unflag);
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
