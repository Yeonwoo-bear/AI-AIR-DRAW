"use strict";

/* =====================================================================
   에러를 화면에 그대로 띄워주는 디버깅용 배너.
   "Uncaught Error: Script error."처럼 브라우저가 자세한 메시지를 숨기는 경우,
   대부분은 외부(CDN) 스크립트에 crossorigin 속성이 없어서 생기는 현상입니다.
   index.html의 ml5 <script> 태그에 crossorigin="anonymous" 를 넣어두면
   아래 핸들러가 실제 에러 메시지를 받아올 수 있습니다.
===================================================================== */
function showError(title, detail){
  var banner = document.getElementById("errorBanner");
  if(!banner) return;
  banner.innerHTML = "⚠ " + title + (detail ? ("\n" + detail) : "") +
    '<button onclick="this.parentElement.classList.remove(\'visible\')">닫기</button>';
  banner.classList.add("visible");
  console.error(title, detail);
}

window.addEventListener("error", function(e){
  var msg = e.message || "알 수 없는 에러";
  var loc = e.filename ? (e.filename.split("/").pop() + ":" + e.lineno) : "";
  showError("스크립트 에러: " + msg, loc);
});
window.addEventListener("unhandledrejection", function(e){
  showError("처리되지 않은 오류(Promise)", String(e.reason && e.reason.message || e.reason));
});

/* =====================================================================
   메인 앱
===================================================================== */
(function(){

if(typeof ml5 === "undefined"){
  showError(
    "ml5 라이브러리를 불러오지 못했습니다.",
    "인터넷 연결을 확인하거나, 잠시 후 새로고침(F5) 해주세요. (CDN: unpkg.com/ml5)"
  );
  return;
}

/* ===================== 데이터 ===================== */
// [한글표시, 영어라벨] - 영어라벨은 ml5 DoodleNet(QuickDraw 345종) 클래스명과 정확히 일치해야 함
var ANIMALS = [
  ["개미","ant"],["박쥐","bat"],["곰","bear"],["벌","bee"],["새","bird"],["나비","butterfly"],
  ["낙타","camel"],["고양이","cat"],["소","cow"],["게","crab"],["악어","crocodile"],["강아지","dog"],
  ["돌고래","dolphin"],["오리","duck"],["코끼리","elephant"],["물고기","fish"],["플라밍고","flamingo"],
  ["개구리","frog"],["기린","giraffe"],["고슴도치","hedgehog"],["말","horse"],["캥거루","kangaroo"],
  ["사자","lion"],["랍스터","lobster"],["원숭이","monkey"],["모기","mosquito"],["쥐","mouse"],
  ["문어","octopus"],["부엉이","owl"],["판다","panda"],["앵무새","parrot"],["펭귄","penguin"],
  ["돼지","pig"],["토끼","rabbit"],["너구리","raccoon"],["코뿔소","rhinoceros"],["전갈","scorpion"],
  ["바다거북","sea turtle"],["상어","shark"],["양","sheep"],["달팽이","snail"],["뱀","snake"],
  ["거미","spider"],["다람쥐","squirrel"],["백조","swan"],["곰인형","teddy-bear"],["호랑이","tiger"],
  ["고래","whale"],["얼룩말","zebra"]
];

var TIME_LIMIT = 25; // 초
var PINCH_THRESHOLD = 0.42; // 손바닥 크기 대비 엄지-검지 거리 비율 (작을수록 더 꽉 붙여야 그려짐)
var LIVE_GUESS_INTERVAL = 650; // ms

/* ===================== 상태 ===================== */
var state = {
  player: null,          // {nickname, phone, dept}
  word: null,             // [ko, en]
  usedWords: [],
  hands: [],               // 최신 손 인식 결과
  hasInk: false,
  lastPoint: null,
  timerId: null,
  remaining: TIME_LIMIT,
  liveGuessId: null,
  roundActive: false,
  handPoseModel: null,
  classifier: null,
  modelsReady: false
};

/* ===================== 유틸 ===================== */
function $(id){ return document.getElementById(id); }
function show(el){ el.style.display = ""; }
function hide(el){ el.style.display = "none"; }

function showScreen(name){
  document.querySelectorAll(".screen").forEach(function(s){ s.classList.remove("visible"); });
  $("screen-" + name).classList.add("visible");
  $("navPlay").classList.toggle("active", name === "play");
  $("navBoard").classList.toggle("active", name === "board");
  if(name === "board") renderBoard();
  window.scrollTo(0,0);
}

// GitHub Pages 등 일반 웹 배포용: window.storage(Claude 아티팩트 전용 API) 대신
// 브라우저 localStorage를 사용합니다. 이 기기(브라우저)에만 데이터가 저장됩니다.
async function storageGet(key, shared){
  try{
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
async function storageSet(key, value, shared){
  try{ localStorage.setItem(key, JSON.stringify(value)); }
  catch(e){ showError("저장 실패", "랭킹/연락처 저장 중 오류가 발생했습니다: " + e.message); }
}

/* ===================== 등록 화면 ===================== */
$("btnRegister").addEventListener("click", function(){
  var nick = $("inNick").value.trim();
  var phone = $("inPhone").value.trim();
  var dept = $("inDept").value.trim();
  var consent = $("inConsent").checked;
  if(!nick || !phone || !dept || !consent){
    $("regErr").style.display = "block";
    return;
  }
  $("regErr").style.display = "none";
  state.player = { nickname: nick, phone: phone, dept: dept };
  showScreen("play");
  initCameraAndModels();
});

/* ===================== 네비게이션 ===================== */
$("navPlay").addEventListener("click", function(){
  if(!state.player){ showScreen("register"); return; }
  showScreen("play");
});
$("navBoard").addEventListener("click", function(){ showScreen("board"); });
$("btnGoBoard").addEventListener("click", function(){ showScreen("board"); });
$("btnBoardPlay").addEventListener("click", function(){
  showScreen("play");
  resetForNewWord();
});
$("btnPlayAgain").addEventListener("click", function(){
  showScreen("play");
  resetForNewWord();
});

/* ===================== 카메라 + 모델 로딩 ===================== */
var video, skelCanvas, skelCtx, drawCanvas, drawCtx;

async function initCameraAndModels(){
  if(state.modelsReady){ resetForNewWord(); return; }

  video = $("video");
  skelCanvas = $("skelCanvas");
  skelCtx = skelCanvas.getContext("2d");
  drawCanvas = $("drawCanvas");
  drawCtx = drawCanvas.getContext("2d");

  if(location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1"){
    showError(
      "카메라를 쓰려면 https 또는 localhost 에서 열어야 해요.",
      "지금 주소: " + location.protocol + "//" + location.host + "  → VS Code의 Live Server 확장 등을 사용해주세요."
    );
  }

  try{
    var stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    video.srcObject = stream;
    await new Promise(function(resolve){ video.onloadedmetadata = resolve; });
    video.play();
  }catch(e){
    $("camHint").textContent = "카메라 접근이 거부됐어요. 브라우저 주소창의 카메라 권한을 허용해주세요.";
    var spinnerEl = $("camOverlay").querySelector(".spinner");
    if(spinnerEl) spinnerEl.style.display = "none";
    showError("카메라를 열 수 없습니다.", e.name + ": " + e.message);
    return;
  }

  skelCanvas.width = video.videoWidth || 640;
  skelCanvas.height = video.videoHeight || 480;
  drawCanvas.width = video.videoWidth || 640;
  drawCanvas.height = video.videoHeight || 480;
  resetDrawCanvas();

  $("camHint").textContent = "AI 모델을 불러오는 중... (손 추적 + 그림 인식)";

  try{
    state.handPoseModel = ml5.handPose({ maxHands: 1, flipped: false }, function(){
      loadClassifierThenFinish();
    });
    state.handPoseModel.detectStart(video, function(results){
      state.hands = results || [];
    });
  }catch(e){
    showError("손 인식 모델(handPose) 로딩 실패", e.message);
  }
}

function loadClassifierThenFinish(){
  try{
    state.classifier = ml5.imageClassifier("DoodleNet", function(){
      state.modelsReady = true;
      hide($("camOverlay"));
      requestAnimationFrame(renderLoop);
      resetForNewWord();
    });
  }catch(e){
    showError("그림 인식 모델(DoodleNet) 로딩 실패", e.message);
  }
}

/* ===================== 손 스켈레톤 렌더 + 커서/핀치 ===================== */
var HAND_LINES = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17]
];

function findKp(hand, name){
  for(var i=0;i<hand.keypoints.length;i++){ if(hand.keypoints[i].name === name) return hand.keypoints[i]; }
  return hand.keypoints[0];
}

function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }

function renderLoop(){
  skelCtx.clearRect(0,0,skelCanvas.width, skelCanvas.height);
  var hand = state.hands && state.hands[0];
  var pinching = false;
  var tip = null;

  if(hand && hand.keypoints && hand.keypoints.length >= 21){
    skelCtx.strokeStyle = "rgba(124,92,255,0.85)";
    skelCtx.lineWidth = 3;
    HAND_LINES.forEach(function(pair){
      var a = hand.keypoints[pair[0]], b = hand.keypoints[pair[1]];
      if(!a||!b) return;
      skelCtx.beginPath();
      skelCtx.moveTo(a.x,a.y);
      skelCtx.lineTo(b.x,b.y);
      skelCtx.stroke();
    });
    hand.keypoints.forEach(function(k){
      skelCtx.beginPath();
      skelCtx.fillStyle = "#ffb84d";
      skelCtx.arc(k.x,k.y,4,0,Math.PI*2);
      skelCtx.fill();
    });

    var thumbTip = findKp(hand, "thumb_tip");
    var indexTip = findKp(hand, "index_finger_tip");
    var wrist = findKp(hand, "wrist");
    var midMcp = findKp(hand, "middle_finger_mcp");
    var palmSize = Math.max(dist(wrist, midMcp), 20);
    var pinchRatio = dist(thumbTip, indexTip) / palmSize;
    pinching = pinchRatio < PINCH_THRESHOLD;
    tip = indexTip;

    skelCtx.beginPath();
    skelCtx.arc(tip.x, tip.y, 16, 0, Math.PI*2);
    skelCtx.fillStyle = pinching ? "rgba(255,184,77,0.9)" : "rgba(124,92,255,0.35)";
    skelCtx.fill();
    skelCtx.lineWidth = 2;
    skelCtx.strokeStyle = pinching ? "#ffb84d" : "#7c5cff";
    skelCtx.stroke();

    $("pinchHint").style.opacity = "0.55";
  } else {
    $("pinchHint").style.opacity = "1";
  }

  if(state.roundActive){
    handleDrawing(pinching, tip);
  }

  requestAnimationFrame(renderLoop);
}

/* ===================== 그리기 로직 ===================== */
function resetDrawCanvas(){
  drawCtx.fillStyle = "#ffffff";
  drawCtx.fillRect(0,0,drawCanvas.width, drawCanvas.height);
  state.hasInk = false;
}

function handleDrawing(pinching, tip){
  if(!tip) { state.lastPoint = null; return; }
  // draw-pane 은 거울 반전 안 되어 있으므로, cam-pane 과 좌우 감각을 맞추기 위해 x 를 반전
  var dx = drawCanvas.width - tip.x;
  var dy = tip.y;

  if(pinching){
    drawCtx.strokeStyle = "#111";
    drawCtx.lineWidth = 9;
    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";
    if(state.lastPoint){
      drawCtx.beginPath();
      drawCtx.moveTo(state.lastPoint.x, state.lastPoint.y);
      drawCtx.lineTo(dx, dy);
      drawCtx.stroke();
    } else {
      drawCtx.beginPath();
      drawCtx.arc(dx,dy,4.5,0,Math.PI*2);
      drawCtx.fillStyle = "#111";
      drawCtx.fill();
    }
    state.lastPoint = { x: dx, y: dy };
    state.hasInk = true;
  } else {
    state.lastPoint = null;
  }
}

/* ===================== 라운드 흐름 ===================== */
function pickWord(){
  var pool = ANIMALS.filter(function(w){ return state.usedWords.indexOf(w[1]) === -1; });
  if(pool.length === 0){ state.usedWords = []; pool = ANIMALS.slice(); }
  var w = pool[Math.floor(Math.random()*pool.length)];
  state.usedWords.push(w[1]);
  return w;
}

function resetForNewWord(){
  state.word = pickWord();
  $("wcLabel").textContent = "제시어";
  $("wcWord").textContent = "?";
  hide($("timerWrap"));
  hide($("playbtnsDraw"));
  show($("playbtnsPre"));
  $("btnPickWord").textContent = "\"" + state.word[0] + "\" 그리기 시작";
  $("btnPickWord").disabled = !state.modelsReady;
  $("guessLive").innerHTML = "";
  resetDrawCanvas();
  state.roundActive = false;
  clearInterval(state.liveGuessId);
}

$("btnPickWord").addEventListener("click", function(){
  startCountdown();
});

function startCountdown(){
  hide($("playbtnsPre"));
  show($("countdownWrap"));
  var n = 3;
  $("countdownNum").textContent = n;
  var id = setInterval(function(){
    n--;
    if(n <= 0){
      clearInterval(id);
      hide($("countdownWrap"));
      beginRound();
    } else {
      $("countdownNum").textContent = n;
    }
  }, 700);
}

function beginRound(){
  $("wcLabel").textContent = "이걸 그려보세요";
  $("wcWord").textContent = state.word[0];
  resetDrawCanvas();
  show($("timerWrap"));
  show($("playbtnsDraw"));
  state.roundActive = true;
  state.remaining = TIME_LIMIT;
  updateTimerUI();

  state.timerId = setInterval(function(){
    state.remaining -= 1;
    updateTimerUI();
    if(state.remaining <= 0){
      clearInterval(state.timerId);
      finishRound();
    }
  }, 1000);

  state.liveGuessId = setInterval(liveGuess, LIVE_GUESS_INTERVAL);
}

function updateTimerUI(){
  $("timerNum").textContent = state.remaining;
  $("timerFill").style.width = Math.max(0, (state.remaining/TIME_LIMIT)*100) + "%";
}

function liveGuess(){
  if(!state.hasInk || !state.classifier) return;
  state.classifier.classify(drawCanvas, function(err, results){
    if(err || !results) return;
    var top3 = results.slice(0,3);
    $("guessLive").innerHTML = top3.map(function(r){
      var ko = enToKo(r.label);
      var pct = Math.round(r.confidence*100);
      return '<div class="guessrow"><div class="gname">' + ko + '</div><div class="guessbar"><i style="width:' + pct + '%"></i></div><div class="gpct mono">' + pct + '%</div></div>';
    }).join("");
  });
}

function enToKo(label){
  for(var i=0;i<ANIMALS.length;i++){ if(ANIMALS[i][1] === label) return ANIMALS[i][0]; }
  return label;
}

$("btnClear").addEventListener("click", function(){ resetDrawCanvas(); $("guessLive").innerHTML=""; });
$("btnSubmit").addEventListener("click", function(){ clearInterval(state.timerId); finishRound(); });

function finishRound(){
  state.roundActive = false;
  clearInterval(state.liveGuessId);
  hide($("playbtnsDraw"));

  var timeUsed = TIME_LIMIT - Math.max(0,state.remaining);

  if(!state.hasInk || !state.classifier){
    showResult([], timeUsed);
    return;
  }
  state.classifier.classify(drawCanvas, function(err, results){
    if(err || !results) results = [];
    showResult(results, timeUsed);
  });
}

/* ===================== 결과 & 채점 ===================== */
function showResult(results, timeUsed){
  var targetEn = state.word[1];
  var rank = -1, targetConf = 0;
  results.forEach(function(r, i){
    if(r.label === targetEn){ rank = i; targetConf = r.confidence; }
  });
  var correct = rank === 0;
  var speedScore = correct ? Math.round(((TIME_LIMIT - timeUsed)/TIME_LIMIT) * 500) : 0;
  var confScore = Math.round(targetConf * 500);
  var total = speedScore + confScore;

  $("rVerdict").textContent = correct ? "\uD83C\uDF89 정답이에요!" : "아쉬워요, 다시 도전해보세요";
  $("rVerdict").className = "verdict " + (correct ? "correct" : "wrong");
  $("rSub").textContent = correct
    ? "AI가 \"" + state.word[0] + "\"(을)를 " + Math.round(targetConf*100) + "% 확신으로 맞혔어요."
    : "AI는 \"" + state.word[0] + "\"(을)를 " + (rank>=0 ? (rank+1)+"번째 후보(" + Math.round(targetConf*100) + "%)" : "후보에 올리지 못했어요") + "로 봤어요.";

  $("rSnap").src = drawCanvas.toDataURL("image/png");
  $("rTotal").textContent = total;
  $("rSpeed").textContent = speedScore + " / 500";
  $("rConf").textContent = confScore + " / 500";

  var top5 = results.slice(0,5);
  $("rTop5").innerHTML = top5.map(function(r,i){
    var hit = r.label === targetEn;
    var pct = Math.round(r.confidence*100);
    return '<div class="t5row ' + (hit?"hit":"") + '"><div class="rank mono">' + (i+1) + '</div><div class="name">' + enToKo(r.label) + '</div><div class="bar"><i style="width:' + pct + '%"></i></div><div class="pct mono">' + pct + '%</div></div>';
  }).join("") || '<div class="hint">인식 결과가 없어요. 조금 더 크게 그려보세요.</div>';

  saveScore(state.word[0], total, correct);
  showScreen("result");
}

/* ===================== 저장 (리더보드 + 연락처) ===================== */
async function saveScore(word, score, correct){
  var lb = (await storageGet("leaderboard-data", true)) || [];
  var key = state.player.nickname + "__" + state.player.dept;
  var existing = lb.find(function(e){ return e.key === key; });
  if(existing){
    if(score > existing.score){ existing.score = score; existing.word = word; existing.correct = correct; existing.ts = Date.now(); }
  } else {
    lb.push({ key: key, nickname: state.player.nickname, dept: state.player.dept, score: score, word: word, correct: correct, ts: Date.now() });
  }
  lb.sort(function(a,b){ return b.score - a.score; });
  lb = lb.slice(0, 200);
  await storageSet("leaderboard-data", lb, true);

  var contacts = (await storageGet("contacts-data", false)) || [];
  var c = contacts.find(function(e){ return e.key === key; });
  if(c){
    c.phone = state.player.phone;
    if(score > c.score) c.score = score;
  } else {
    contacts.push({ key: key, nickname: state.player.nickname, dept: state.player.dept, phone: state.player.phone, score: score });
  }
  await storageSet("contacts-data", contacts, false);
}

async function renderBoard(){
  var lb = (await storageGet("leaderboard-data", true)) || [];
  lb.sort(function(a,b){ return b.score - a.score; });
  var top = lb.slice(0,20);
  var rows = ['<div class="brow head"><div>순위</div><div>닉네임 · 학과</div><div class="dept-col"></div><div style="text-align:right;">점수</div></div>'];
  if(top.length === 0){
    rows.push('<div class="empty">아직 기록이 없어요. 첫 번째 도전자가 되어보세요!</div>');
  } else {
    var myKey = state.player ? (state.player.nickname + "__" + state.player.dept) : null;
    top.forEach(function(e,i){
      rows.push(
        '<div class="brow ' + (e.key===myKey?"me":"") + '">' +
          '<div class="rk ' + (i===0?"top1":"") + '">' + (i+1) + '</div>' +
          '<div class="nm"><b>' + escapeHtml(e.nickname) + '</b><span>' + escapeHtml(e.dept) + '</span></div>' +
          '<div class="dept-col"></div>' +
          '<div class="sc">' + e.score + '</div>' +
        '</div>'
      );
    });
  }
  $("boardList").innerHTML = rows.join("");
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];
  });
}

/* ===================== 관리자(연락처) 모달 ===================== */
$("adminLink").addEventListener("click", async function(){
  var contacts = (await storageGet("contacts-data", false)) || [];
  contacts.sort(function(a,b){ return b.score - a.score; });
  if(contacts.length === 0){
    show($("adminEmpty")); hide($("adminTable"));
  } else {
    hide($("adminEmpty")); show($("adminTable"));
    $("adminBody").innerHTML = contacts.map(function(c){
      return "<tr><td>" + escapeHtml(c.nickname) + "</td><td>" + escapeHtml(c.dept) + "</td><td>" + escapeHtml(c.phone) + "</td><td>" + c.score + "</td></tr>";
    }).join("");
  }
  $("adminModal").classList.add("visible");
  window._contactsCache = contacts;
});
$("btnCloseAdmin").addEventListener("click", function(){ $("adminModal").classList.remove("visible"); });
$("btnCopyContacts").addEventListener("click", async function(){
  var contacts = window._contactsCache || [];
  var tsv = "닉네임\t학과\t전화번호\t최고점수\n" + contacts.map(function(c){
    return c.nickname + "\t" + c.dept + "\t" + c.phone + "\t" + c.score;
  }).join("\n");
  try{
    await navigator.clipboard.writeText(tsv);
    $("btnCopyContacts").textContent = "복사됨!";
    setTimeout(function(){ $("btnCopyContacts").textContent = "표 형식으로 복사"; }, 1500);
  }catch(e){
    alert(tsv);
  }
});

})();
