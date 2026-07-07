// 간격반복(SRS) 스케줄링 - SM-2 간소화 버전
const SRS = (() => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  function todayISO(offsetDays = 0) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  function initialState() {
    return {
      repetition: 0,
      interval: 0,
      ease: 2.5,
      due: todayISO(0)
    };
  }

  // grade: "again" | "hard" | "good" | "easy"
  function review(state, grade) {
    const s = { ...state };
    switch (grade) {
      case "again":
        s.repetition = 0;
        s.interval = 0;
        s.ease = Math.max(1.3, s.ease - 0.2);
        break;
      case "hard":
        s.interval = Math.max(1, Math.round(s.interval * 1.2));
        s.ease = Math.max(1.3, s.ease - 0.15);
        s.repetition += 1;
        break;
      case "good":
        if (s.repetition === 0) s.interval = 1;
        else if (s.repetition === 1) s.interval = 6;
        else s.interval = Math.round(s.interval * s.ease);
        s.repetition += 1;
        break;
      case "easy":
        s.interval = Math.round(s.interval * s.ease * 1.3) + 1;
        s.ease = s.ease + 0.15;
        s.repetition += 1;
        break;
      default:
        throw new Error("unknown grade: " + grade);
    }
    s.due = todayISO(s.interval);
    return s;
  }

  function isDue(state) {
    return state.due <= todayISO(0);
  }

  return { initialState, review, isDue, todayISO };
})();
