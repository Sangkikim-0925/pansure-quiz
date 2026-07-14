// 오류 신고를 개발자의 구글 시트로 자동 전송하는 모듈 (Google Apps Script 웹앱 연동).
//
// 사용법: 아래 REPORT_ENDPOINT에 Apps Script 배포 URL(/exec로 끝남)을 붙여넣으면 활성화됩니다.
//         빈 문자열이면 아무 것도 전송하지 않고, 기존처럼 기기 내 신고 목록만 사용합니다.
//         서버 쪽 코드와 배포 방법은 apps-script/Code.gs 와 README를 참고하세요.
//
// 동작 방식:
//  - 신고/신고취소가 일어나면 일단 localStorage 큐에 쌓고 곧바로 전송을 시도합니다.
//  - 오프라인이거나 전송에 실패하면 큐에 남겨뒀다가, 앱을 다시 열거나 온라인 상태가
//    되면(online 이벤트) 자동으로 재전송합니다.
//  - Apps Script는 정적 사이트에 CORS 응답 헤더를 주지 않으므로 no-cors 모드로 보냅니다.
//    응답 본문은 읽을 수 없지만, 전송 자체의 성공/실패(네트워크)는 판별됩니다.
const REPORT = (() => {
  const REPORT_ENDPOINT = "https://script.google.com/macros/s/AKfycbwmiwPJr6rnXd5E3rt-GvnoXVaq2F5cWki4__6mq63Zho8jhVw6wJzQtjwcXOyUvBR4/exec";
  const QUEUE_KEY = "pansure_report_queue_v1";
  const DEVICE_KEY = "pansure_device_id";

  // 어느 기기에서 온 신고인지 구분하기 위한 익명 식별자 (개인정보 아님)
  function deviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function loadQueue() {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveQueue(q) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  }

  function enabled() {
    return REPORT_ENDPOINT.length > 0;
  }

  function submit(card, action) {
    if (!enabled()) return;
    const q = loadQueue();
    q.push({
      ts: new Date().toISOString(),
      action, // "신고" | "신고취소"
      cardId: card.id,
      subject: card.subject,
      level: card.level || "기본",
      caseNumber: card.caseNumber,
      holding: card.holding,
      deviceId: deviceId()
    });
    saveQueue(q);
    flush();
  }

  let flushing = false;
  async function flush() {
    if (!enabled() || flushing || !navigator.onLine) return;
    flushing = true;
    try {
      let q = loadQueue();
      while (q.length > 0) {
        await fetch(REPORT_ENDPOINT, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify(q[0])
        });
        q = q.slice(1);
        saveQueue(q);
      }
    } catch (e) {
      // 전송 실패: 큐에 남은 항목은 다음 접속/온라인 전환 시 재시도
    } finally {
      flushing = false;
    }
  }

  window.addEventListener("online", flush);
  flush(); // 앱 시작 시 밀린 신고 재전송

  return {
    submit,
    flush,
    enabled,
    pendingCount: () => loadQueue().length
  };
})();
