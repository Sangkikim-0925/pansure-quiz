// localStorage 래퍼 - 카드별 SRS 상태 + 학습 기록 영속화
const STORE = (() => {
  const KEY = "pansure-quiz-v1";

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { cards: {}, history: [] };
      const parsed = JSON.parse(raw);
      return { cards: parsed.cards || {}, history: parsed.history || [] };
    } catch (e) {
      console.warn("저장된 데이터를 불러오지 못했습니다. 초기화합니다.", e);
      return { cards: {}, history: [] };
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

  return { load, save, getCardState, setCardState, recordReview };
})();
