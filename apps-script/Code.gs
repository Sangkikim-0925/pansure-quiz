// 판례암기 앱 오류 신고 수집용 Google Apps Script.
// 이 파일 내용을 구글 스프레드시트의 확장 프로그램 → Apps Script 편집기에 붙여넣고
// 웹 앱으로 배포하세요 (자세한 순서는 README의 "신고 자동 수집" 절 참고).

const SHEET_NAME = "신고내역";

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(["수신시각", "신고시각", "동작", "카드ID", "과목", "난이도", "사건번호", "판시요지", "기기ID"]);
    }
    sheet.appendRow([
      new Date(),
      data.ts || "",
      data.action || "",
      data.cardId || "",
      data.subject || "",
      data.level || "",
      data.caseNumber || "",
      data.holding || "",
      data.deviceId || ""
    ]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(
      ContentService.MimeType.JSON
    );
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(
      ContentService.MimeType.JSON
    );
  }
}

// 배포 확인용: 브라우저로 /exec URL을 열면 이 문구가 보이면 정상
function doGet() {
  return ContentService.createTextOutput("판례암기 신고 수집 엔드포인트가 동작 중입니다.");
}
