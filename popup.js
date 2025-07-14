// ポップアップのJavaScript
document.addEventListener('DOMContentLoaded', function() {
  const settingsForm = document.getElementById('settingsForm');
  const apiKeyInput = document.getElementById('apiKey');
  const modelSelect = document.getElementById('modelSelect');
  const testBtn = document.getElementById('testBtn');
  const statusMessage = document.getElementById('statusMessage');
  const historyBtn = document.getElementById('historyBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const historySection = document.getElementById('historySection');
  const closeHistoryBtn = document.getElementById('closeHistoryBtn');
  const historyContent = document.getElementById('historyContent');
  const openShortcutSettings = document.getElementById('openShortcutSettings');

  chrome.storage.sync.get(['geminiApiKey', 'geminiModel'], function(result) {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
    if (result.geminiModel) {
      modelSelect.value = result.geminiModel;
    } else {
      modelSelect.value = 'gemini-2.5-flash';
    }
  });

  settingsForm.addEventListener('submit', function(e) {
    e.preventDefault();

    const apiKey = apiKeyInput.value.trim();
    const selectedModel = modelSelect.value;

    if (!apiKey) {
      showMessage('APIキーを入力してください', 'error');
      return;
    }

    chrome.storage.sync.set({
      geminiApiKey: apiKey,
      geminiModel: selectedModel
    }, function() {
      showMessage('設定が保存されました', 'success');
    });
  });

  testBtn.addEventListener('click', async function() {
    const apiKey = apiKeyInput.value.trim();
    const selectedModel = modelSelect.value;

    if (!apiKey) {
      showMessage('APIキーを入力してください', 'error');
      return;
    }

    testBtn.disabled = true;
    testBtn.textContent = 'テスト中...';

    try {
      const isValid = await testApiKey(apiKey, selectedModel);
      if (isValid) {
        showMessage('APIキーが有効です', 'success');
      } else {
        showMessage('APIキーが無効です', 'error');
      }
    } catch (error) {
      showMessage(`テストエラー: ${error.message}`, 'error');
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = 'テスト';
    }
  });

  function showMessage(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';
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
  historyBtn.addEventListener('click', async function() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getHistory', limit: 20 });
      if (response.success) {
        window.displayHistory(response.history);
        historySection.style.display = 'block';
      } else {
        showMessage('履歴の取得に失敗しました', 'error');
      }
    } catch (error) {
      showMessage(`履歴取得エラー: ${error.message}`, 'error');
    }
  });

  // 履歴クリアボタンのイベントリスナー
  clearHistoryBtn.addEventListener('click', async function() {
    if (confirm('翻訳履歴をすべて削除しますか？')) {
      try {
        const response = await chrome.runtime.sendMessage({ action: 'clearHistory' });
        if (response.success) {
          showMessage('履歴をクリアしました', 'success');
          historyContent.innerHTML = '<p style="text-align: center; color: #666; font-size: 12px;">履歴がありません</p>';
        } else {
          showMessage('履歴のクリアに失敗しました', 'error');
        }
      } catch (error) {
        showMessage(`履歴クリアエラー: ${error.message}`, 'error');
      }
    }
  });

  // 履歴を閉じるボタンのイベントリスナー
  closeHistoryBtn.addEventListener('click', function() {
    historySection.style.display = 'none';
  });

  // キーボードショートカット設定ボタンのイベントリスナー
  openShortcutSettings.addEventListener('click', function() {
    chrome.tabs.create({
      url: 'chrome://extensions/shortcuts'
    });
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
