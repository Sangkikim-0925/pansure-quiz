// localStorage 래퍼 - 카드별 SRS 상태 + 학습 기록 영속화
const STORE = (() => {
  const KEY = "pansure-quiz-v1";

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { cards: {}, history: [], flags: [] };
      const parsed = JSON.parse(raw);
      return { cards: parsed.cards || {}, history: parsed.history || [], flags: parsed.flags || [] };
    } catch (e) {
      console.warn("저장된 데이터를 불러오지 못했습니다. 초기화합니다.", e);
      return { cards: {}, history: [], flags: [] };
    }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function getCardState(state, cardId) {
    return state.cards[cardId] || SRS.initialState();
  }

  function setCardState(state, cardId, cardState) {
    state.cards[cardId] = cardState;
    save(state);
  }

  function recordReview(state, cardId, grade, extra = {}) {
    state.history.push({
      cardId,
      grade,
      correct: !!extra.correct,
      qtype: extra.qtype || null,
      date: SRS.todayISO(0),
      ts: Date.now()
    });
    save(state);
  }

  function isFlagged(state, cardId) {
    return state.flags.some((f) => f.cardId === cardId);
  }

  function toggleFlag(state, cardId) {
    const idx = state.flags.findIndex((f) => f.cardId === cardId);
    if (idx >= 0) {
      state.flags.splice(idx, 1);
    } else {
      state.flags.push({ cardId, date: SRS.todayISO(0), ts: Date.now() });
    }
    save(state);
  }

  return { load, save, getCardState, setCardState, recordReview, isFlagged, toggleFlag };
})();
