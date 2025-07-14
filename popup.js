// ポップアップのJavaScript
document.addEventListener('DOMContentLoaded', function() {
  // DOM要素を一括取得
  const elements = {
    settingsForm: document.getElementById('settingsForm'),
    apiKeyInput: document.getElementById('apiKey'),
    modelSelect: document.getElementById('modelSelect'),
    testBtn: document.getElementById('testBtn'),
    statusMessage: document.getElementById('statusMessage'),
    historyBtn: document.getElementById('historyBtn'),
    clearHistoryBtn: document.getElementById('clearHistoryBtn'),
    historySection: document.getElementById('historySection'),
    closeHistoryBtn: document.getElementById('closeHistoryBtn'),
    historyContent: document.getElementById('historyContent'),
    openShortcutSettings: document.getElementById('openShortcutSettings')
  };

  // 設定を読み込み
  chrome.storage.sync.get(['geminiApiKey', 'geminiModel'], (result) => {
    elements.apiKeyInput.value = result.geminiApiKey || '';
    elements.modelSelect.value = result.geminiModel || 'gemini-2.5-flash';
  });

  elements.settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const apiKey = elements.apiKeyInput.value.trim();
    const selectedModel = elements.modelSelect.value;

    if (!apiKey) {
      showMessage('APIキーを入力してください', 'error');
      return;
    }

    chrome.storage.sync.set({
      geminiApiKey: apiKey,
      geminiModel: selectedModel
    }, () => showMessage('設定が保存されました', 'success'));
  });

  elements.testBtn.addEventListener('click', async () => {
    const apiKey = elements.apiKeyInput.value.trim();
    const selectedModel = elements.modelSelect.value;

    if (!apiKey) {
      showMessage('APIキーを入力してください', 'error');
      return;
    }

    elements.testBtn.disabled = true;
    elements.testBtn.textContent = 'テスト中...';

    try {
      const isValid = await testApiKey(apiKey, selectedModel);
      showMessage(isValid ? 'APIキーが有効です' : 'APIキーが無効です', isValid ? 'success' : 'error');
    } catch (error) {
      showMessage(`テストエラー: ${error.message}`, 'error');
    } finally {
      elements.testBtn.disabled = false;
      elements.testBtn.textContent = 'テスト';
    }
  });

  function showMessage(message, type) {
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = `status-message ${type}`;
    elements.statusMessage.style.display = 'block';
  }

  async function testApiKey(apiKey, model) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // APIテスト用の簡単なリクエスト
    const testPayload = {
      contents: [{
        parts: [{
          text: "Hello"
        }]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 100
      }
    };
    

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testPayload)
      });
      
      
      if (response.ok) {
        const data = await response.json();
        
        // 簡単なレスポンス検証
        if (data.candidates && data.candidates.length > 0) {
          return true;
        } else {
          console.warn('Test response has no candidates');
          return false;
        }
      } else {
        const errorData = await response.json();
        console.error('Test API error:', errorData);
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  // 履歴表示ボタンのイベントリスナー
  elements.historyBtn.addEventListener('click', async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getHistory', limit: 20 });
      if (response.success) {
        window.displayHistory(response.history);
        elements.historySection.style.display = 'block';
      } else {
        showMessage('履歴の取得に失敗しました', 'error');
      }
    } catch (error) {
      showMessage(`履歴取得エラー: ${error.message}`, 'error');
    }
  });

  // 履歴クリアボタンのイベントリスナー
  elements.clearHistoryBtn.addEventListener('click', async () => {
    if (!confirm('翻訳履歴をすべて削除しますか？')) return;
    
    try {
      const response = await chrome.runtime.sendMessage({ action: 'clearHistory' });
      if (response.success) {
        showMessage('履歴をクリアしました', 'success');
        elements.historyContent.innerHTML = '<p style="text-align: center; color: #666; font-size: 12px;">履歴がありません</p>';
      } else {
        showMessage('履歴のクリアに失敗しました', 'error');
      }
    } catch (error) {
      showMessage(`履歴クリアエラー: ${error.message}`, 'error');
    }
  });

  // 履歴を閉じるボタンのイベントリスナー
  elements.closeHistoryBtn.addEventListener('click', () => {
    elements.historySection.style.display = 'none';
  });

  // キーボードショートカット設定ボタンのイベントリスナー
  elements.openShortcutSettings.addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  // 履歴を表示する関数（グローバルスコープに移動）
  window.displayHistory = function(history) {
    const historyContentElement = document.getElementById('historyContent');
    if (!history || history.length === 0) {
      historyContentElement.innerHTML = '<p style="text-align: center; color: #666; font-size: 12px;">履歴がありません</p>';
      return;
    }

    historyContentElement.innerHTML = history.map(item => {
      const date = new Date(item.timestamp);
      const formattedDate = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
      
      return `
        <div class="history-item">
          <div class="history-item-header">
            <span class="history-item-date">${formattedDate}</span>
            <button class="history-item-delete" data-item-id="${item.id}">削除</button>
          </div>
          <div class="history-item-text">
            <div class="history-original">原文: ${window.escapeHtml(item.originalText.substring(0, 100))}${item.originalText.length > 100 ? '...' : ''}</div>
            <div class="history-translation">翻訳: ${window.escapeHtml(item.translatedText.substring(0, 100))}${item.translatedText.length > 100 ? '...' : ''}</div>
          </div>
        </div>
      `;
    }).join('');
    
    // 削除ボタンのイベントリスナーを設定
    setupHistoryDeleteListeners();
  };

  // 履歴項目を削除する関数（グローバルスコープに配置）
  window.deleteHistoryItem = async function(itemId) {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'deleteHistoryItem', itemId });
      if (response.success) {
        // 履歴を再読み込み
        const historyResponse = await chrome.runtime.sendMessage({ action: 'getHistory', limit: 20 });
        if (historyResponse.success) {
          window.displayHistory(historyResponse.history);
        }
      } else {
        // エラーメッセージを表示
        const statusMessageElement = document.getElementById('statusMessage');
        statusMessageElement.textContent = '履歴項目の削除に失敗しました';
        statusMessageElement.className = 'status-message error';
        statusMessageElement.style.display = 'block';
      }
    } catch (error) {
      // エラーメッセージを表示
      const statusMessageElement = document.getElementById('statusMessage');
      statusMessageElement.textContent = `削除エラー: ${error.message}`;
      statusMessageElement.className = 'status-message error';
      statusMessageElement.style.display = 'block';
    }
  };

  // HTMLエスケープ関数（グローバルスコープに移動）
  window.escapeHtml = function(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  // 履歴削除ボタンのイベントリスナーを設定する関数
  function setupHistoryDeleteListeners() {
    const deleteButtons = document.querySelectorAll('.history-item-delete');
    deleteButtons.forEach(button => {
      button.addEventListener('click', async function() {
        const itemId = this.getAttribute('data-item-id');
        if (itemId) {
          await window.deleteHistoryItem(itemId);
        }
      });
    });
  }
});
