let translateButton = null;
let isTranslating = false;
let selectionTimeout = null;
let isSelecting = false;

document.addEventListener('mousedown', handleSelectionStart);
document.addEventListener('mouseup', handleSelectionEnd);
document.addEventListener('keyup', handleKeyboardSelection);

document.addEventListener('mousedown', (e) => {
  if (translateButton && !translateButton.contains(e.target)) {
    hideTranslateButton();
  }
});

function handleSelectionStart(e) {
  isSelecting = true;
  hideTranslateButton();

  if (selectionTimeout) {
    clearTimeout(selectionTimeout);
    selectionTimeout = null;
  }
}

function handleSelectionEnd(e) {
  isSelecting = false;

  selectionTimeout = setTimeout(() => {
    if (!isSelecting) {
      checkAndShowButton();
    }
  }, 100);
}

function handleKeyboardSelection(e) {
  if (!isSelecting) {
    if (selectionTimeout) {
      clearTimeout(selectionTimeout);
    }

    selectionTimeout = setTimeout(() => {
      checkAndShowButton();
    }, 200);
  }
}

function checkAndShowButton() {
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  if (selectedText.length >= 3 && selection.rangeCount > 0) {
    showTranslateButton(selection);
  } else {
    hideTranslateButton();
  }
}

function showTranslateButton(selection) {
  hideTranslateButton();

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  translateButton = document.createElement('div');
  translateButton.id = 'gemini-translate-button';
  translateButton.innerHTML = '🌐';
  translateButton.title = 'Geminiで翻訳';

  let left = rect.right + 10;
  let top = rect.top + window.scrollY;

  if (left + 32 > window.innerWidth) {
    left = rect.left - 42;
  }

  if (top < window.scrollY) {
    top = rect.bottom + window.scrollY + 5;
  }

  translateButton.style.position = 'absolute';
  translateButton.style.left = left + 'px';
  translateButton.style.top = top + 'px';
  translateButton.style.zIndex = '10000';

  translateButton.onclick = function(e) {
    e.preventDefault();
    e.stopPropagation();
    translateSelectedText();
  };

  translateButton.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    translateSelectedText();
  }, { capture: true });

  translateButton.addEventListener('mousedown', function(e) {
    e.stopPropagation();
  });

  document.body.appendChild(translateButton);
}

function hideTranslateButton() {
  if (translateButton) {
    translateButton.remove();
    translateButton = null;
  }

  if (selectionTimeout) {
    clearTimeout(selectionTimeout);
    selectionTimeout = null;
  }
}

async function translateSelectedText() {
  if (isTranslating) return;

  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  if (!selectedText) return;

  isTranslating = true;

  if (translateButton) {
    translateButton.innerHTML = '⏳';
    translateButton.style.pointerEvents = 'none';
  }

  showTranslatingPopup(selectedText);

  try {
    if (!chrome || !chrome.runtime) {
      throw new Error('Chrome runtime is not available');
    }

    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'translate',
        text: selectedText
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    if (response && response.success) {
      showTranslationResult(selectedText, response.translation);
    } else {
      showError(response?.error || '翻訳に失敗しました');
    }
  } catch (error) {
    showError('翻訳中にエラーが発生しました: ' + error.message);
  } finally {
    isTranslating = false;
    hideTranslateButton();
  }
}

function showTranslatingPopup(originalText) {
  removeExistingPopups();

  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'gemini-translation-result';
  loadingDiv.innerHTML = `
    <div class="translation-header">
      <span>Gemini翻訳中...</span>
      <button class="close-btn" onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
    <div class="translation-content">
      ${createOriginalTextHtml(originalText)}
      <div class="loading-text">
        <div class="loading-spinner"></div>
        <span>翻訳中です。しばらくお待ちください...</span>
      </div>
    </div>
  `;

  setupPopupClickOutside(loadingDiv);

  document.body.appendChild(loadingDiv);
  
  // テキストトグル機能を設定
  setupTextToggle();
  
  // ドラッグ機能を設定
  setupPopupDrag(loadingDiv);
}

function showTranslationResult(originalText, translatedText) {
  const existingPopup = document.getElementById('gemini-translation-result');

  if (existingPopup) {
    existingPopup.innerHTML = `
      <div class="translation-header">
        <span>Gemini翻訳結果</span>
        <button class="close-btn" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
      <div class="translation-content">
        ${createOriginalTextHtml(originalText)}
        ${createTranslatedTextHtml(translatedText)}
      </div>
    `;
    
    // テキストトグル機能を再設定
    setupTextToggle();
    
    // ドラッグ機能を再設定
    setupPopupDrag(existingPopup);
    
    // コピーボタンを設定
    setupCopyButton();

    setTimeout(() => {
      if (existingPopup.parentNode) {
        existingPopup.remove();
      }
    }, 10000);
  } else {
    const resultDiv = document.createElement('div');
    resultDiv.id = 'gemini-translation-result';
    resultDiv.innerHTML = `
      <div class="translation-header">
        <span>Gemini翻訳結果</span>
        <button class="close-btn" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
      <div class="translation-content">
        ${createOriginalTextHtml(originalText)}
        ${createTranslatedTextHtml(translatedText)}
      </div>
    `;

    setupPopupClickOutside(resultDiv);

    document.body.appendChild(resultDiv);
    
    // テキストトグル機能を設定
    setupTextToggle();
    
    // ドラッグ機能を設定
    setupPopupDrag(resultDiv);
    
    // コピーボタンを設定
    setupCopyButton();
  }
}

function removeExistingPopups() {
  const existingResult = document.getElementById('gemini-translation-result');
  if (existingResult) {
    existingResult.remove();
  }

  const existingError = document.getElementById('gemini-translation-error');
  if (existingError) {
    existingError.remove();
  }
}

function showError(message) {
  const existingPopup = document.getElementById('gemini-translation-result');

  if (existingPopup) {
    existingPopup.innerHTML = `
      <div class="translation-header error-header">
        <span>翻訳エラー</span>
        <button class="close-btn" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
      <div class="translation-content">
        <div class="error-message">
          <span class="error-icon">⚠️</span>
          <span>${escapeHtml(message)}</span>
        </div>
      </div>
    `;
    
    // ドラッグ機能を再設定
    setupPopupDrag(existingPopup);

  } else {
    const errorDiv = document.createElement('div');
    errorDiv.id = 'gemini-translation-result';
    errorDiv.innerHTML = `
      <div class="translation-header error-header">
        <span>翻訳エラー</span>
        <button class="close-btn" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
      <div class="translation-content">
        <div class="error-message">
          <span class="error-icon">⚠️</span>
          <span>${escapeHtml(message)}</span>
        </div>
      </div>
    `;

    setupPopupClickOutside(errorDiv);

    document.body.appendChild(errorDiv);
    
    // ドラッグ機能を設定
    setupPopupDrag(errorDiv);
  }
}

function setupPopupClickOutside(popup) {
  setTimeout(() => {
    const handleOutsideClick = (e) => {
      if (popup && !popup.contains(e.target)) {
        popup.remove();
        document.removeEventListener('click', handleOutsideClick);
      }
    };

    document.addEventListener('click', handleOutsideClick);

    popup.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }, 100);
}

function createOriginalTextHtml(originalText) {
  const isLongText = originalText.length > 100;
  
  if (isLongText) {
    const shortText = originalText.substring(0, 100) + '...';
    return `
      <div class="original-text" id="original-text-container">
        <strong>原文:</strong><br>
        <div class="original-text-content">
          <span id="original-text-short">${escapeHtml(shortText)}</span>
          <span id="original-text-full" style="display: none;">${escapeHtml(originalText)}</span>
        </div>
        <div class="text-toggle" data-action="toggle">もっと読む</div>
      </div>
    `;
  } else {
    return `
      <div class="original-text">
        <strong>原文:</strong><br>
        ${escapeHtml(originalText)}
      </div>
    `;
  }
}

function setupTextToggle() {
  const toggleBtn = document.querySelector('.text-toggle[data-action="toggle"]');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function() {
      const container = document.getElementById('original-text-container');
      const shortText = document.getElementById('original-text-short');
      const fullText = document.getElementById('original-text-full');
      
      if (fullText.style.display === 'none') {
        shortText.style.display = 'none';
        fullText.style.display = 'inline';
        toggleBtn.textContent = '折りたたむ';
        container.classList.add('expanded');
      } else {
        shortText.style.display = 'inline';
        fullText.style.display = 'none';
        toggleBtn.textContent = 'もっと読む';
        container.classList.remove('expanded');
      }
    });
  }
}

function setupPopupDrag(popup) {
  const header = popup.querySelector('.translation-header');
  if (!header) return;
  
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;
  
  header.addEventListener('mousedown', function(e) {
    // 閉じるボタンのクリックは無視
    if (e.target.classList.contains('close-btn')) {
      return;
    }
    
    isDragging = true;
    header.classList.add('dragging');
    
    // マウスの初期位置を記録
    startX = e.clientX;
    startY = e.clientY;
    
    // ポップアップの初期位置を取得
    const rect = popup.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    
    // transformをリセットして絶対位置に変更
    popup.style.transform = 'none';
    popup.style.left = initialLeft + 'px';
    popup.style.top = initialTop + 'px';
    
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    
    // マウスの移動量を計算
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    // 新しい位置を計算
    let newLeft = initialLeft + deltaX;
    let newTop = initialTop + deltaY;
    
    // 画面範囲内に制限
    const popupRect = popup.getBoundingClientRect();
    const maxLeft = window.innerWidth - popupRect.width;
    const maxTop = window.innerHeight - popupRect.height;
    
    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));
    
    // 位置を更新
    popup.style.left = newLeft + 'px';
    popup.style.top = newTop + 'px';
  });
  
  document.addEventListener('mouseup', function() {
    if (isDragging) {
      isDragging = false;
      header.classList.remove('dragging');
    }
  });
  
  // ダブルクリックで中央に戻す
  header.addEventListener('dblclick', function(e) {
    if (e.target.classList.contains('close-btn')) {
      return;
    }
    
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.left = '50%';
    popup.style.top = '50%';
  });
}

function createTranslatedTextHtml(translatedText) {
  const copyId = 'copy-btn-' + Date.now(); // ユニークIDを生成
  return `
    <div class="translated-text">
      <strong>翻訳:</strong>
      <button class="copy-button" data-copy-id="${copyId}" data-text="${escapeHtml(translatedText)}">
        <span class="copy-icon">📋</span>
        <span class="copy-text">コピー</span>
        <div class="copy-tooltip">クリップボードにコピー</div>
      </button>
      <br>
      ${escapeHtml(translatedText)}
    </div>
  `;
}

function setupCopyButton() {
  const copyButtons = document.querySelectorAll('.copy-button[data-copy-id]');
  copyButtons.forEach(button => {
    // 既存のイベントリスナーを削除して重複を防ぐ
    button.removeEventListener('click', handleCopyClick);
    button.addEventListener('click', handleCopyClick);
  });
}

function handleCopyClick(e) {
  e.stopPropagation();
  const button = e.currentTarget;
  const textToCopy = button.getAttribute('data-text');
  
  if (!textToCopy) {
    console.error('No text to copy');
    return;
  }
  
  // HTMLエンティティをデコード
  const decodedText = decodeHtmlEntities(textToCopy);
  
  // クリップボードにコピー
  copyToClipboard(decodedText, button);
}

function decodeHtmlEntities(text) {
  const textArea = document.createElement('textarea');
  textArea.innerHTML = text;
  return textArea.value;
}

async function copyToClipboard(text, button) {
  try {
    // モダンなClipboard APIを使用
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      showCopySuccess(button);
    } else {
      // フォールバック: 古い方法でコピー
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        showCopySuccess(button);
      } else {
        showCopyError(button);
      }
    }
  } catch (err) {
    console.error('Failed to copy text: ', err);
    showCopyError(button);
  }
}

function showCopySuccess(button) {
  const copyText = button.querySelector('.copy-text');
  const copyIcon = button.querySelector('.copy-icon');
  
  // ボタンの表示を変更
  button.classList.add('copied');
  copyIcon.textContent = '✓'; // チェックマーク
  copyText.textContent = 'コピー済み';
  
  // 2秒後に元に戻す
  setTimeout(() => {
    button.classList.remove('copied');
    copyIcon.textContent = '📋'; // クリップボードアイコン
    copyText.textContent = 'コピー';
  }, 2000);
}

function showCopyError(button) {
  const copyText = button.querySelector('.copy-text');
  const copyIcon = button.querySelector('.copy-icon');
  
  // エラー表示
  copyIcon.textContent = '⚠️';
  copyText.textContent = 'エラー';
  
  // 2秒後に元に戻す
  setTimeout(() => {
    copyIcon.textContent = '📋';
    copyText.textContent = 'コピー';
  }, 2000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
