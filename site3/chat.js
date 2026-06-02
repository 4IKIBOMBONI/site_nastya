// ============ CHAT GUIDE ============
var chatOpen = false;
var chatVoice = false;
var chatMessages = [];
var chatBusy = false;
var chatSettings = null;

function initChat() {
  loadChatSettings();
  var btn = document.getElementById('guideBtn');
  if (btn) btn.style.display = '';
}

function loadChatSettings() {
  fetch('api/chat/settings').then(function(r) { return r.json(); }).then(function(d) {
    chatSettings = d;
    var idleVid = document.getElementById('chatAvatarIdle');
    var talkVid = document.getElementById('chatAvatarTalking');
    if (d.idle_video && idleVid) idleVid.src = d.idle_video;
    if (d.talking_video && talkVid) talkVid.src = d.talking_video;
    renderQuickButtons();
  }).catch(function() {
    chatSettings = { greeting: 'Здравствуйте! Я виртуальный гид музея СВКИ. Задайте мне вопрос о музее, героях или истории института.', quick_buttons: [] };
  });
}

function toggleChat() {
  chatOpen = !chatOpen;
  var widget = document.getElementById('chatWidget');
  var btn = document.getElementById('guideBtn');
  if (chatOpen) {
    widget.classList.add('active');
    btn.classList.add('hidden');
    if (chatMessages.length === 0) greetUser();
    setAvatarState('idle');
  } else {
    widget.classList.remove('active');
    btn.classList.remove('hidden');
    setAvatarState('off');
  }
}

function greetUser() {
  var greeting = (chatSettings && chatSettings.greeting) ? chatSettings.greeting : 'Здравствуйте! Я виртуальный гид музея СВКИ.';
  setAvatarState('talking');
  addMessage(greeting, 'bot');
  setTimeout(function() {
    setAvatarState('idle');
  }, 3000);
}

function setAvatarState(state) {
  var idle = document.getElementById('chatAvatarIdle');
  var talking = document.getElementById('chatAvatarTalking');
  if (!idle || !talking) return;

  if (state === 'talking') {
    idle.style.display = 'none';
    idle.pause();
    talking.style.display = 'block';
    var p = talking.play();
    if (p && p.catch) p.catch(function(){});
  } else if (state === 'idle') {
    talking.style.display = 'none';
    talking.pause();
    idle.style.display = 'block';
    var p2 = idle.play();
    if (p2 && p2.catch) p2.catch(function(){});
  } else {
    idle.pause();
    talking.pause();
  }
}

function renderQuickButtons() {
  var container = document.getElementById('chatQuick');
  if (!container) return;
  var buttons = (chatSettings && chatSettings.quick_buttons) ? chatSettings.quick_buttons : [];
  if (buttons.length === 0) {
    buttons = [
      { label: 'О музее', prompt: 'Расскажи кратко о музее СВКИ' },
      { label: 'Герои', prompt: 'Какие герои есть в музее?' },
      { label: 'История', prompt: 'Расскажи историю института кратко' },
      { label: 'Что посмотреть?', prompt: 'Что интересного можно посмотреть в музее?' }
    ];
  }
  container.innerHTML = buttons.map(function(b) {
    return '<button class="chat-quick-btn" onclick="sendQuick(\'' + b.prompt.replace(/'/g, "\\'") + '\')">' + escChat(b.label) + '</button>';
  }).join('');
}

function escChat(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function addMessage(text, sender) {
  chatMessages.push({ text: text, sender: sender });
  var container = document.getElementById('chatMessages');
  if (!container) return;

  var div = document.createElement('div');
  div.className = 'chat-msg chat-msg-' + sender;

  if (sender === 'bot') {
    var formatted = text.replace(/\n/g, '<br>');
    var photoMatch = text.match(/\[ФОТО:([^\]]+)\]/);
    if (photoMatch) {
      formatted = formatted.replace(/\[ФОТО:[^\]]+\]/, '<img class="chat-photo" src="' + escChat(photoMatch[1]) + '" onclick="zoomPhoto(this.src)" onerror="this.style.display=\'none\'">');
    }
    div.innerHTML = formatted;
  } else {
    div.textContent = text;
  }

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function showTyping() {
  var container = document.getElementById('chatMessages');
  var div = document.createElement('div');
  div.className = 'chat-msg chat-msg-bot chat-typing';
  div.id = 'chatTyping';
  div.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function hideTyping() {
  var el = document.getElementById('chatTyping');
  if (el) el.remove();
}

function sendChat() {
  var input = document.getElementById('chatInput');
  var text = input.value.trim();
  if (!text || chatBusy) return;
  input.value = '';
  addMessage(text, 'user');
  callChatAPI(text);
}

function sendQuick(prompt) {
  if (chatBusy) return;
  addMessage(prompt, 'user');
  callChatAPI(prompt);
}

function callChatAPI(message) {
  chatBusy = true;
  var sendBtn = document.getElementById('chatSendBtn');
  if (sendBtn) sendBtn.disabled = true;
  showTyping();
  setAvatarState('talking');

  fetch('api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: message, history: chatMessages.slice(-10) })
  }).then(function(r) { return r.json(); }).then(function(d) {
    hideTyping();
    var reply = d.reply || d.error || 'Не удалось получить ответ.';
    addMessage(reply, 'bot');

    if (chatVoice && reply && !d.error) {
      playTTS(reply);
    } else {
      setAvatarState('idle');
    }
  }).catch(function() {
    hideTyping();
    addMessage('Ошибка соединения. Попробуйте позже.', 'bot');
    setAvatarState('idle');
  }).finally(function() {
    chatBusy = false;
    if (sendBtn) sendBtn.disabled = false;
  });
}

function playTTS(text) {
  fetch('api/chat/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text })
  }).then(function(r) {
    if (!r.ok) throw new Error('TTS error');
    return r.blob();
  }).then(function(blob) {
    var url = URL.createObjectURL(blob);
    var audio = new Audio(url);
    audio.addEventListener('ended', function() {
      setAvatarState('idle');
      URL.revokeObjectURL(url);
    });
    audio.addEventListener('error', function() {
      setAvatarState('idle');
    });
    audio.play().catch(function() {
      setAvatarState('idle');
    });
  }).catch(function() {
    if (window.speechSynthesis) {
      var utter = new SpeechSynthesisUtterance(text.substring(0, 500));
      utter.lang = 'ru-RU';
      utter.onend = function() { setAvatarState('idle'); };
      utter.onerror = function() { setAvatarState('idle'); };
      speechSynthesis.speak(utter);
    } else {
      setAvatarState('idle');
    }
  });
}

function toggleChatVoice() {
  chatVoice = !chatVoice;
  var btn = document.getElementById('chatVoiceToggle');
  if (btn) {
    btn.textContent = chatVoice ? '🔊' : '🔇';
    btn.title = chatVoice ? 'Звук включён' : 'Звук выключен';
    btn.classList.toggle('active', chatVoice);
  }
}

function chatInputKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
}
